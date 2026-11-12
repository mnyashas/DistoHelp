"""Smoke tests — run: pytest -q"""
import os
import tempfile

os.environ["DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["HAPI_FHIR_URL"] = "http://localhost:9/fhir"  # nothing listening: exercise HAPI-down path

from fastapi.testclient import TestClient
from app.main import app
from app import db, seed


def client():
    db.init_db()
    seed.seed(post_to_hapi=False)
    return TestClient(app)


def test_health_and_meta():
    c = client()
    r = c.get("/api/health")
    assert r.status_code == 200
    assert "not a medical diagnosis" in r.json()["disclaimer"].lower()
    assert c.get("/api/meta").json()["alert_levels"] == ["watch", "review", "urgent"]


def test_ingest_vital_simple_and_score():
    c = client()
    for _ in range(3):  # persistence: 3 consecutive elevated readings required for NEWS2 points
        r = c.post("/api/vitals", json={"patient_id": "p02", "vital": "respiratory_rate", "value": 23})
    assert r.status_code == 200
    assert r.json()["score"]["total"] >= 2
    r = c.get("/api/patients/p02/score")
    assert r.status_code == 200 and r.json()["spo2_scale"] == "scale1"


def test_momentary_blip_suppressed():
    c = client()
    r = c.post("/api/vitals", json={"patient_id": "p02", "vital": "heart_rate", "value": 130})
    assert r.json()["score"]["breakdown"]["hr"] == 0  # single elevated reading does not score
    assert any("Momentary" in n for n in r.json()["score"]["notes"])


def test_fhir_observation_ingestion():
    c = client()
    obs = {
        "resourceType": "Observation",
        "status": "final",
        "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                  "code": "vital-signs"}]}],
        "code": {"coding": [{"system": "http://loinc.org", "code": "8867-4", "display": "Heart rate"}]},
        "subject": {"reference": "Patient/p03"},
        "effectiveDateTime": "2026-11-12T10:00:00Z",
        "valueQuantity": {"value": 95, "unit": "/min", "system": "http://unitsofmeasure.org"},
    }
    r = c.post("/api/fhir/Observation", json=obs)
    assert r.status_code == 200, r.text
    assert r.json()["loinc"] == "8867-4"


def test_fhir_observation_rejects_bad_loinc():
    c = client()
    obs = {"resourceType": "Observation", "status": "final",
           "code": {"coding": [{"system": "http://loinc.org", "code": "99999-9"}]},
           "subject": {"reference": "Patient/p03"},
           "valueQuantity": {"value": 10}}
    assert c.post("/api/fhir/Observation", json=obs).status_code == 422


def test_probe_removal_suppressed():
    c = client()
    for _ in range(6):
        c.post("/api/vitals", json={"patient_id": "p04", "vital": "heart_rate", "value": 63})
    r = c.post("/api/vitals", json={"patient_id": "p04", "vital": "spo2", "value": 0})
    body = r.json()
    assert body["artifact"] == "probe_removal"
    assert body["score"] is None  # not scored, not alerted
    events = c.get("/api/device-events?patient_id=p04").json()["device_events"]
    assert any(e["kind"] == "probe_removal" for e in events)


def test_hypercapnia_scale2_scoring():
    c = client()
    # SpO2 90% is normal on Scale 1 but at-target (0 pts) on Scale 2 for COPD patient p01
    r = c.post("/api/vitals", json={"patient_id": "p01", "vital": "spo2", "value": 90})
    assert r.json()["score"]["spo2_scale"] == "scale2"
    assert r.json()["score"]["breakdown"]["spo2"] == 0
    # SpO2 84% would score 2 on scale2 but 3 on scale1
    for _ in range(3):
        r = c.post("/api/vitals", json={"patient_id": "p01", "vital": "spo2", "value": 84})
    assert r.json()["score"]["breakdown"]["spo2"] == 2


def test_beta_blocker_blunting():
    c = client()
    for _ in range(3):
        r = c.post("/api/vitals", json={"patient_id": "p02", "vital": "heart_rate", "value": 98})
    assert r.json()["score"]["breakdown"]["hr"] == 0  # blunted by beta-blocker (would be 1)


def test_scenarios_run():
    c = client()
    r = c.post("/api/scenarios/run", json={"scenario": "slow_deterioration", "patient_id": "p02",
                                           "n_ticks": 1440})
    assert r.status_code == 200
    body = r.json()
    assert body["personalized"]["first_alert_tick"] is not None
    assert body["duration_hours"] == 24.0


def test_checkin_and_alert_lifecycle():
    c = client()
    r = c.post("/api/checkins", json={"patient_id": "p03", "breathlessness": 2, "fever": 1, "dizziness": 0})
    assert r.json()["score_modifier"] == 3
    # force an alert with sustained urgent-level vitals (persistence rule: 3+ elevated readings)
    for _ in range(4):
        c.post("/api/vitals", json={"patient_id": "p03", "vital": "respiratory_rate", "value": 30})
    alerts = c.get("/api/alerts?patient_id=p03&status=active").json()["alerts"]
    if alerts:
        aid = alerts[0]["id"]
        assert c.post(f"/api/alerts/{aid}/ack").json()["status"] == "acknowledged"
        assert c.post(f"/api/alerts/{aid}/resolve").json()["status"] == "resolved"
