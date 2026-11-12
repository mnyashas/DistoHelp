"""Sensor-artifact detection. Runs BEFORE scoring; flagged observations are
kept (HAPI + SQLite, marked) but never contribute to the clinical score and
never raise clinical alerts. Device-quality issues become device_events."""
from . import constants, db

FLATLINE_N = 6          # consecutive identical readings => flatline
MOTION_DELTA = {"8867-4": 40.0, "2708-6": 8.0, "9279-1": 12.0, "8310-5": 2.0}

def check_plausibility(loinc: str, value: float | None) -> str | None:
    if value is None:
        return "missing_value"
    lo, hi = constants.PLAUSIBLE.get(loinc, (-1e9, 1e9))
    if not (lo <= value <= hi):
        # SpO2 == 0 is the explicit probe-removal sentinel
        if loinc == "2708-6" and value == 0:
            return "probe_removal"
        return "implausible"
    return None


def check_flatline(patient_id: str, loinc: str, value: float) -> bool:
    rows = db.query(
        "SELECT value FROM observations WHERE patient_id=? AND loinc=? AND artifact IS NULL "
        "ORDER BY id DESC LIMIT ?",
        (patient_id, loinc, FLATLINE_N - 1),
    )
    if len(rows) < FLATLINE_N - 1:
        return False
    return all(abs(r["value"] - value) < 1e-9 for r in rows)


def check_motion_noise(patient_id: str, loinc: str, value: float) -> bool:
    row = db.query_one(
        "SELECT value FROM observations WHERE patient_id=? AND loinc=? AND artifact IS NULL "
        "ORDER BY id DESC LIMIT 1",
        (patient_id, loinc),
    )
    if not row:
        return False
    return abs(value - row["value"]) > MOTION_DELTA.get(loinc, 1e9)


def probe_removal_signature(patient_id: str, loinc: str, value: float | None) -> bool:
    """SpO2 0/null + flatlined HR => probe removed, not a patient emergency."""
    if loinc != "2708-6":
        return False
    if value not in (0, None):
        return False
    hr_rows = db.query(
        "SELECT value FROM observations WHERE patient_id=? AND loinc='8867-4' "
        "ORDER BY id DESC LIMIT ?",
        (patient_id, FLATLINE_N),
    )
    if len(hr_rows) < 3:
        return True  # SpO2 0 with no HR context: still treat as probe removal
    return max(r["value"] for r in hr_rows) - min(r["value"] for r in hr_rows) < 1.0


def detect(patient_id: str, loinc: str, value: float | None) -> str | None:
    """Return artifact kind or None. Order matters: probe removal beats flatline."""
    if probe_removal_signature(patient_id, loinc, value):
        return "probe_removal"
    p = check_plausibility(loinc, value)
    if p:
        return p
    assert value is not None
    if check_motion_noise(patient_id, loinc, value):
        return "motion_noise"
    if check_flatline(patient_id, loinc, value):
        return "flatline"
    return None


def record_device_event(patient_id: str, kind: str, detail: str) -> None:
    db.execute(
        "INSERT INTO device_events(patient_id,kind,detail,created_at) VALUES(?,?,?,?)",
        (patient_id, kind, detail, db.now_iso()),
    )


def missing_data_check(patient_id: str, max_silence_minutes: float) -> dict | None:
    row = db.query_one(
        "SELECT created_at FROM observations WHERE patient_id=? ORDER BY id DESC LIMIT 1",
        (patient_id,),
    )
    if not row:
        return None
    from datetime import datetime, timezone
    last = datetime.fromisoformat(row["created_at"])
    silent_min = (datetime.now(timezone.utc) - last).total_seconds() / 60.0
    if silent_min > max_silence_minutes:
        record_device_event(patient_id, "missing_data",
                            f"No readings for {silent_min:.1f} min (threshold {max_silence_minutes} min)")
        return {"patient_id": patient_id, "silent_minutes": round(silent_min, 1),
                "threshold_minutes": max_silence_minutes}
    return None
