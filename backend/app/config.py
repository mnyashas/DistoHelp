"""Runtime configuration (env-driven, with hackathon-safe defaults)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

HAPI_FHIR_URL = os.getenv("HAPI_FHIR_URL", "http://localhost:8080/fhir")
DB_PATH = os.getenv("DB_PATH", str(DATA_DIR / "distohelp.db"))
BIDMC_DIR = os.getenv("BIDMC_DIR", str(BASE_DIR.parent / "data" / "bidmc"))
BIDMC_SAMPLE = BASE_DIR.parent / "data" / "bidmc_sample" / "bidmc_demo_Numerics.csv"

# Minutes of wall-clock per simulated tick for accelerated playback.
SIM_MINUTES_PER_TICK = float(os.getenv("SIM_MINUTES_PER_TICK", "1"))
# Alert de-dup: identical (patient, level, rule) within this window is suppressed.
ALERT_DEDUP_MINUTES = float(os.getenv("ALERT_DEDUP_MINUTES", "10"))
# Missing-data threshold: device silent this long -> missing-data alert.
MISSING_DATA_MINUTES = float(os.getenv("MISSING_DATA_MINUTES", "10"))
# Optional webhook for escalations (e.g. Twilio/MSG91 relay). Empty = log+store only.
ESCALATION_WEBHOOK_URL = os.getenv("ESCALATION_WEBHOOK_URL", "")
# Demo OTP for the frontend's simulated Aadhaar login. Change for real SMS relay.
DEMO_OTP = os.getenv("DEMO_OTP", "123456")
# Shared secret for ESP32 devices posting to /api/sensors/readings (x-device-key)
DEVICE_KEY = os.getenv("DEVICE_KEY", "demo-esp32-key")

DISCLAIMER = (
    "Clinical decision support only — this system is NOT a medical diagnosis system. "
    "All alerts must be reviewed by a qualified clinician."
)
