"""NEWS2-style scoring engine with patient-specific personalization.

Personalization rules:
  1. SpO2 Scale 2 (88-92% target) for documented hypercapnic respiratory failure.
  2. Rolling per-patient baselines — z-score drift flags gradual deterioration
     even when no single reading crosses a static threshold.
  3. Beta-blocker HR blunting — HR thresholds shifted +10 bpm when a beta-blocker
     is on the medication list.
Plus symptom check-in modifiers from /api/checkins (breathlessness/fever/dizziness).
"""
import statistics

from . import constants, db

ROLLING_WINDOW = 60  # readings, per vital
# Floors so tiny-variance windows don't manufacture z>2 noise flags
SD_FLOOR = {"8867-4": 3.0, "9279-1": 1.5, "2708-6": 1.0, "8310-5": 0.15}


def rolling_stats(patient_id: str, loinc: str, window: int = ROLLING_WINDOW):
    rows = db.query(
        "SELECT value FROM observations WHERE patient_id=? AND loinc=? AND artifact IS NULL "
        "ORDER BY id DESC LIMIT ?",
        (patient_id, loinc, window),
    )
    values = [r["value"] for r in rows if r["value"] is not None]
    if len(values) < 8:
        return None
    return {
        "mean": statistics.fmean(values),
        "sd": statistics.pstdev(values) or 1e-6,
        "n": len(values),
    }


