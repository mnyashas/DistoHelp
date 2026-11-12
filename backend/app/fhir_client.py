"""FHIR client for the HAPI R4 server + an async write-behind batch worker.

Reads/creates used by escalation stay synchronous (need immediate IDs).
Observation ingestion is fire-and-forget: observations queue into a background
thread and are flushed to HAPI in transactions (bundles) every flush cycle, so
the monitoring loop never blocks on FHIR server latency. Health is cached.
"""
import queue
import threading
import time

import httpx

from . import config, db

TIMEOUT = 5.0
_health_lock = threading.Lock()
_health = {"t": 0.0, "ok": False}
HEALTH_TTL = 30.0


def _check_health() -> bool:
    try:
        r = httpx.get(f"{config.HAPI_FHIR_URL.rstrip('/')}/metadata", timeout=3.0)
        return r.status_code == 200
    except Exception:
        return False


def health_check() -> bool:
    with _health_lock:
        if time.monotonic() - _health["t"] > HEALTH_TTL:
            _health["t"] = time.monotonic()
            _health["ok"] = _check_health()
        return _health["ok"]


def create_resource(resource_type: str, resource: dict, timeout: float = TIMEOUT) -> str | None:
    if not health_check():
        return None
    try:
        r = httpx.post(f"{config.HAPI_FHIR_URL.rstrip('/')}/{resource_type}",
                       json=resource, timeout=timeout)
        if r.status_code in (200, 201):
            return r.json().get("id")
    except Exception:
        pass
    return None


def create_flag(patient_fhir_id: str, title: str, detail: str, level: str) -> str | None:
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
        "extension": [{"url": "http://distohelp.local/severity", "valueCode": severity}],
        "period": {"start": db_now()},
    }
    return create_resource("Flag", flag)


def create_communication_request(patient_fhir_id: str, message: str, level: str) -> str | None:
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
    if not health_check():
        return []
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
    return db.now_iso()


class _HapiWorker:
    """Batches observations into FHIR transaction bundles, off the hot path."""

    def __init__(self) -> None:
        self.q: queue.Queue = queue.Queue(maxsize=2000)
        self._thread = threading.Thread(target=self._run, daemon=True, name="hapi-flush")
        self._started = False
        self.dropped = 0
        self.flushed = 0

    def start(self) -> None:
        if not self._started:
            self._started = True
            self._thread.start()

    def submit(self, observation: dict) -> bool:
        try:
            self.q.put_nowait(observation)
            return True
        except queue.Full:
            self.dropped += 1
            return False

    def _run(self) -> None:
        buf: list[dict] = []
        while True:
            try:
                item = self.q.get(timeout=1.0)
                buf.append(item)
            except queue.Empty:
                pass
            if buf and (len(buf) >= 25 or (self.q.empty() and len(buf) >= 1)):
                self._flush(buf)
                buf = []

    def _flush(self, observations: list[dict]) -> None:
        if not health_check():
            self.dropped += len(observations)   # nothing to write to; skip quietly
            return
        bundle = {
            "resourceType": "Bundle",
            "type": "transaction",
            "entry": [
                {"request": {"method": "POST", "url": "Observation"}, "resource": obs}
                for obs in observations
            ],
        }
        try:
            r = httpx.post(f"{config.HAPI_FHIR_URL.rstrip('/')}",
                           json=bundle, timeout=TIMEOUT)
            if r.status_code in (200, 201):
                self.flushed += len(observations)
                return
            # fall back to individual POSTs if batch rejected
            for obs in observations:
                create_resource("Observation", obs)
            self.flushed += len(observations)
        except Exception:
            self.dropped += len(observations)


WORKER = _HapiWorker()
