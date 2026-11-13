"""Observation ingestion pipeline: validate -> artifact-filter -> store (HAPI +
SQLite) -> score -> alert -> broadcast. Used identically by the FHIR API, the
simple /api/vitals endpoint, the simulator, BIDMC replay and the scenario runner."""
from datetime import datetime, timezone

from . import artifacts, constants, db, scoring, alerts, fhir_client
try:
    from fhir.resources.R4B.observation import Observation as _FHIRObs
    HAVE_FHIR_LIB = True
except Exception:  # older fhir.resources layout fallback
    try:
        from fhir.resources.R4.observation import Observation as _FHIRObs
        HAVE_FHIR_LIB = True
    except Exception:
        HAVE_FHIR_LIB = False

LOINC_TO_NAME = {v: k for k, v in constants.VITAL_BY_NAME.items()}


def parse_fhir_observation(obs: dict) -> dict:
    errors = []
    if obs.get("resourceType") != "Observation":
        errors.append("resourceType must be 'Observation'")
    if HAVE_FHIR_LIB:
        try:
            _FHIRObs.model_validate(obs)
        except Exception as e:
            errors.append(f"FHIR validation failed: {e}")
    codings = (obs.get("code") or {}).get("coding", [])
    loinc = next((c.get("code") for c in codings
                  if c.get("system") == "http://loinc.org" and c.get("code") in constants.LOINC), None)
    if not loinc:
        errors.append(f"No supported LOINC code found (supported: {', '.join(constants.LOINC)})")
    value = obs.get("valueQuantity", {}).get("value")
    if value is None:
        # allow dataAbsentReason (e.g. probe removed -> value absent)
        if "dataAbsentReason" not in obs:
            errors.append("valueQuantity.value missing (or dataAbsentReason for absent values)")
    subject = (obs.get("subject") or {}).get("reference", "")
    patient_id = subject.split("/")[-1] if subject else None
    if not patient_id:
        errors.append("subject.reference must reference a Patient (e.g. 'Patient/p01')")
    if errors:
        raise ValueError("; ".join(errors))
    return {
        "loinc": loinc,
        "value": float(value) if value is not None else None,
        "unit": (obs.get("valueQuantity") or {}).get("unit"),
        "effective": obs.get("effectiveDateTime") or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "patient_id": patient_id,
    }


def build_fhir_observation(patient_id: str, loinc: str, value: float | None) -> dict:
    meta = constants.LOINC[loinc]
    obs = {
        "resourceType": "Observation",
        "status": "final",
        "category": [{"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
            "code": "vital-signs",
            "display": "Vital Signs",
        }]}],
        "code": {"coding": [{
            "system": "http://loinc.org",
            "code": loinc,
            "display": meta["display"],
        }], "text": meta["display"]},
        "subject": {"reference": f"Patient/{patient_id}"},
        "effectiveDateTime": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if value is None:
        obs["dataAbsentReason"] = {"coding": [{
            "system": "http://terminology.hl7.org/CodeSystem/data-absent-reason",
            "code": "temp-unknown",
        }]}
    else:
        obs["valueQuantity"] = {"value": value, "unit": meta["unit"],
                                "system": "http://unitsofmeasure.org", "code": meta["unit"]}
    return obs