def latest_per_vital(patient_id: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for loinc in constants.LOINC:
        row = db.query_one(
            "SELECT value FROM observations WHERE patient_id=? AND loinc=? AND artifact IS NULL "
            "ORDER BY id DESC LIMIT 1",
            (patient_id, loinc),
        )
        if row and row["value"] is not None:
            out[loinc] = row["value"]
    return out


def patient_profile(patient_id: str) -> dict:
    row = db.query_one("SELECT * FROM patients WHERE id=?", (patient_id,))
    if not row:
        return {"risk_flags": {}, "medications": [], "conditions": [], "name": patient_id}
    return {
        "name": row["name"],
        "age": row["age"],
        "gender": row["gender"],
        "conditions": db.loads(row["conditions"]) or [],
        "medications": db.loads(row["medications"]) or [],
        "risk_flags": db.loads(row["risk_flags"]) or {},
    }


def checkin_modifier(patient_id: str) -> dict:
    row = db.query_one(
        "SELECT * FROM checkins WHERE patient_id=? ORDER BY id DESC LIMIT 1", (patient_id,)
    )
    if not row:
        return {"modifier": 0, "detail": "no check-ins"}
    mod = 0
    parts = []
    if row["breathlessness"] == 1:
        mod += 1; parts.append("mild breathlessness +1")
    elif row["breathlessness"] >= 2:
        mod += 2; parts.append("severe breathlessness +2")
    if row["fever"]:
        mod += 1; parts.append("reported fever +1")
    if row["dizziness"] == 1:
        mod += 1; parts.append("mild dizziness +1")
    elif row["dizziness"] >= 2:
        mod += 2; parts.append("severe dizziness +2")
    return {"modifier": mod, "detail": ", ".join(parts) if parts else "no symptoms reported"}


def _points_for(loinc: str, value: float, hypercapnia: bool, beta_blocker: bool) -> int:
    return {
        "8867-4": lambda: constants.news2_hr(value, beta_blocker),
        "2708-6": lambda: (constants.news2_spo2_scale2 if hypercapnia else constants.news2_spo2_scale1)(value),
        "9279-1": lambda: constants.news2_rr(value),
        "8310-5": lambda: constants.news2_temp(value),
    }[loinc]()


def _streak(patient_id: str, loinc: str, current_pts: int, hypercapnia: bool, beta_blocker: bool) -> int:
    """Consecutive most-recent readings (incl. current) scoring >=1 point."""
    streak = 1
    rows = db.query(
        "SELECT value FROM observations WHERE patient_id=? AND loinc=? AND artifact IS NULL "
        "ORDER BY id DESC LIMIT 2 OFFSET 1",
        (patient_id, loinc),
    )
    for r in rows:
        if _points_for(loinc, r["value"], hypercapnia, beta_blocker) >= 1:
            streak += 1
        else:
            break
    return streak


def compute_score(patient_id: str) -> dict:
    profile = patient_profile(patient_id)
    flags = profile["risk_flags"]
    beta_blocker = bool(flags.get("beta_blocker"))
    hypercapnia = bool(flags.get("hypercapnia"))
    spo2_scale = "scale2" if hypercapnia else "scale1"
    latest = latest_per_vital(patient_id)

    scores: dict[str, int] = {}
    raw_scores: dict[str, int] = {}
    notes: list[str] = []
    if "8867-4" in latest:
        raw_scores["hr"] = constants.news2_hr(latest["8867-4"], beta_blocker)
        if beta_blocker:
            notes.append(f"Beta-blocker on medication list — HR thresholds shifted +10 bpm")
    if "2708-6" in latest:
        raw_scores["spo2"] = (constants.news2_spo2_scale2 if hypercapnia else constants.news2_spo2_scale1)(latest["2708-6"])
        if hypercapnia:
            notes.append("Documented hypercapnic respiratory failure — SpO2 scored on Scale 2 (target 88-92%)")
    if "9279-1" in latest:
        raw_scores["rr"] = constants.news2_rr(latest["9279-1"])
    if "8310-5" in latest:
        raw_scores["temp"] = constants.news2_temp(latest["8310-5"])

    code_by_key = {"hr": "8867-4", "spo2": "2708-6", "rr": "9279-1", "temp": "8310-5"}
    for key, pts in raw_scores.items():
        if pts == 0:
            scores[key] = 0
            continue
        streak = _streak(patient_id, code_by_key[key], pts, hypercapnia, beta_blocker)
        if streak >= 3:
            scores[key] = pts
        else:
            scores[key] = 0
            notes.append(f"Momentary {key.upper()} elevation suppressed (<3 consecutive elevated readings)")

    drift: dict[str, dict] = {}
    for loinc, label in (("8867-4", "hr"), ("2708-6", "spo2"), ("9279-1", "rr"), ("8310-5", "temp")):
        if loinc in latest:
            stats = rolling_stats(patient_id, loinc)
            sd = max(stats["sd"], SD_FLOOR.get(loinc, 1.0)) if stats else None
            z = ((latest[loinc] - stats["mean"]) / sd) if stats else None
            drift[label] = {"z": round(z, 2) if z is not None else None,
                            "baseline_mean": round(stats["mean"], 2) if stats else None,
                            "n": stats["n"] if stats else 0}

    ci = checkin_modifier(patient_id)
    base_total = sum(scores.values())
    drift_bonus = 0
    # Directed drift: only deterioration directions count (improvement is not deterioration)
    drift_dir = {"hr": 1, "rr": 1, "spo2": -1, "temp": 1}
    drift_flags = [k for k, v in drift.items()
                   if v["z"] is not None and v["z"] * drift_dir.get(k, 1) >= 2.0]
    if len(drift_flags) >= 2:  # require multi-vital drift — a single noisy z is not deterioration
        drift_bonus = min(2, len(drift_flags))
        notes.append(f"Rolling-baseline drift ≥2σ in: {', '.join(drift_flags)} (+{drift_bonus})")
    total = base_total + drift_bonus + ci["modifier"]
    if ci["modifier"]:
        notes.append(f"Symptom check-in: {ci['detail']}")

    level = constants.tier_from_score(total, list(scores.values()))
    if drift_bonus and level == "none":
        level = "watch"
        notes.append("Escalated to watch on multi-vital baseline drift (gradual deterioration rule)")

    return {
        "patient_id": patient_id,
        "total": total,
        "base_total": base_total,
        "level": level,
        "spo2_scale": spo2_scale,
        "breakdown": scores,
        "drift": drift,
        "checkin": ci,
        "notes": notes,
        "latest": latest,
        "patient_name": profile["name"],
    }


def persist_score(score: dict) -> int:
    cur = db.execute(
        "INSERT INTO scores(patient_id,total,level,spo2_scale,breakdown,drift,notes,created_at) "
        "VALUES(?,?,?,?,?,?,?,?)",
        (score["patient_id"], score["total"], score["level"], score["spo2_scale"],
         db.dumps(score["breakdown"]), db.dumps(score["drift"]), db.dumps(score["notes"]), db.now_iso()),
    )
    return cur.lastrowid
