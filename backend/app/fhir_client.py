"""Thin client for the HAPI FHIR R4 server. Everything FHIR-shaped goes here.
All functions are best-effort: if HAPI is down the app keeps running on the
local read-model and surfaces the outage via health_check()."""
import httpx

from . import config

TIMEOUT = 10.0

def health_check() -> bool:
    try:
        r = httpx.get(f"{config.HAPI_FHIR_URL.rstrip('/')}/metadata", timeout=3.0)
        return r.status_code == 200
    except Exception:
        return False

def create_patient(bundle_entry: dict) -> str | None:
    """Create a Patient resource; bundle_entry is the Patient resource dict."""
    try:
        r = httpx.post(f"{config.HAPI_FHIR_URL.rstrip('/')}/Patient",
                       json=bundle_entry, timeout=TIMEOUT)
        if r.status_code in (200, 201):
            return r.json().get("id")
    except Exception:
        pass
    return None

def create_resource(resource_type: str, resource: dict) -> str | None:
    import time
    for attempt in range(2):  # one retry: public/sandbox servers can be flaky
        try:
            r = httpx.post(f"{config.HAPI_FHIR_URL.rstrip('/')}/{resource_type}",
                           json=resource, timeout=TIMEOUT)
            if r.status_code in (200, 201):
                return r.json().get("id")
        except Exception:
            pass
        time.sleep(0.5)
    return None

def create_observation(patient_fhir_id: str, observation: dict) -> str | None:
    obs = dict(observation)
    if patient_fhir_id and "subject" not in obs:
        obs["subject"] = {"reference": f"Patient/{patient_fhir_id}"}
    return create_resource("Observation", obs)

def create_flag(patient_fhir_id: str, title: str, detail: str, level: str) -> str | None:
    """FHIR Flag resource for escalation (registered on the HAPI server)."""
    severity = {"watch": "routine", "review": "urgent", "urgent": "critical"}.get(level, "urgent")
    flag = {
        "resourceType": "Flag",
        "status": "active",
        "category": [{"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/flag-category",
            "code": "clinical",
            "display": "Clinical",
        }]}],
        "code": {"text": title},
        "subject": {"reference": f"Patient/{patient_fhir_id}"},
        "extension": [{
            "url": "http://distohelp.local/severity",
            "valueCode": severity,
        }],
        "period": {"start": db_now()},
    }
    return create_resource("Flag", flag)

def create_communication_request(patient_fhir_id: str, message: str, level: str) -> str | None:
    """FHIR CommunicationRequest — instructs the care team to be notified."""
    priority = {"watch": "routine", "review": "asap", "urgent": "stat"}.get(level, "asap")
    cr = {
        "resourceType": "CommunicationRequest",
        "status": "active",
        "priority": priority,
        "subject": {"reference": f"Patient/{patient_fhir_id}"},
        "payload": [{"contentString": message}],
        "reasonCode": [{"text": f"Post-discharge deterioration — {level} alert"}],
        "authoredOn": db_now(),
    }
    return create_resource("CommunicationRequest", cr)

def search_observations(patient_fhir_id: str, loinc: str, count: int = 100) -> list[dict]:
    try:
        r = httpx.get(
            f"{config.HAPI_FHIR_URL.rstrip('/')}/Observation",
            params={
                "patient": f"Patient/{patient_fhir_id}",
                "code": f"http://loinc.org|{loinc}",
                "_sort": "-date",
                "_count": count,
            },
            timeout=TIMEOUT,
        )
        if r.status_code == 200:
            return r.json().get("entry", [])
    except Exception:
        pass
    return []

def db_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
