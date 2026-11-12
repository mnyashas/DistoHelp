# DIstoHelp backend

FastAPI service implementing PS-03. See repo root `README.md` for the full story and `../contract/openapi.yaml` for the frozen API contract.

## Architecture

```
wearable/simulator ─┐
BIDMC replay ───────┼─► POST /api/fhir/Observation ─► artifact filter ─► HAPI FHIR R4 (:8080/fhir)
packet forwarder ───┘         │                            │ (device events)
                              ▼                            ▼
                      SQLite read-model ◄──────── NEWS2 + personalization ◄── symptom check-ins
                              │
                              ▼
              /ws/live broadcast ──► dashboard (frontend agent)
```

## Modules (`app/`)

- `pipeline.py` — validate (fhir.resources) → artifact filter → HAPI store → score → alert → WS broadcast
- `scoring.py` — NEWS2 baseline + 3 personalization rules + drift z-scores + check-in modifiers
- `artifacts.py` — plausibility, flatline (6 identical), probe removal (SpO2=0 + flatlined HR), motion noise, dropout/missing data
- `alerts.py` — Watch/Review/Urgent tiers, dedup window, ack/resolve lifecycle, explainable payloads
- `sim_engine.py` + `simulator.py` — deterministic scenario engine (seeded) + async real-time streaming
- `scenarios.py` — offline replay evaluation vs naive fixed-threshold; markdown report
- `bidmc.py` — PhysioNet BIDMC Numerics replay (HR/RESP/SpO2), temperature synthesized, bundled demo record
- `escalation.py` — FHIR Flag + CommunicationRequest; EN/HI/KN notification; optional webhook relay
- `seed.py` — 5 Synthea-style discharge profiles (SNOMED/RxNorm)
- `db.py` — SQLite read-model (patients, observations, scores, alerts, device_events, checkins, notifications, scenario_runs)

## Personalization rules

1. **SpO2 Scale 2** (88–92%) when the profile documents hypercapnic respiratory failure (p01).
2. **Rolling baselines** — last 60 readings per vital; z ≥ 2 flags gradual deterioration, adds score.
3. **Beta-blocker blunting** — HR NEWS2 thresholds +10 bpm (p02 carvedilol, p04 metoprolol, p05 atenolol).
4. **Symptom check-ins** — breathlessness 1/2 → +1/+2, fever → +1, dizziness 1/2 → +1/+2.

## HAPI FHIR

Observations are `category=vital-signs`, LOINC-coded, posted to `{HAPI_FHIR_URL}/Observation`.
The service degrades gracefully: if HAPI is down, ingestion + scoring + alerting still work;
`/api/health` reports `hapi_fhir: false`.

## Tests

`python -m pytest -q` — 9 smoke tests covering ingestion, both personalization scales,
probe-removal suppression, scenario lead time, alert lifecycle.
