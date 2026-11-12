"""Scenario replay + performance report.

Replays scripted scenarios in-memory (fast, deterministic) and compares the
personalized NEWS2 engine against naive fixed-threshold monitoring on:
  - detection lead time (minutes earlier first alert)
  - alerts per patient-day
  - false alerts from sensor artifacts (suppressed by the personalized pipeline)
"""
import statistics

from . import constants, sim_engine, scoring

NAIVE_THRESHOLDS = {"hr": 120.0, "rr": 24.0, "temp": 38.3, "spo2": 92.0}
RE_ALERT_MINUTES = 360  # re-alert cadence while still elevated


def _local_flags(patient_id: str) -> dict:
    profile = scoring.patient_profile(patient_id)
    return profile.get("risk_flags", {})


def run_scenario(scenario: str, patient_id: str, n_ticks: int = 1440, seed: int = 42) -> dict:
    flags = _local_flags(patient_id)
    rows = list(sim_engine.simulate(scenario, patient_id, n_ticks=n_ticks, seed=seed))
    hypercapnia = bool(flags.get("hypercapnia"))
    beta = bool(flags.get("beta_blocker"))

    history: list[dict] = []
    usable = [r for r in rows[:60]]  # first hour as baseline anchor
    baseline = {
        "hr": statistics.fmean(r["heart_rate"] for r in usable),
        "rr": statistics.fmean(r["respiratory_rate"] for r in usable),
        "spo2": statistics.fmean(max(r["spo2"], 1) for r in usable),
        "temp": statistics.fmean(r["temperature"] for r in usable),
    }
    sd_floor = {"hr": 3.0, "rr": 1.5, "spo2": 1.0, "temp": 0.15}
    sd = {k: max(statistics.pstdev([r[{"hr": "heart_rate", "rr": "respiratory_rate",
                                   "spo2": "spo2", "temp": "temperature"}[k]] for r in usable]),
                 sd_floor[k])
          for k in baseline}

    pers = _evaluate(rows, patient_id, hypercapnia, beta, baseline, sd)
    naive = _evaluate_naive(rows)

    lead = None
    if pers["first_alert_tick"] is not None and naive["first_alert_tick"] is not None:
        lead = naive["first_alert_tick"] - pers["first_alert_tick"]
    hours = n_ticks / 60.0
    pers["alerts_per_day"] = round(pers["alerts"] / (hours / 24.0), 2)
    naive["alerts_per_day"] = round(naive["alerts"] / (hours / 24.0), 2)
    return {
        "scenario": scenario,
        "patient_id": patient_id,
        "patient_name": scoring.patient_profile(patient_id)["name"],
        "duration_hours": round(hours, 2),
        "personalized": pers,
        "naive": naive,
        "detection_lead_time_minutes": lead,
        "verdict": _verdict(pers, naive, lead),
    }


def _anomaly(prev: dict | None, row: dict) -> str | None:
    if row["spo2"] == 0:
        return "probe_removal"
    if row["heart_rate"] < 20 or row["heart_rate"] > 250: return "implausible"
    if row["respiratory_rate"] < 4 or row["respiratory_rate"] > 60: return "implausible"
    if row["temperature"] < 29 or row["temperature"] > 43: return "implausible"
    if prev:
        if abs(row["spo2"] - prev["spo2"]) > 8: return "motion_noise"
        if abs(row["heart_rate"] - prev["heart_rate"]) > 40: return "motion_noise"
    return None


