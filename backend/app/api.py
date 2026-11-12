"""All REST endpoints. Contract source of truth: contract/openapi.yaml."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import (alerts, artifacts, bidmc, config, constants, db, escalation,
               fhir_client, notify, pipeline, scenarios, scoring, seed, simulator, sim_engine)

router = APIRouter(prefix="/api")


def _patient_or_404(patient_id: str) -> dict:
    row = db.query_one("SELECT * FROM patients WHERE id=?", (patient_id,))
    if not row:
        raise HTTPException(404, f"patient {patient_id} not found")
    return {
        "id": row["id"], "name": row["name"], "age": row["age"], "gender": row["gender"],
        "dob": row["dob"], "fhir_ref": row["fhir_ref"],
        "conditions": db.loads(row["conditions"]), "medications": db.loads(row["medications"]),
        "risk_flags": db.loads(row["risk_flags"]),
    }


# ---------- meta / health ----------
@router.get("/health")
def health():
    return {"status": "ok", "hapi_fhir": fhir_client.health_check(),
            "hapi_fhir_url": config.HAPI_FHIR_URL, "disclaimer": config.DISCLAIMER}


@router.get("/meta")
def meta():
    return {"service": "DIstoHelp — Post-Discharge Deterioration Monitor",
            "version": "1.0.0", "disclaimer": config.DISCLAIMER,
            "alert_levels": ["watch", "review", "urgent"],
            "loinc_codes": {k: v["display"] for k, v in constants.LOINC.items()},
            "personalization_rules": [
                "SpO2 Scale 2 (target 88-92%) for documented hypercapnic respiratory failure",
                "Per-patient rolling baselines (z-score ≥ 2) detect gradual deterioration",
                "Beta-blocker medication shifts HR NEWS2 thresholds +10 bpm",
                "Symptom check-ins (breathlessness/fever/dizziness) add to the score",
            ],
            "websocket": "/ws/live"}


@router.get("/hapi/status")
def hapi_status():
    return {"hapi_fhir_reachable": fhir_client.health_check(), "hapi_fhir_url": config.HAPI_FHIR_URL,
            "observations_flushed": fhir_client.WORKER.flushed,
            "observations_dropped": fhir_client.WORKER.dropped,
            "write_queue_depth": fhir_client.WORKER.q.qsize()}


# ---------- dashboard ----------
@router.get("/dashboard")
def dashboard():
    rows = db.query("SELECT * FROM patients ORDER BY id")
    out = []
    for r in rows:
        latest = db.query_one(
            "SELECT * FROM scores WHERE patient_id=? ORDER BY id DESC LIMIT 1", (r["id"],))
        active = db.query_one(
            "SELECT COUNT(*) AS n FROM alerts WHERE patient_id=? AND status='active'", (r["id"],))["n"]
        urgent = db.query_one(
            "SELECT COUNT(*) AS n FROM alerts WHERE patient_id=? AND status='active' AND level='urgent'",
            (r["id"],))["n"]
        out.append({
            "id": r["id"], "name": r["name"], "age": r["age"], "gender": r["gender"],
            "conditions": db.loads(r["conditions"]), "risk_flags": db.loads(r["risk_flags"]),
            "latest_score": latest["total"] if latest else None,
            "latest_level": latest["level"] if latest else "none",
            "last_score_at": latest["created_at"] if latest else None,
            "active_alerts": active, "urgent_alerts": urgent,
        })
    return {"patients": out, "disclaimer": config.DISCLAIMER,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}


# ---------- patients (list/detail live in app/compat.py — frontend-shaped supersets) ----------
@router.get("/patients/{patient_id}/vitals")
def patient_vitals(patient_id: str, limit: int = 240):
    _patient_or_404(patient_id)
    limit = min(max(limit, 1), 2000)
    rows = db.query(
        "SELECT loinc, display, value, unit, effective_time, source, artifact, created_at "
        "FROM observations WHERE patient_id=? ORDER BY id DESC LIMIT ?", (patient_id, limit))
    rows.reverse()
    series: dict[str, list] = {}
    for r in rows:
        series.setdefault(r["loinc"], []).append(
            {"t": r["effective_time"], "value": r["value"], "artifact": r["artifact"], "source": r["source"]})
    return {"patient_id": patient_id, "series": series,
            "disclaimer": config.DISCLAIMER}


@router.get("/patients/{patient_id}/score")
def patient_score(patient_id: str):
    _patient_or_404(patient_id)
    return scoring.compute_score(patient_id)


# ---------- FHIR R4 ingestion ----------
@router.post("/fhir/Observation")
def ingest_fhir_observation(obs: dict):
    """Accept FHIR R4 Vital Signs Observation. LOINC: 8867-4, 2708-6, 9279-1, 8310-5."""
    try:
        parsed = pipeline.parse_fhir_observation(obs)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return pipeline.ingest_vital(parsed["patient_id"], parsed["loinc"], parsed["value"], source="fhir")


class VitalIn(BaseModel):
    patient_id: str
    vital: Optional[str] = Field(None, description="heart_rate|respiratory_rate|spo2|temperature")
    loinc: Optional[str] = None
    value: Optional[float] = None  # null allowed (probe removal)


@router.post("/vitals")
def ingest_vital_simple(v: VitalIn):
    _patient_or_404(v.patient_id)
    loinc = v.loinc or constants.VITAL_BY_NAME.get((v.vital or "").lower())
    if not loinc:
        raise HTTPException(422, "provide `loinc` or a known `vital` name")
    return pipeline.ingest_vital(v.patient_id, loinc, v.value, source="device")


class BatchIn(BaseModel):
    readings: list[VitalIn]


@router.post("/vitals/batch")
def ingest_batch(b: BatchIn):
    out = []
    for v in b.readings:
        loinc = v.loinc or constants.VITAL_BY_NAME.get((v.vital or "").lower())
        if not loinc:
            out.append({"error": f"unknown vital {v.vital}", "patient_id": v.patient_id})
            continue
        out.append(pipeline.ingest_vital(v.patient_id, loinc, v.value, source="device"))
    return {"results": out}


# ---------- alerts ----------
@router.get("/alerts")
def get_alerts(patient_id: Optional[str] = None, status: Optional[str] = None, limit: int = 100):
    return {"alerts": alerts.list_alerts(patient_id, status, min(limit, 500)),
            "disclaimer": config.DISCLAIMER}


@router.post("/alerts/{alert_id}/ack")
def ack_alert(alert_id: int):
    if not db.query_one("SELECT id FROM alerts WHERE id=?", (alert_id,)):
        raise HTTPException(404, "alert not found")
    return alerts.set_status(alert_id, "acknowledged")


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int):
    if not db.query_one("SELECT id FROM alerts WHERE id=?", (alert_id,)):
        raise HTTPException(404, "alert not found")
    return alerts.set_status(alert_id, "resolved")


@router.get("/device-events")
def device_events(patient_id: Optional[str] = None, limit: int = 100):
    if patient_id:
        rows = db.query("SELECT * FROM device_events WHERE patient_id=? ORDER BY id DESC LIMIT ?",
                        (patient_id, limit))
    else:
        rows = db.query("SELECT * FROM device_events ORDER BY id DESC LIMIT ?", (limit,))
    return {"device_events": rows}


@router.get("/missing-data")
def missing_data(max_minutes: float = config.MISSING_DATA_MINUTES):
    out = []
    for r in db.query("SELECT id FROM patients"):
        res = artifacts.missing_data_check(r["id"], max_minutes)
        if res:
            _missing_data_alert(r["id"], res["silent_minutes"], max_minutes)
            out.append(res)
    return {"missing": out}


def _missing_data_alert(patient_id: str, silent_minutes: float, threshold: float):
    patient = _patient_or_404(patient_id)
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(minutes=threshold)).isoformat(timespec="seconds")
    dup = db.query_one(
        "SELECT id FROM alerts WHERE patient_id=? AND rule='missing_data' AND created_at>=?",
        (patient_id, since))
    if dup:
        return
    db.execute(
        "INSERT INTO alerts(patient_id,level,rule,reading,profile_fact,explanation,score_total,source,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (patient_id, "watch", "missing_data",
         db.dumps({"display": "Device connectivity", "value": silent_minutes, "unit": "min silent"}),
         "device connectivity, not a clinical signal",
         f"No vital-sign readings received from {patient['name']}'s wearable for {silent_minutes:.0f} minutes "
         f"(threshold {threshold:.0f} min). This indicates a device/connectivity problem, NOT deterioration. "
         f"Please verify the device is on and uploading.",
         None, "missing_data", db.now_iso()),
    )


# ---------- symptom check-in ----------
class CheckIn(BaseModel):
    patient_id: str
    breathlessness: int = Field(0, ge=0, le=2)
    fever: int = Field(0, ge=0, le=1)
    dizziness: int = Field(0, ge=0, le=2)
    notes: Optional[str] = None


@router.post("/checkins")
def submit_checkin(c: CheckIn):
    _patient_or_404(c.patient_id)
    modifier = ({1: 1, 2: 2}.get(c.breathlessness, 0) + c.fever + {1: 1, 2: 2}.get(c.dizziness, 0))
    cur = db.execute(
        "INSERT INTO checkins(patient_id,breathlessness,fever,dizziness,notes,score_modifier,created_at) "
        "VALUES(?,?,?,?,?,?,?)",
        (c.patient_id, c.breathlessness, c.fever, c.dizziness, c.notes, modifier, db.now_iso()),
    )
    score = scoring.compute_score(c.patient_id)
    return {"checkin_id": cur.lastrowid, "score_modifier": modifier, "recomputed_score": score}


@router.get("/checkins/{patient_id}")
def list_checkins(patient_id: str, limit: int = 30):
    _patient_or_404(patient_id)
    return {"checkins": db.query(
        "SELECT * FROM checkins WHERE patient_id=? ORDER BY id DESC LIMIT ?", (patient_id, limit))}


# ---------- escalation ----------
class EscalateIn(BaseModel):
    alert_id: int


@router.post("/escalations")
def escalate(e: EscalateIn):
    try:
        return escalation.escalate_alert(e.alert_id)
    except ValueError as err:
        raise HTTPException(404, str(err))


@router.get("/escalations")
def list_escalations(patient_id: Optional[str] = None, limit: int = 50):
    return {"notifications": escalation.list_notifications(patient_id, limit)}


# ---------- simulator ----------
class SimStart(BaseModel):
    scenario: str = "slow_deterioration"
    rate_per_minute: float = Field(60.0, gt=0)
    seed: int = 42


@router.post("/simulator/{patient_id}/start")
async def simulator_start(patient_id: str, s: SimStart):
    _patient_or_404(patient_id)
    try:
        return simulator.start(patient_id, s.scenario, s.rate_per_minute, s.seed)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.post("/simulator/{patient_id}/stop")
def simulator_stop(patient_id: str):
    return simulator.stop(patient_id)


@router.get("/simulator/status")
def simulator_status():
    return {"simulators": simulator.status(), "scenarios": sim_engine.SCENARIOS}


# ---------- BIDMC replay ----------
@router.get("/bidmc/records")
def bidmc_records():
    return {"records": bidmc.available_records(),
            "dataset": "PhysioNet BIDMC PPG and Respiration 1.0.0",
            "note": "'demo' is a bundled sample; run scripts/download_bidmc.ps1 for the full dataset"}


class ReplayIn(BaseModel):
    record_id: str = "demo"
    patient_id: str
    speed: float = Field(60.0, gt=0, description="playback multiplier; 1 = real-time")
    max_minutes: Optional[float] = None


@router.post("/bidmc/replay")
def bidmc_replay(r: ReplayIn):
    _patient_or_404(r.patient_id)
    try:
        return bidmc.start_replay(r.record_id, r.patient_id, r.speed, r.max_minutes)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.get("/bidmc/status")
def bidmc_status():
    return {"replays": bidmc.replay_status()}


# ---------- scenario replay + performance report ----------
class ScenarioRun(BaseModel):
    scenario: str = "slow_deterioration"
    patient_id: str = "p02"
    n_ticks: int = Field(1440, ge=60, le=10000)
    seed: int = 42


@router.get("/scenarios")
def list_scenarios():
    return {"scenarios": sim_engine.SCENARIOS}


@router.post("/scenarios/run")
def run_scenario(r: ScenarioRun):
    _patient_or_404(r.patient_id)
    try:
        return scenarios.run_scenario(r.scenario, r.patient_id, n_ticks=r.n_ticks, seed=r.seed)
    except ValueError:
        raise HTTPException(422, f"unknown scenario; choose from {sim_engine.SCENARIOS}")


@router.post("/scenarios/evaluate")
def evaluate_all():
    result = scenarios.evaluation_matrix()
    db.execute(
        "INSERT INTO scenario_runs(scenario,patient_id,started_at,summary,report_md,created_at) "
        "VALUES(?,?,?,?,?,?)",
        ("matrix", "all", db.now_iso(), db.dumps(result["aggregate"]), result["report_markdown"], db.now_iso()),
    )
    return result


@router.get("/scenarios/report")
def latest_report():
    row = db.query_one("SELECT * FROM scenario_runs ORDER BY id DESC LIMIT 1")
    if not row:
        return {"report_markdown": None, "hint": "POST /api/scenarios/evaluate first"}
    return {"report_markdown": row["report_md"], "aggregate": db.loads(row["summary"]),
            "created_at": row["created_at"]}


# ---------- emergency contacts + panic ----------
class ContactIn(BaseModel):
    patient_id: str
    name: str = Field(..., min_length=1)
    relation: str = "family"          # spouse | parent | child | friend | doctor | caregiver | family
    phone: str = Field(..., min_length=8, max_length=20)
    via: str = "auto"                 # auto | textbelt | telegram | msg91 | twilio


class ContactPatch(BaseModel):
    name: Optional[str] = None
    relation: Optional[str] = None
    phone: Optional[str] = None
    via: Optional[str] = None
    active: Optional[int] = None


@router.get("/emergency-contacts")
def list_contacts(patient_id: Optional[str] = None):
    if patient_id:
        rows = db.query("SELECT * FROM emergency_contacts WHERE patient_id=? AND active=1 ORDER BY id",
                        (patient_id,))
    else:
        rows = db.query("SELECT * FROM emergency_contacts WHERE active=1 ORDER BY patient_id, id")
    return {"contacts": rows}


@router.post("/emergency-contacts", status_code=201)
def add_contact(c: ContactIn):
    _patient_or_404(c.patient_id)
    if c.via not in ("auto", "textbelt", "telegram", "msg91", "twilio"):
        raise HTTPException(422, "via must be one of auto|textbelt|telegram|msg91|twilio")
    cur = db.execute(
        "INSERT INTO emergency_contacts(patient_id,name,relation,phone,via,active,created_at) VALUES(?,?,?,?,?,1,?)",
        (c.patient_id, c.name.strip(), c.relation.strip(), c.phone.strip(), c.via, db.now_iso()),
    )
    row = db.query_one("SELECT * FROM emergency_contacts WHERE id=?", (cur.lastrowid,))
    return row


@router.patch("/emergency-contacts/{contact_id}")
def update_contact(contact_id: int, p: ContactPatch):
    row = db.query_one("SELECT * FROM emergency_contacts WHERE id=?", (contact_id,))
    if not row:
        raise HTTPException(404, f"contact {contact_id} not found")
    fields, values = [], []
    for col in ("name", "relation", "phone", "via", "active"):
        v = getattr(p, col)
        if v is not None:
            fields.append(f"{col}=?")
            values.append(v)
    if fields:
        values.append(contact_id)
        db.execute(f"UPDATE emergency_contacts SET {','.join(fields)} WHERE id=?", values)
    return db.query_one("SELECT * FROM emergency_contacts WHERE id=?", (contact_id,))


@router.delete("/emergency-contacts/{contact_id}")
def delete_contact(contact_id: int):
    row = db.query_one("SELECT * FROM emergency_contacts WHERE id=?", (contact_id,))
    if not row:
        raise HTTPException(404, f"contact {contact_id} not found")
    db.execute("UPDATE emergency_contacts SET active=0 WHERE id=?", (contact_id,))
    return {"deleted": contact_id}


class PanicIn(BaseModel):
    patient_id: str
    note: Optional[str] = None          # optional free-text from the button press


@router.post("/panic")
def panic(p: PanicIn):
    """PANIC button: raise an URGENT alert with ack/resolve lifecycle and page every
    active emergency contact for the patient over SMS/Telegram/MSG91 (provider-dependent)."""
    patient = _patient_or_404(p.patient_id)
    note = (p.note or "").strip()
    message = (f"{patient['name']} (age {patient['age']}) pressed the PANIC button in DIstoHelp. "
               f"{('Note: ' + note + '. ') if note else ''}"
               f"Vitals may be deteriorating - call the patient immediately and contact the care team.")

    cur = db.execute(
        "INSERT INTO alerts(patient_id,level,rule,reading,profile_fact,explanation,score_total,source,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (p.patient_id, "urgent", "panic_button",
         db.dumps({"loinc": None, "display": "Patient-reported emergency", "value": None, "unit": None}),
         "patient pressed panic button", message, None, "panic", db.now_iso()),
    )
    from .alerts import get_alert
    alert = get_alert(cur.lastrowid)

    results = notify.send_emergency(
        p.patient_id,
        "DIstoHelp PANIC",
        message,
    )
    return {
        "alert": alert,
        "patient": {"id": patient["id"], "name": patient["name"]},
        "dispatched": len(results),
        "results": results,
        "provider_note": ("Set NOTIFY_PROVIDER / TEXTBELT_KEY / MSG91_AUTH_KEY / TELEGRAM_BOT_TOKEN "
                          "to control delivery; with no provider configured, calls are logged to the screen."),
    }


@router.get("/notifications/log")
def notification_log(patient_id: Optional[str] = None, limit: int = 50):
    if patient_id:
        rows = db.query("SELECT * FROM notifications WHERE patient_id=? ORDER BY id DESC LIMIT ?",
                        (patient_id, limit))
    else:
        rows = db.query("SELECT * FROM notifications ORDER BY id DESC LIMIT ?", (limit,))
    return {"notifications": rows}
