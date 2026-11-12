"""Compatibility layer for the frontend agent's app ("Smart Patient Monitoring
& Early Warning System" — Aadhaar-OTP demo login, full ward workflow).

The frontend speaks its own API dialect; this router implements it on top of
the DIstoHelp PS-03 core (pipeline, artifact filter, FHIR/HAPI storage,
notifications). Demo OTP is DEMO_OTP (default 123456); tokens are random hex
stored in SQLite. NOT real authentication — demo build only.
"""
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from . import alerts, config, constants, db, pipeline

router = APIRouter(prefix="/api")

RISK_TABLE = {
    "low": {"label": "Low Risk",
            "clinical": "Ward-based response; continue routine monitoring"},
    "low-medium": {"label": "Low–Medium Risk",
                   "clinical": "Urgent ward-based response; clinical escalation alert"},
    "medium": {"label": "Medium Risk",
               "clinical": "Urgent response by the clinical team"},
    "high": {"label": "High Risk",
             "clinical": "Emergency response; immediate critical-care review"},
}


def _num(v) -> Optional[float]:
    """Coerce to float; '' / None / 'NaN' become None (partial scoring)."""
    if v is None:
        return None
    s = str(v).strip()
    if s in ("", "nan", "NaN"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def sbp_points(sbp: Optional[float]) -> Optional[int]:
    if sbp is None:
        return None
    if sbp <= 90:
        return 3
    if sbp <= 110:
        return 1
    if sbp <= 219:
        return 0
    return 3


def full_news2(v: dict, hypercapnia: bool = False) -> dict:
    """Full NEWS2 for the frontend UI: 7 items incl. SBP, supplemental O2 and
    consciousness. Missing values -> complete=False, not zero."""
    get = _num
    rr, hr, spo2, temp, sbp = (get(v.get(k)) for k in
                               ("respiratoryRate", "heartRate", "spo2", "temperature", "systolic"))
    on_oxygen = str(v.get("onOxygen")).lower() in ("true", "1", "yes")
    consciousness = v.get("consciousness") or "A"

    items = []

    def item(key, label, value, unit, pts, explanation):
        items.append({"key": key, "label": label, "value": value, "unit": unit,
                      "score": pts, "explanation": explanation})

    spo2_pts = (constants.news2_spo2_scale2 if hypercapnia else constants.news2_spo2_scale1)(spo2) if spo2 is not None else None
    hr_pts = constants.news2_hr(hr) if hr is not None else None
    rr_pts = constants.news2_rr(rr) if rr is not None else None
    temp_pts = constants.news2_temp(temp) if temp is not None else None
    sbp_pts = sbp_points(sbp)
    oxy_pts = 2 if on_oxygen else 0
    cons_pts = 3 if consciousness == "CVPU" else 0

    item("respiratoryRate", "Respiratory Rate", rr, "breaths/min", rr_pts,
         f"RR {rr} → {_pts_txt(rr_pts)} (≤8/9-11/12-20/21-24/≥25 = 3/1/0/2/3)")
    item("heartRate", "Heart Rate / Pulse", hr, "bpm", hr_pts,
         f"HR {hr} → {_pts_txt(hr_pts)} (≤40/41-50/51-90/91-110/111-130/≥131 = 3/1/0/1/2/3)")
    item("spo2", "Oxygen Saturation", spo2, "SpO₂ %", spo2_pts,
         f"SpO2 {spo2}% → {_pts_txt(spo2_pts)} ({'Scale 2: 88-92% target' if hypercapnia else 'Scale 1'})")
    item("temperature", "Body Temperature", temp, "°C", temp_pts,
         f"Temp {temp} °C → {_pts_txt(temp_pts)} (≤35/35.1-36/36.1-38/38.1-39/≥39.1 = 3/1/0/1/2)")
    item("systolic", "Systolic BP", sbp, "mmHg", sbp_pts,
         f"SBP {sbp} → {_pts_txt(sbp_pts)} (≤90/91-110/111-219/≥220 = 3/1/0/3)")
    item("onOxygen", "Supplemental oxygen", "Yes" if on_oxygen else "No", "O₂", oxy_pts,
         "Supplemental O2 administered (+2)" if on_oxygen else "Breathing room air (0)")
    item("consciousness", "Consciousness", consciousness, "", cons_pts,
         "CVPU / new confusion (+3)" if cons_pts else "Alert (A), score 0")

    pts = [p for p in (rr_pts, hr_pts, spo2_pts, temp_pts, sbp_pts, oxy_pts, cons_pts) if p is not None]
    total = sum(pts)
    any3 = any(p == 3 for p in pts)
    complete = all(x is not None for x in (rr, hr, spo2, temp))
    if total >= 7:
        level = "high"
    elif total >= 5:
        level = "medium"
    elif any3:
        level = "low-medium"
    else:
        level = "low"
    risk = dict(RISK_TABLE[level])
    risk["level"] = level
    return {"total": total, "complete": complete, "escalation": any3,
            "items": items, "risk": risk,
            "ps03_scale": "scale2" if hypercapnia else "scale1"}


def _pts_txt(pts):
    return "missing" if pts is None else f"{pts} pt{'s' if pts != 1 else ''}"


def bmi(height_cm, weight_kg):
    h, w = _num(height_cm), _num(weight_kg)
    if h and w and h > 0:
        return round(w / ((h / 100.0) ** 2), 1)
    return None


def _record_public(row: dict) -> dict:
    return {
        "id": row["id"],
        "patientId": row["patient_id"],
        "measuredAt": row["measured_at"],
        "source": row["source"],
        "vitals": db.loads(row["vitals"]),
        "news2": db.loads(row["news2"]),
    }


def _pflags(patient_id: str) -> dict:
    row = db.query_one("SELECT risk_flags FROM patients WHERE id=?", (patient_id,))
    return db.loads(row["risk_flags"]) if row else {}


def _patient_summary(patient: dict) -> dict:
    latest = db.query_one(
        "SELECT * FROM monitoring_records WHERE patient_id=? ORDER BY id DESC LIMIT 1",
        (patient["id"],))
    latest_risk = None
    if latest:
        news2 = db.loads(latest["news2"])
        latest_risk = {"risk": news2["risk"]["level"], "total": news2["total"],
                       "escalation": news2["escalation"], "measuredAt": latest["measured_at"]}
    conditions = db.loads(patient["conditions"]) or []
    return {
        "id": patient["id"],
        "fullName": patient["name"],
        "name": patient["name"],
        "age": patient["age"],
        "gender": (patient["gender"] or "").capitalize(),
        "phone": patient.get("phone") or "",
        "address": patient.get("address") or "",
        "conditions": [c.get("display", "") for c in conditions],
        "risk_flags": db.loads(patient.get("risk_flags") or "{}"),
        "latest": latest_risk,
    }


# ---------- auth (demo only) ----------
def _digits(s: str) -> str:
    return "".join(ch for ch in str(s or "") if ch.isdigit())


@router.post("/patient/send-otp")
def patient_send_otp(body: dict):
    mobile = _digits(body.get("mobile"))
    if len(mobile) != 10:
        raise HTTPException(422, "Mobile must be 10 digits")
    row = None
    for p in db.query("SELECT id,name,phone FROM patients WHERE phone IS NOT NULL AND phone != ''"):
        if _digits(p["phone"]) == mobile:
            row = p
            break
    if not row:
        raise HTTPException(404, "No registered patient with that mobile number")
    return {"sent": True, "found": True, "patient_name": row["name"],
            "demoOtp": config.DEMO_OTP, "message": "OTP simulated (demo mode)"}


@router.post("/patient/verify")
def patient_verify(body: dict):
    mobile = _digits(body.get("mobile"))
    otp = str(body.get("otp", ""))
    if otp != config.DEMO_OTP:
        raise HTTPException(401, "Invalid OTP (demo OTP is in the yellow box)")
    row = None
    for p in db.query("SELECT * FROM patients"):
        if _digits(p["phone"]) == mobile:
            row = p
            break
    if not row:
        raise HTTPException(404, "No registered patient with that mobile number")
    token = secrets.token_hex(16)
    user = {"name": row["name"], "role": "patient", "patient_id": row["id"]}
    db.execute("INSERT INTO auth_tokens(token,aadhaar,name,role,created_at) VALUES(?,?,?,?,?)",
               (token, f"PHONE:{mobile}", user["name"], "patient", db.now_iso()))
    return {"token": token, "user": user,
            "patient": {"id": row["id"], "fullName": row["name"], "age": row["age"],
                        "gender": (row["gender"] or "").capitalize(),
                        "conditions": [c.get("display") for c in (db.loads(row["conditions"]) or [])],
                        "phone": row["phone"]}}


@router.get("/patient/me")
def patient_me(authorization: Optional[str] = Header(None)):
    token = (authorization or "").removeprefix("Bearer ").strip()
    row = db.query_one("SELECT * FROM auth_tokens WHERE token=? AND aadhaar LIKE 'PHONE:%'", (token,)) if token else None
    if not row:
        raise HTTPException(401, "Invalid or expired token")
    mobile = row["aadhaar"].split(":", 1)[1]
    patient_row = None
    for p in db.query("SELECT * FROM patients"):
        if _digits(p["phone"]) == mobile:
            patient_row = p
            break
    if not patient_row:
        raise HTTPException(404, "Patient not found")
    pid = patient_row["id"]
    records = [_record_public(r) for r in db.query(
        "SELECT * FROM monitoring_records WHERE patient_id=? ORDER BY id ASC", (pid,))]
    checkins = db.query(
        "SELECT * FROM checkins WHERE patient_id=? ORDER BY id DESC LIMIT 10", (pid,))
    alert_rows = alerts.list_alerts(patient_id=pid, status=None, limit=20)
    totals = [r["news2"]["total"] for r in records]
    level = "none"
    if records:
        last_n2 = records[-1]["news2"]
        level = (last_n2.get("risk", {}) or {}).get("level", "none")
    return {
        "patient": {
            "id": pid, "fullName": patient_row["name"], "age": patient_row["age"],
            "gender": (patient_row["gender"] or "").capitalize(),
            "phone": patient_row["phone"],
            "conditions": [c.get("display") for c in (db.loads(patient_row["conditions"]) or [])],
            "medications": db.loads(patient_row["medications"]) or [],
            "risk_flags": db.loads(patient_row["risk_flags"]) or {},
            "medicalHistory": patient_row.get("medical_history") or "",
        },
        "records": records,
        "latest_news2": level,
        "checkins": [
            {"id": c["id"], "breathlessness": c["breathlessness"], "fever": c["fever"],
             "dizziness": c["dizziness"], "notes": c["notes"],
             "createdAt": c["created_at"]} for c in checkins
        ],
        "alerts": alert_rows,
        "disclaimer": config.DISCLAIMER,
    }


# ---------- staff auth ----------
@router.post("/auth/send-otp")
def send_otp(body: dict):
    aadhaar = str(body.get("aadhaar", ""))
    mobile = str(body.get("mobile", ""))
    if not (aadhaar.isdigit() and len(aadhaar) == 12):
        raise HTTPException(422, "Aadhaar must be 12 digits")
    if not (mobile.isdigit() and len(mobile) == 10):
        raise HTTPException(422, "Mobile must be 10 digits")
    otp = config.DEMO_OTP
    return {"sent": True, "demoOtp": otp, "message": "OTP simulated (demo mode)"}


@router.post("/auth/verify-otp")
def verify_otp(body: dict):
    otp = str(body.get("otp", ""))
    if otp != config.DEMO_OTP:
        raise HTTPException(401, "Invalid OTP (demo OTP is in the yellow box)")
    token = secrets.token_hex(16)
    user = {"name": "Dr. Ananya Sharma", "role": "Consultant — Post-Discharge Care",
            "aadhaar": "XXXX-XXXX-7058"}
    db.execute("INSERT INTO auth_tokens(token,aadhaar,name,role,created_at) VALUES(?,?,?,?,?)",
               (token, str(body.get("aadhaar", "")), user["name"], user["role"], db.now_iso()))
    return {"token": token, "user": user}


@router.get("/auth/me")
def me(authorization: Optional[str] = Header(None)):
    token = (authorization or "").removeprefix("Bearer ").strip()
    row = db.query_one("SELECT * FROM auth_tokens WHERE token=?", (token,)) if token else None
    if not row:
        raise HTTPException(401, "Invalid or expired token")
    return {"user": {"name": row["name"], "role": row["role"], "aadhaar": "XXXX-XXXX-7058"}}


# ---------- patients ----------
@router.get("/patients")
def list_patients(q: str = ""):
    rows = db.query("SELECT * FROM patients ORDER BY id")
    out = [_patient_summary(r) for r in rows]
    if q:
        ql = q.lower()
        out = [p for p in out if ql in p["fullName"].lower() or ql in p["id"].lower()
               or ql in (p["phone"] or "")]
    return out


@router.get("/patients/summary")
def patients_summary():
    patients = db.query("SELECT * FROM patients ORDER BY id")
    latest_risk: dict[str, str] = {}
    for r in patients:
        rec = db.query_one(
            "SELECT news2 FROM monitoring_records WHERE patient_id=? ORDER BY id DESC LIMIT 1",
            (r["id"],))
        if rec:
            latest_risk[r["id"]] = db.loads(rec["news2"])["risk"]["level"]
    counts = {"low": 0, "low-medium": 0, "medium": 0, "high": 0}
    for lvl in latest_risk.values():
        counts[lvl] = counts.get(lvl, 0) + 1
    recent_rows = db.query(
        "SELECT r.*, p.name FROM monitoring_records r JOIN patients p ON p.id = r.patient_id "
        "ORDER BY r.id DESC LIMIT 6")
    recent = [{"measuredAt": r["measured_at"], "patientId": r["patient_id"],
               "patientName": r["name"],
               "total": db.loads(r["news2"])["total"],
               "risk": db.loads(r["news2"])["risk"]["level"]} for r in recent_rows]
    escalations = db.query_one(
        "SELECT COUNT(*) AS n FROM alerts WHERE status='active'")["n"]
    return {
        "totalRegistered": len(patients),
        "monitored": len(latest_risk),
        "low": counts["low"],
        "lowMedium": counts["low-medium"],
        "medium": counts["medium"],
        "high": counts["high"],
        "escalations": escalations,
        "recent": recent,
    }


@router.get("/patients/enquiries")   # must precede /patients/{patient_id}
def all_enquiries():
    rows = db.query(
        "SELECT e.*, p.name FROM enquiries e JOIN patients p ON p.id = e.patient_id "
        "ORDER BY e.id DESC")
    return [_enquiry_public(r, r["name"]) for r in rows]


@router.get("/patients/{patient_id}")
def patient_detail(patient_id: str):
    row = db.query_one("SELECT * FROM patients WHERE id=?", (patient_id,))
    if not row:
        raise HTTPException(404, f"patient {patient_id} not found")
    summary = _patient_summary(row)
    conditions = db.loads(row["conditions"]) or []
    recs = db.query(
        "SELECT * FROM monitoring_records WHERE patient_id=? ORDER BY id ASC", (patient_id,))
    enqs = db.query(
        "SELECT * FROM enquiries WHERE patient_id=? ORDER BY id ASC", (patient_id,))
    return {
        **summary,
        "conditions": [c.get("display", "") for c in conditions],
        "medicalHistory": row.get("medical_history") or "",
        "registeredOn": row.get("registered_on") or row.get("created_at"),
        "medications": db.loads(row["medications"]) or [],
        "risk_flags": db.loads(row["risk_flags"]) or {},
        "fhir_ref": row.get("fhir_ref"),
        "records": [_record_public(r) for r in recs],
        "enquiries": [_enquiry_public(e, row["name"]) for e in enqs],
    }


@router.post("/patients")
def create_patient(body: dict):
    pid = "P" + uuid.uuid4().hex[:5].upper()
    gender = (body.get("gender") or "other").lower()
    now = db.now_iso()
    cond_strings = body.get("conditions") or []
    conditions = [{"code": "custom", "display": str(c).strip(), "clinicalStatus": "active"}
                  for c in cond_strings if str(c).strip()]
    db.execute(
        "INSERT INTO patients(id,name,age,gender,dob,fhir_ref,conditions,medications,risk_flags,"
        "phone,address,medical_history,registered_on,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (pid, body.get("fullName", "").strip() or "Unnamed",
         int(_num(body.get("age")) or 0), gender, None, None,
         db.dumps(conditions), db.dumps([]), db.dumps({}),
         str(body.get("phone", "")), str(body.get("address", "")),
         str(body.get("medicalHistory", "")), now, now))
    return patient_detail(pid)