def _evaluate(rows, patient_id, hypercapnia, beta, baseline, sd) -> dict:
    first_alert = None
    alerts = 0
    suppressions = 0
    level_reached = "none"
    order = {"none": 0, "watch": 1, "review": 2, "urgent": 3}
    active = False          # an alert episode is in progress
    episode_level = "none"
    episode_alerted_tick = -RE_ALERT_MINUTES
    quiet_ticks = 0         # consecutive sub-threshold ticks before re-arming
    prev_row = None
    streaks = {"hr": 0, "rr": 0, "spo2": 0, "temp": 0}   # persistence per vital

    for row in rows:
        art = _anomaly(prev_row, row)
        prev_row = row
        if row["drop"]:
            for k in streaks: streaks[k] = 0
            quiet_ticks = 0
            continue
        if art:
            suppressions += 1
            continue
        raw = {
            "hr": constants.news2_hr(row["heart_rate"], beta),
            "rr": constants.news2_rr(row["respiratory_rate"]),
            "spo2": (constants.news2_spo2_scale2 if hypercapnia else constants.news2_spo2_scale1)(row["spo2"]),
            "temp": constants.news2_temp(row["temperature"]),
        }
        for k in streaks:
            streaks[k] = streaks[k] + 1 if raw[k] > 0 else 0
        eff = {k: (v if streaks[k] >= 3 else 0) for k, v in raw.items()}  # persistence rule
        hr_s, rr_s, spo2_s, temp_s = eff["hr"], eff["rr"], eff["spo2"], eff["temp"]
        base_total = hr_s + rr_s + spo2_s + temp_s
        drift = 0
        drift_dir = {"hr": 1, "rr": 1, "spo2": -1, "temp": 1}
        for key, val in (("hr", row["heart_rate"]), ("rr", row["respiratory_rate"]),
                         ("spo2", row["spo2"]), ("temp", row["temperature"])):
            if (val - baseline[key]) * drift_dir[key] / sd[key] >= 2.0:   # deterioration direction only
                drift += 1
        drift_bonus = min(2, drift) if drift >= 2 else 0   # multi-vital drift only
        total = base_total + drift_bonus
        level = constants.tier_from_score(total, [hr_s, rr_s, spo2_s, temp_s])
        if level != "none" and order[level] > order[level_reached]:
            level_reached = level

        if level == "none":
            quiet_ticks += 1
            if quiet_ticks >= 15:
                active, episode_level = False, "none"
            continue
        quiet_ticks = 0
        escalate = order[level] > order[episode_level]
        steady = (row["tick"] - episode_alerted_tick) >= RE_ALERT_MINUTES
        if not active or escalate or steady:
            alerts += 1
            active = True
            episode_level = level
            episode_alerted_tick = row["tick"]
            if first_alert is None:
                first_alert = row["tick"]
    return {
        "first_alert_tick": first_alert,
        "first_alert_time_min": first_alert,
        "alerts": alerts,
        "level_reached": level_reached,
        "artifact_suppressions": suppressions,
    }


def _evaluate_naive(rows) -> dict:
    first_alert = None
    alerts = 0
    active = False
    episode_alerted_tick = -RE_ALERT_MINUTES
    quiet_ticks = 0
    for row in rows:
        if row["drop"]:
            quiet_ticks = 0
            continue
        hit = (row["heart_rate"] > NAIVE_THRESHOLDS["hr"]
               or row["respiratory_rate"] > NAIVE_THRESHOLDS["rr"]
               or row["temperature"] > NAIVE_THRESHOLDS["temp"]
               or row["spo2"] < NAIVE_THRESHOLDS["spo2"])  # note: naive fires on SpO2=0 artifacts
        if not hit:
            quiet_ticks += 1
            if quiet_ticks >= 15:
                active = False
            continue
        quiet_ticks = 0
        steady = (row["tick"] - episode_alerted_tick) >= RE_ALERT_MINUTES
        if not active or steady:
            alerts += 1
            active = True
            episode_alerted_tick = row["tick"]
            if first_alert is None:
                first_alert = row["tick"]
    return {"first_alert_tick": first_alert, "first_alert_time_min": first_alert,
            "alerts": alerts}


def _verdict(pers: dict, naive: dict, lead: float | None) -> str:
    parts = []
    if lead is not None:
        parts.append(f"Personalized engine alerted {lead:.0f} min earlier")
    elif pers["first_alert_tick"] is not None and naive["first_alert_tick"] is None:
        parts.append("Only the personalized engine detected deterioration")
    else:
        parts.append("Both engines comparable on first-alert time")
    parts.append(f"alerts/day {pers['alerts_per_day']} vs naive {naive['alerts_per_day']}")
    parts.append(f"{pers['artifact_suppressions']} artifact reading(s) suppressed")
    return "; ".join(parts)


