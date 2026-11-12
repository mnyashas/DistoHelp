"""SQLite persistence for the app read-model. HAPI FHIR remains the system of
record for observations; this DB holds alerts, scores, baselines and demo state
so the dashboard stays fast."""
import json
import sqlite3
import threading
from datetime import datetime, timezone

from . import config

_lock = threading.Lock()

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

SCHEMA = """
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  dob TEXT,
  fhir_ref TEXT,
  conditions TEXT NOT NULL DEFAULT '[]',   -- JSON [{code,display,clinicalStatus}]
  medications TEXT NOT NULL DEFAULT '[]',  -- JSON [{code,display,beta_blocker}]
  risk_flags TEXT NOT NULL DEFAULT '{}',   -- JSON {hypercapnia: bool, beta_blocker: bool, on_oxygen: bool}
  phone TEXT,
  address TEXT,
  medical_history TEXT,
  registered_on TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  loinc TEXT NOT NULL,
  display TEXT,
  value REAL,
  unit TEXT,
  effective_time TEXT NOT NULL,
  source TEXT NOT NULL,               -- simulator | bidmc | device | fhir
  artifact TEXT,                      -- NULL = clean, else artifact kind
  fhir_ref TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obs_patient_code ON observations(patient_id, loinc, id);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  total INTEGER NOT NULL,
  level TEXT NOT NULL,                -- none|watch|review|urgent
  spo2_scale TEXT NOT NULL,           -- scale1 | scale2
  breakdown TEXT NOT NULL,            -- JSON {hr:n, spo2:n, rr:n, temp:n}
  drift TEXT NOT NULL DEFAULT '{}',   -- JSON per-vital rolling z-scores
  notes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_patient ON scores(patient_id, id);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  level TEXT NOT NULL,                -- watch|review|urgent
  rule TEXT NOT NULL,
  reading TEXT NOT NULL,              -- JSON {loinc, display, value, unit}
  profile_fact TEXT NOT NULL,
  explanation TEXT NOT NULL,
  score_total INTEGER,
  status TEXT NOT NULL DEFAULT 'active',   -- active|acknowledged|resolved
  source TEXT NOT NULL DEFAULT 'monitoring',
  created_at TEXT NOT NULL,
  acked_at TEXT,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_patient ON alerts(patient_id, id);
CREATE TABLE IF NOT EXISTS device_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- implausible|flatline|probe_removal|motion_noise|dropout|missing_data
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  breathlessness INTEGER NOT NULL DEFAULT 0,   -- 0 none, 1 mild, 2 severe
  fever INTEGER NOT NULL DEFAULT 0,            -- 0/1
  dizziness INTEGER NOT NULL DEFAULT 0,        -- 0 none, 1 mild, 2 severe
  notes TEXT,
  score_modifier INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  level TEXT NOT NULL,
  alert_id INTEGER,
  message_en TEXT NOT NULL,
  message_hi TEXT NOT NULL,
  message_kn TEXT NOT NULL,
  sent_via TEXT NOT NULL DEFAULT 'stored',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scenario_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  summary TEXT NOT NULL,              -- JSON
  report_md TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS monitoring_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',   -- manual | simulated | esp32 | bidmc
  measured_at TEXT NOT NULL,
  vitals TEXT NOT NULL,                    -- JSON incl. height/weight/bmi/systolic/diastolic/onOxygen/consciousness
  news2 TEXT NOT NULL,                     -- JSON {total, complete, escalation, items, risk}
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_patient ON monitoring_records(patient_id, id);
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  main_complaint TEXT NOT NULL,
  symptoms TEXT,
  duration TEXT,
  pain_description TEXT,
  existing_conditions TEXT,
  current_medications TEXT,
  allergies TEXT,
  additional_observations TEXT,
  staff_remarks TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  device_key TEXT,
  read_at TEXT NOT NULL,
  vitals TEXT NOT NULL,                  -- JSON
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relation TEXT,             -- spouse | parent | child | friend | doctor | caregiver
  phone TEXT NOT NULL,
  via TEXT NOT NULL DEFAULT 'auto',   -- auto | textbelt | telegram | msg91 | twilio
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_emergency_patient ON emergency_contacts(patient_id);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  aadhaar TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""

def _migrate(conn) -> None:
    """Idempotent column additions for DBs created before these columns existed."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(patients)").fetchall()}
    for col, decl in (("phone", "TEXT"), ("address", "TEXT"),
                      ("medical_history", "TEXT"), ("registered_on", "TEXT")):
        if col not in cols:
            conn.execute(f"ALTER TABLE patients ADD COLUMN {col} {decl}")


def init_db() -> None:
    with _lock, get_conn() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)

def execute(sql: str, params: tuple = ()) -> sqlite3.Cursor:
    with _lock, get_conn() as conn:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur

def query(sql: str, params: tuple = ()) -> list[dict]:
    with get_conn() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]

def query_one(sql: str, params: tuple = ()) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(sql, params).fetchone()
        return dict(row) if row else None

def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False)

def loads(s):
    return json.loads(s) if s else None