SEED_IDS = {"p01", "p02", "p03", "p04", "p05"}


@router.delete("/patients/{patient_id}")
def delete_patient(patient_id: str):
    """Delete a USER-ADDED patient and all derived data. The seeded cohort
    (p01–p05, Synthea-generated) cannot be removed this way."""
    if patient_id in SEED_IDS:
        raise HTTPException(403, "The seeded discharge cohort (p01–p05) cannot be deleted")
    row = db.query_one("SELECT id FROM patients WHERE id=?", (patient_id,))
    if not row:
        raise HTTPException(404, "patient not found")
    for table in ("observations", "scores", "alerts", "device_events", "checkins",
                  "monitoring_records", "enquiries", "sensor_readings",
                  "notifications", "scenario_runs"):
        db.execute(f"DELETE FROM {table} WHERE patient_id=?", (patient_id,))
    db.execute("DELETE FROM patients WHERE id=?", (patient_id,))
    return {"ok": True, "deleted": patient_id}


@router.put("/patients/{patient_id}")
def update_patient(patient_id: str, body: dict):
    row = db.query_one("SELECT * FROM patients WHERE id=?", (patient_id,))
    if not row:
        raise HTTPException(404, "patient not found")
    conditions = [{"code": "custom", "display": str(c).strip(), "clinicalStatus": "active"}
                  for c in (body.get("conditions") or []) if str(c).strip()]
    db.execute(
        "UPDATE patients SET name=?, age=?, gender=?, phone=?, address=?, conditions=?, medical_history=? "
        "WHERE id=?",
        (str(body.get("fullName", row["name"])).strip(),
         int(_num(body.get("age")) or row["age"] or 0),
         str(body.get("gender", row["gender"] or "other")).lower(),
         str(body.get("phone", row.get("phone") or "")),
         str(body.get("address", row.get("address") or "")),
         db.dumps(conditions), str(body.get("medicalHistory", row.get("medical_history") or "")),
         patient_id))
    return patient_detail(patient_id)