def ingest_vital(patient_id: str, loinc: str, value: float | None, source: str) -> dict:
    """Common path for FHIR/simple/simulator/replay ingestion."""
    artifact = artifacts.detect(patient_id, loinc, value)
    if artifact:
        artifacts.record_device_event(
            patient_id, artifact,
            f"{constants.LOINC[loinc]['display']} reading {value} flagged as {artifact}",
        )

    db.execute(
        "INSERT INTO observations(patient_id,loinc,display,value,unit,effective_time,source,artifact,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (patient_id, loinc, constants.LOINC[loinc]["display"], value,
         constants.LOINC[loinc]["unit"], datetime.now(timezone.utc).isoformat(timespec="seconds"),
         source, artifact, db.now_iso()),
    )

    # Forward to HAPI FHIR asynchronously (transaction bundles, off the hot path)
    fhir_pid = _fhir_patient_id(patient_id)
    obs_json = build_fhir_observation(fhir_pid or patient_id, loinc, value)
    queued = fhir_client.WORKER.submit(obs_json)
    fhir_ref = None                      # assigned by HAPI asynchronously
    fhir_err = None if queued else "HAPI queue full; observations retained in SQLite only"
    hapi_ok = fhir_client.health_check()

    result = {
        "patient_id": patient_id,
        "loinc": loinc,
        "display": constants.LOINC[loinc]["display"],
        "value": value,
        "unit": constants.LOINC[loinc]["unit"],
        "artifact": artifact,
        "fhir_ref": fhir_ref,
        "hapi_ok": hapi_ok and fhir_err is None,
    }
    if artifact:
        result["alert"] = None
        result["score"] = None
        _broadcast({"type": "device_event", "data": {"patient_id": patient_id, "kind": artifact,
                                                     "value": value}})
        return result

    score = scoring.compute_score(patient_id)
    score_id = scoring.persist_score(score)
    score["id"] = score_id
    alert = alerts.generate_alert(score, source=source)
    bp_alert = _maybe_low_bp_alert(patient_id, source) if loinc in ("8480-6", "8462-4") else None

    payload = dict(result)
    payload["score"] = score
    payload["alert"] = alert or bp_alert
    _broadcast({"type": "vital", "data": {**result, "score": score, "alert": alert}})
    if alert:
        _broadcast({"type": "alert", "data": alert})
    if bp_alert:
        _broadcast({"type": "alert", "data": bp_alert})
    return payload


def _fhir_patient_id(patient_id: str) -> str | None:
    row = db.query_one("SELECT fhir_ref FROM patients WHERE id=?", (patient_id,))
    if row and row["fhir_ref"]:
        return row["fhir_ref"].split("/")[-1]
    return patient_id


def _maybe_low_bp_alert(patient_id: str, source: str = "monitoring") -> dict | None:
    """Dedicated hypotension watch. BP is deliberately NOT in the NEWS2 total —
    this is a separate, explainable triggered rule (sys<=88 or dia<=56 -> review,
    sys<=78 or dia<=48 -> urgent). Uses the same alert explainability + dedup + lifecycle."""
    sbp = scoring.latest_per_vital(patient_id).get("8480-6")
    dbp = scoring.latest_per_vital(patient_id).get("8462-4")
    if sbp is None and dbp is None:
        return None
    level = None
    if (sbp is not None and sbp <= 78) or (dbp is not None and dbp <= 48):
        level = "urgent"
    elif (sbp is not None and sbp <= 88) or (dbp is not None and dbp <= 56):
        level = "review"
    if not level:
        return None

    from . import config
    profile = scoring.patient_profile(patient_id)
    primary = ""
    conds = profile.get("conditions") or []
    if conds:
        primary = str(conds[0].get("display") if isinstance(conds[0], dict) else conds[0])

    rule = f"low_bp hypotension ({level}: sys<=88/dia<=56 review; sys<=78/dia<=48 urgent)"
    profile_fact = f"discharge profile: {primary}" if primary else "no documented conditions"
    reading = db.dumps({"loinc": "8480-6", "display": "Blood pressure",
                        "value": {"systolic": sbp, "diastolic": dbp}, "unit": "mmHg"})
    explanation = (f"Blood pressure {sbp}/{dbp} mmHg crossed hypotension thresholds. Rule: {rule}. "
                   f"Patient profile: {profile_fact}. "
                   f"HR may not rise enough to compensate (beta-blockade blunts the tachycardia) — recheck volume status and standing BP.")
    if alerts._recent_duplicate(patient_id, level, rule, config.ALERT_DEDUP_MINUTES):
        return None

    cur = db.execute(
        "INSERT INTO alerts(patient_id,level,rule,reading,profile_fact,explanation,score_total,source,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (patient_id, level, rule, reading, profile_fact, explanation, None, source, db.now_iso()),
    )
    alert = alerts.get_alert(cur.lastrowid)

    # hypotension -> message emergency contacts (NOTIFY_ON_CRITICAL gates the outbound message)
    if level == "urgent" and getattr(config, "NOTIFY_ON_CRITICAL", True):
        try:
            from . import notify
            notify.send_emergency(
                patient_id,
                "DIstoHelp: patient may be in danger",
                (f"{profile.get('name', patient_id)} may be in danger — blood pressure {sbp}/{dbp} mmHg "
                 f"(hypotension). Please check on them right now. If they seem seriously unwell, call emergency services."),
            )
        except Exception:
            pass
    return alert


def _broadcast(msg: dict) -> None:
    try:
        from . import ws
        ws.manager.broadcast_threadsafe(msg)
    except Exception:
        pass
