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
"""

def init_db() -> None:
    with _lock, get_conn() as conn:
        conn.executescript(SCHEMA)

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