# ---------- scoring / records ----------
class ScoreBody(BaseModel):
    vitals: dict = {}


@router.post("/patients/score")
def patients_score(body: ScoreBody):
    vitals = dict(body.vitals)
    vitals["bmi"] = bmi(vitals.get("height"), vitals.get("weight"))
    news2 = full_news2(vitals)
    return {"news2": news2, "vitals": vitals}


class RecordBody(BaseModel):
    vitals: dict = {}
    source: str = "manual"


@router.post("/patients/{patient_id}/records")
def save_record(patient_id: str, body: RecordBody):
    row = db.query_one("SELECT * FROM patients WHERE id=?", (patient_id,))
    if not row:
        raise HTTPException(404, "patient not found")
    flags = db.loads(row["risk_flags"]) or {}
    v = dict(body.vitals)
    v["bmi"] = bmi(v.get("height"), v.get("weight"))
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    # Feed the four PS-03 vitals through the clinical pipeline too (FHIR/HAPI,
    # artifact filter, NEWS2 drift, Watch/Review/Urgent alerts, WS broadcast)
    loinc_map = {"heartRate": "8867-4", "spo2": "2708-6",
                 "respiratoryRate": "9279-1", "temperature": "8310-5"}
    for key, loinc in loinc_map.items():
        val = _num(v.get(key))
        if val is not None:
            try:
                pipeline.ingest_vital(patient_id, loinc, val, source=body.source or "manual")
            except Exception:
                pass

    news2 = full_news2(v, hypercapnia=bool(flags.get("hypercapnia")))
    cur = db.execute(
        "INSERT INTO monitoring_records(patient_id,source,measured_at,vitals,news2,created_at) "
        "VALUES(?,?,?,?,?,?)",
        (patient_id, body.source or "manual", now, db.dumps(v), db.dumps(news2), db.now_iso()))
    rec = db.query_one("SELECT * FROM monitoring_records WHERE id=?", (cur.lastrowid,))
    return _record_public(rec)


