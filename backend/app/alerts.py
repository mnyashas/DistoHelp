"""Alert generation with full explainability.

Every alert answers three questions:
  reading       - the exact vital sign + value that triggered it
  rule          - the scoring rule / personalization rule applied
  profile_fact  - the patient-specific fact (condition, medication) that shaped it
Plus a human-readable `explanation` string for the dashboard.
"""
from datetime import datetime, timezone, timedelta

from . import constants, db, scoring

LEVEL_LABEL = {"watch": "Watch", "review": "Review", "urgent": "Urgent"}


def _recent_duplicate(patient_id: str, level: str, rule: str, minutes: float) -> bool:
    since = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat(timespec="seconds")
    row = db.query_one(
        "SELECT COUNT(*) AS n FROM alerts WHERE patient_id=? AND level=? AND rule=? AND created_at>=?",
        (patient_id, level, rule, since),
    )
    return bool(row and row["n"] > 0)


def _profile_fact(profile: dict) -> str:
    flags = profile.get("risk_flags", {})
    facts = []
    if flags.get("hypercapnia"):
        facts.append("hypercapnic respiratory failure (SpO2 Scale 2, target 88-92%)")
    if flags.get("beta_blocker"):
        meds = [m.get("display") for m in profile.get("medications", []) if m.get("beta_blocker")]
        facts.append("on beta-blocker" + (f" ({', '.join(meds)})" if meds else "") + " — HR thresholds +10 bpm")
    if not facts:
        conds = [c.get("display") for c in profile.get("conditions", [])[:2]]
        facts.append("discharge profile: " + (", ".join(conds) if conds else "no documented conditions"))
    return "; ".join(facts)


def _reading_dict(code: str, value: float) -> dict:
    meta = constants.LOINC[code]
    return {"loinc": code, "display": meta["display"], "value": value, "unit": meta["unit"]}


def _trigger_vital(score: dict) -> tuple[str, float]:
    latest, breakdown = score["latest"], score["breakdown"]
    best_code, best_val, best_pts = None, None, -1
    code_by_key = {"hr": "8867-4", "spo2": "2708-6", "rr": "9279-1", "temp": "8310-5"}
    for key, pts in breakdown.items():
        if pts > best_pts:
            best_pts, best_code = pts, code_by_key[key]
            best_val = latest.get(best_code)
    if best_code is None:  # drift-only escalation: report lowest vital by z
        best_code = "9279-1" if "9279-1" in latest else next(iter(latest))
        best_val = latest[best_code]
    return best_code, best_val


def generate_alert(score: dict, source: str = "monitoring") -> dict | None:
    if score["level"] in (None, "none"):
        return None
    patient_id = score["patient_id"]
    profile = scoring.patient_profile(patient_id)
    code, value = _trigger_vital(score)
    scale_note = "Scale 2" if score["spo2_scale"] == "scale2" and code == "2708-6" else "standard"
    rule = (
        f"NEWS2({scale_note}) total={score['total']} "
        f"(base {score['base_total']} + drift/check-in {score['total'] - score['base_total']}); "
        f"trigger vital: {code} scored {score['breakdown'].get(_key(code), 0)} pt(s)"
    )
    profile_fact = _profile_fact(profile)
    explanation = (
        f"{constants.LOINC[code]['display']} = {value}{constants.LOINC[code]['unit']} triggered a "
        f"{score['level'].upper()} alert. Rule: {rule}. Patient profile: {profile_fact}. "
        + (" ".join(score["notes"]) if score["notes"] else "")
    ).strip()

    from . import config
    if _recent_duplicate(patient_id, score["level"], rule, config.ALERT_DEDUP_MINUTES):
        return None

    cur = db.execute(
        "INSERT INTO alerts(patient_id,level,rule,reading,profile_fact,explanation,score_total,source,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (patient_id, score["level"], rule, db.dumps(_reading_dict(code, value)),
         profile_fact, explanation, score["total"], source, db.now_iso()),
    )
    alert = get_alert(cur.lastrowid)

    # Message emergency contacts when a patient goes off-baseline (review or urgent).
    # Best-effort: never let notification failure break monitoring.
    if score["level"] in ("review", "urgent") and getattr(config, "NOTIFY_ON_CRITICAL", True):
        try:
            from . import notify
            vital_name = constants.LOINC[code]["display"]
            notify.send_emergency(
                patient_id,
                "DIstoHelp: patient may be in danger",
                (f"{profile.get('name', patient_id)} may be in danger — {vital_name} = {value} "
                 f"(NEWS2 {score['total']}, {score['level']}). Please check on them right now. "
                 f"If they seem seriously unwell, call emergency services."),
            )
        except Exception:
            pass
    return alert


def _key(code: str) -> str:
    return {"8867-4": "hr", "2708-6": "spo2", "9279-1": "rr", "8310-5": "temp"}[code]


def get_alert(alert_id: int) -> dict:
    row = db.query_one("SELECT * FROM alerts WHERE id=?", (alert_id,))
    row["reading"] = db.loads(row["reading"])
    row["patient_name"] = scoring.patient_profile(row["patient_id"])["name"]
    return row


def list_alerts(patient_id: str | None = None, status: str | None = None, limit: int = 100) -> list[dict]:
    sql, params = "SELECT * FROM alerts WHERE 1=1", []
    if patient_id:
        sql += " AND patient_id=?"; params.append(patient_id)
    if status:
        sql += " AND status=?"; params.append(status)
    sql += " ORDER BY id DESC LIMIT ?"; params.append(limit)
    rows = db.query(sql, tuple(params))
    for r in rows:
        r["reading"] = db.loads(r["reading"])
        r["patient_name"] = scoring.patient_profile(r["patient_id"])["name"]
    return rows


def set_status(alert_id: int, status: str) -> dict | None:
    field = "acked_at" if status == "acknowledged" else "resolved_at"
    db.execute(f"UPDATE alerts SET status=?, {field}=? WHERE id=?",
               (status, db.now_iso(), alert_id))
    return get_alert(alert_id)
