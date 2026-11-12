"""Shared deterministic simulation engine for the virtual wearable.

`simulate()` yields one vital-sign tick at a time. The real-time simulator
steps through it with sleeps; the scenario evaluator consumes it instantly.
Body temperature is always synthesized here (BIDMC has no temperature).
"""
import random

BASELINES = {
    "p01": {"hr": 88, "spo2": 90, "rr": 17, "temp": 36.6},   # COPD, CO2 retainer (RR 17 = 0 NEWS2 pts)
    "p02": {"hr": 72, "spo2": 96, "rr": 16, "temp": 36.5},   # heart failure, beta-blocker
    "p03": {"hr": 78, "spo2": 97, "rr": 14, "temp": 36.7},   # T2DM + CKD
    "p04": {"hr": 80, "spo2": 96, "rr": 15, "temp": 36.8},   # post-TKR, beta-blocker
    "p05": {"hr": 70, "spo2": 97, "rr": 15, "temp": 36.6},   # T2DM + asthma + beta-blocker
}

SCENARIOS = ["stable_recovery", "slow_deterioration", "sudden_spike",
             "sensor_artifact", "probe_removal", "missing_data"]


def simulate(scenario: str, patient_id: str, n_ticks: int, seed: int = 42):
    rng = random.Random(seed)
    base = dict(BASELINES.get(patient_id, {"hr": 76, "spo2": 96, "rr": 15, "temp": 36.6}))
    for t in range(n_ticks):
        frac = t / max(n_ticks - 1, 1)
        hr = base["hr"] + rng.gauss(0, 4)
        rr = base["rr"] + rng.gauss(0, 1.2)
        spo2 = base["spo2"] + rng.gauss(0, 0.6)
        temp = base["temp"] + rng.gauss(0, 0.12)
        drop = False

        if scenario == "stable_recovery":
            # slight improvement over time (recovery)
            rr -= 2.0 * frac
            hr -= 6.0 * frac
            spo2 += 0.8 * frac
        elif scenario == "slow_deterioration":
            rr += 9.0 * frac            # 15 -> 24
            spo2 -= 7.0 * frac          # SpO2 falls gradually
            hr += 26.0 * frac           # HR climbs
            temp += 1.1 * frac          # low-grade fever develops
        elif scenario == "sudden_spike":
            if frac >= 0.30:
                hr += 42; rr += 9; spo2 -= 5.5; temp += 0.6
        elif scenario == "sensor_artifact":
            # motion-noise bursts every ~45 ticks
            if t % 45 in (0, 1):
                spo2 -= rng.uniform(9, 14)
                hr += rng.uniform(35, 50) * rng.choice([-1, 1])
            # probe-removal episode every ~60 ticks, lasts 8 ticks
            if t % 60 in range(8):
                spo2, hr = 0.0, 63.0    # sentinel value + flatlined HR
            # random dropouts (~3% of ticks)
            if rng.random() < 0.03:
                drop = True
        elif scenario == "probe_removal":
            if t % 50 in range(10):
                spo2, hr = 0.0, 63.0
        elif scenario == "missing_data":
            if frac >= 0.40:
                drop = True             # device went silent

        yield {
            "tick": t,
            "drop": drop,
            "heart_rate": round(hr, 1),
            "respiratory_rate": round(rr, 1),
            "spo2": round(max(spo2, 0.0), 1),
            "temperature": round(temp, 2),
        }