def _enquiry_public(e: dict, patient_name: str = "") -> dict:
    return {
        "id": e["id"],
        "patientId": e["patient_id"],
        "patientName": patient_name,
        "mainComplaint": e["main_complaint"],
        "symptoms": e["symptoms"], "duration": e["duration"],
        "painDescription": e["pain_description"],
        "existingConditions": e["existing_conditions"],
        "currentMedications": e["current_medications"],
        "allergies": e["allergies"],
        "additionalObservations": e["additional_observations"],
        "staffRemarks": e["staff_remarks"],
        "createdAt": e["created_at"],
    }


@router.post("/patients/{patient_id}/enquiries")
def add_enquiry(patient_id: str, body: dict):
    row = db.query_one("SELECT name FROM patients WHERE id=?", (patient_id,))
    if not row:
        raise HTTPException(404, "patient not found")
    if not str(body.get("mainComplaint", "")).strip():
        raise HTTPException(422, "mainComplaint is required")
    cur = db.execute(
        "INSERT INTO enquiries(patient_id,main_complaint,symptoms,duration,pain_description,"
        "existing_conditions,current_medications,allergies,additional_observations,staff_remarks,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (patient_id, str(body.get("mainComplaint")).strip(), str(body.get("symptoms", "")),
         str(body.get("duration", "")), str(body.get("painDescription", "")),
         str(body.get("existingConditions", "")), str(body.get("currentMedications", "")),
         str(body.get("allergies", "")), str(body.get("additionalObservations", "")),
         str(body.get("staffRemarks", "")), db.now_iso()))
    e = db.query_one("SELECT * FROM enquiries WHERE id=?", (cur.lastrowid,))
    return _enquiry_public(e, row["name"])