def evaluation_matrix(patients: list[str] | None = None, seed: int = 42) -> dict:
    patients = patients or [p["id"] for p in __import__("app.seed", fromlist=["PATIENTS"]).PATIENTS]
    results = []
    for scenario in ("slow_deterioration", "sensor_artifact", "probe_removal", "stable_recovery"):
        for pid in patients:
            results.append(run_scenario(scenario, pid, seed=seed))
    agg = _aggregate(results)
    return {"results": results, "aggregate": agg, "report_markdown": render_markdown(results, agg)}


def _aggregate(results: list[dict]) -> dict:
    # Naive fixed SpO2<92 false-alarms from tick 0 for hypercapnia (Scale 2) patients —
    # exclude those first-alert rows from the lead-time mean; they are naive FALSE ALERTS, not detections.
    excluded_false_alarms = []
    for r in results:
        if r["scenario"] != "slow_deterioration" or r["detection_lead_time_minutes"] is None:
            continue
        if bool(scoring.patient_profile(r["patient_id"]).get("risk_flags", {}).get("hypercapnia")) \
                and r["naive"]["first_alert_tick"] == 0:
            excluded_false_alarms.append(r["patient_id"])
    lead_times = [r["detection_lead_time_minutes"] for r in results
                  if r["scenario"] == "slow_deterioration" and r["detection_lead_time_minutes"] is not None
                  and r["patient_id"] not in excluded_false_alarms]
    art = [r for r in results if r["scenario"] in ("sensor_artifact", "probe_removal")]
    suppression = sum(r["personalized"]["artifact_suppressions"] for r in art)
    naive_artifact_alerts = sum(r["naive"]["alerts"] for r in art)
    det = [r for r in results if r["scenario"] == "slow_deterioration"]
    return {
        "mean_detection_lead_time_minutes": round(statistics.fmean(lead_times), 1) if lead_times else None,
        "slow_deterioration_personalized_alerts_per_day": round(statistics.fmean(r["personalized"]["alerts_per_day"] for r in det), 2) if det else None,
        "slow_deterioration_naive_alerts_per_day": round(statistics.fmean(r["naive"]["alerts_per_day"] for r in det), 2) if det else None,
        "artifact_readings_suppressed": suppression,
        "naive_artifact_alerts": naive_artifact_alerts,
        "patients_evaluated": len({r["patient_id"] for r in results}),
        "naive_baseline_false_alarms_excluded": excluded_false_alarms,
    }


def render_markdown(results: list[dict], agg: dict) -> str:
    naive_note = ""
    if agg.get("naive_baseline_false_alarms_excluded"):
        naive_note = (f"\n- Note: naive fixed SpO2<92 false-alarms from minute 0 for "
                      f"{', '.join(agg['naive_baseline_false_alarms_excluded'])} (Scale 2 hypercapnia); "
                      f"excluded from the lead-time mean as naive false alerts, not detections.")
    lines = [
        "# DIstoHelp — Scenario Replay Performance Report",
        "",
        "Comparison of the personalized NEWS2-style engine vs naive fixed-threshold monitoring.",
        "",
        f"- Slow-deterioration mean detection lead time: **{agg['mean_detection_lead_time_minutes']} min**",
        f"- Slow-deterioration alerts/patient-day — personalized **{agg['slow_deterioration_personalized_alerts_per_day']}** vs naive **{agg['slow_deterioration_naive_alerts_per_day']}**",
        f"- Artifact readings suppressed by pipeline: **{agg['artifact_readings_suppressed']}** (naive raised {agg['naive_artifact_alerts']} alerts on those scenarios)"
        + naive_note,
        "",
        "| Scenario | Patient | P-first alert (min) | Naive first alert (min) | Lead (min) | P alerts/day | Naive alerts/day | Artifacts suppressed |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        p, n = r["personalized"], r["naive"]
        lines.append(
            f"| {r['scenario']} | {r['patient_id']} | {p['first_alert_time_min']} | {n['first_alert_time_min']} "
            f"| {r['detection_lead_time_minutes']} | {p['alerts_per_day']} | {n['alerts_per_day']} | {p['artifact_suppressions']} |"
        )
    lines += ["", "*Generated by the DIstoHelp scenario replay engine. Clinical decision support only — not a medical diagnosis.*"]
    return "\n".join(lines)
