"""Shared constants: vital-sign LOINC map, plausible ranges, NEWS2 tables."""

LOINC = {
    "8867-4": {"display": "Heart rate", "unit": "/min", "system": "http://loinc.org"},
    "2708-6": {"display": "Oxygen saturation in Arterial blood", "unit": "%", "system": "http://loinc.org"},
    "9279-1": {"display": "Respiratory rate", "unit": "/min", "system": "http://loinc.org"},
    "8310-5": {"display": "Body temperature", "unit": "Cel", "system": "http://loinc.org"},
}

# Reverse lookup by short name (used by simple REST endpoints)
VITAL_BY_NAME = {
    "heart_rate": "8867-4",
    "hr": "8867-4",
    "spo2": "2708-6",
    "oxygen_saturation": "2708-6",
    "respiratory_rate": "9279-1",
    "rr": "9279-1",
    "temperature": "8310-5",
    "temp": "8310-5",
}

# Implausible (sensor-error) ranges. Outside these -> artifact, never scored.
PLAUSIBLE = {
    "8867-4": (20.0, 250.0),
    "2708-6": (50.0, 100.0),  # 0 is the explicit probe-removal sentinel
    "9279-1": (4.0, 60.0),
    "8310-5": (29.0, 43.0),
}

NEWS2_CAPTION = "NEWS2-style early warning score (adjusted for the 4 monitored vitals)"

def news2_rr(rr: float) -> int:
    if rr <= 8: return 3
    if rr <= 11: return 1
    if rr <= 20: return 0
    if rr <= 24: return 2
    return 3

def news2_hr(hr: float, beta_blocker: bool = False) -> int:
    """Beta-blocker blunting: thresholds shifted +10 bpm (personalization rule #3)."""
    shift = 10 if beta_blocker else 0
    if hr <= 40: return 3
    if hr <= 50 + shift: return 1
    if hr <= 90 + shift: return 0
    if hr <= 110 + shift: return 1
    if hr <= 130 + shift: return 2
    return 3

def news2_spo2_scale1(spo2: float) -> int:
    if spo2 <= 91: return 3
    if spo2 <= 93: return 2
    if spo2 <= 95: return 1
    return 0

def news2_spo2_scale2(spo2: float) -> int:
    """Hypercapnic respiratory failure scale (target 88-92%)."""
    if spo2 <= 83: return 3
    if spo2 <= 85: return 2
    if spo2 <= 87: return 1
    if spo2 <= 92: return 0
    return 1  # >=93% on air for a known CO2-retainer is worth noting

def news2_temp(t: float) -> int:
    if t <= 35.0: return 3
    if t <= 36.0: return 1
    if t <= 38.0: return 0
    if t <= 39.0: return 1
    return 2

LEVEL_ORDER = {"watch": 1, "review": 2, "urgent": 3}

def tier_from_score(total: int, param_scores: list[int]) -> str:
    if total >= 7:
        return "urgent"
    if total >= 5 or any(s == 3 for s in param_scores):
        return "review"
    if total >= 2:  # single 1-point vital (noise-level) is not watch-worthy
        return "watch"
    return "none"