# ---------- sensors (ESP32: MAX30102 + DS18B20 style) ----------
@router.get("/sensors/{patient_id}/latest")
def sensor_latest(patient_id: str):
    row = db.query_one(
        "SELECT * FROM sensor_readings WHERE patient_id=? ORDER BY id DESC LIMIT 1", (patient_id,))
    if not row:
        return {"connected": False, "reading": None}
    ts = datetime.fromisoformat(row["read_at"])
    age = (datetime.now(timezone.utc) - ts).total_seconds()
    return {"connected": age < 30, "reading": {"timestamp": row["read_at"],
                                               "vitals": db.loads(row["vitals"])}}


@router.post("/sensors/readings")
def push_reading(body: dict, x_device_key: Optional[str] = Header(None)):
    if x_device_key != config.DEVICE_KEY:
        raise HTTPException(403, "x-device-key header missing or invalid")
    patient_id = str(body.get("patient_id") or body.get("patientId") or "")
    vitals = body.get("vitals") or {k: body[k] for k in
                                    ("heartRate", "spo2", "respiratoryRate", "temperature",
                                     "systolic", "diastolic") if k in body}
    if not patient_id or not vitals:
        raise HTTPException(422, "patient_id and vitals (heartRate, spo2, respiratoryRate, temperature) required")
    row = db.query_one("SELECT * FROM patients WHERE id=?", (patient_id,))
    if not row:
        raise HTTPException(404, "patient not found")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    db.execute("INSERT INTO sensor_readings(patient_id,device_key,read_at,vitals,created_at) "
               "VALUES(?,?,?,?,?)", (patient_id, x_device_key, now, db.dumps(vitals), db.now_iso()))
    source = str(body.get("source") or "esp32")[:32]   # esp32 | camera | ble | wearable
    flags = db.loads(row["risk_flags"]) or {}
    v = dict(vitals)
    v["bmi"] = bmi(v.get("height"), v.get("weight"))
    news2 = full_news2(v, hypercapnia=bool(flags.get("hypercapnia")))
    cur = db.execute(
        "INSERT INTO monitoring_records(patient_id,source,measured_at,vitals,news2,created_at) "
        "VALUES(?,?,?,?,?,?)",
        (patient_id, source, now, db.dumps(v), db.dumps(news2), db.now_iso()))
    for key, loinc in (("heartRate", "8867-4"), ("spo2", "2708-6"),
                       ("respiratoryRate", "9279-1"), ("temperature", "8310-5")):
        val = _num(v.get(key))
        if val is not None:
            try:
                pipeline.ingest_vital(patient_id, loinc, val, source=source)
            except Exception:
                pass
    return {"ok": True, "patient_id": patient_id, "record_id": cur.lastrowid, "measuredAt": now}
