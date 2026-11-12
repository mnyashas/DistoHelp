"""BIDMC PPG and Respiration dataset replay (PhysioNet bidmc 1.0.0).

Expected files (download via scripts/download_bidmc.ps1):
  <BIDMC_DIR>/bidmc_01_Numerics.csv ...   (1 Hz: Time [s], HR, RESP, SpO2)
Fallback: a bundled 90-minute demo record at data/bidmc_sample/bidmc_demo_Numerics.csv
so replay works fully offline.

Body temperature does NOT exist in BIDMC — it is synthesized realistically here.
"""
import csv
import math
import random
import re
import time
from pathlib import Path

from . import config, pipeline

_replays: dict[str, dict] = {}


def available_records() -> list[str]:
    d = Path(config.BIDMC_DIR)
    found = []
    if d.exists():
        found += sorted(p.stem.split("_Numerics")[0] for p in d.glob("*_Numerics.csv"))
    sample = Path(config.BIDMC_SAMPLE)
    if sample.exists():
        found.append("demo")
    return found


def _load(record_id: str) -> list[dict]:
    if record_id == "demo":
        path = Path(config.BIDMC_SAMPLE)
    else:
        path = Path(config.BIDMC_DIR) / f"{record_id}_Numerics.csv"
    if not path.exists():
        raise FileNotFoundError(f"BIDMC record not found: {path}. Run scripts/download_bidmc.ps1")
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            norm = {re.sub(r"[^a-z0-9]", "", k.lower()): v for k, v in row.items()}
            def get(*keys):
                for k in keys:
                    if k in norm and norm[k] not in ("", "NaN", "nan"):
                        return float(norm[k])
                return None
            t = get("time", "times", "timeinseconds", "seconds") or 0.0
            hr = get("hr", "heartrate")
            rr = get("resp", "resprate", "respiration")
            spo2 = get("spo2", "spo2monitor", "spo2ppg", "sao2")
            rows.append({"t": t, "hr": hr, "respiratory_rate": rr, "spo2": spo2})
    return rows


def replay_status() -> dict:
    return _replays


def start_replay(record_id: str, patient_id: str, speed: float = 60.0, max_minutes: float | None = None):
    """speed = playback multiplier (1 = real-time, 60 = 60x). Runs synchronously
    in a background thread; poll /api/bidmc/status."""
    rows = _load(record_id)
    if max_minutes:
        rows = rows[: int(max_minutes * 60)]
    import threading

    state = _replays[patient_id] = {
        "patient_id": patient_id, "record": record_id, "speed": speed,
        "rows": len(rows), "emitted": 0, "running": True, "started": time.time(),
    }

    def _job():
        rng = random.Random(7)
        prev_t = None
        try:
            for row in rows:
                hr = row["hr"] or 75 + 2 * math.sin(row["t"] / 50)
                rr = row["respiratory_rate"] or 16
                spo2 = row["spo2"] or 96.0
                temp = 36.6 + 0.1 * math.sin(row["t"] / 900) + rng.gauss(0, 0.05)  # synthesized
                pipeline.ingest_vital(patient_id, "8867-4", round(hr, 1), source="bidmc")
                pipeline.ingest_vital(patient_id, "9279-1", round(rr, 1), source="bidmc")
                pipeline.ingest_vital(patient_id, "2708-6", round(spo2, 1), source="bidmc")
                pipeline.ingest_vital(patient_id, "8310-5", round(temp, 2), source="bidmc")
                state["emitted"] += 1
                if prev_t is not None and speed > 0:
                    time.sleep(max((row["t"] - prev_t) / speed, 0))
                prev_t = row["t"]
        except Exception as e:
            state["error"] = str(e)
        finally:
            state["running"] = False

    threading.Thread(target=_job, daemon=True).start()
    return state
