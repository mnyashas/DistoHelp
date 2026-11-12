# DIstoHelp — Personalized Post-Discharge Deterioration Monitor

MineArena 1.0 · Code Commit, BIET Davangere · 12–13 Nov 2026 · PS-03
Domain: HealthTech & Digital Health

Intelligent post-discharge monitoring: FHIR R4 vital-sign ingestion, HAPI FHIR storage,
personalized NEWS2-style scoring (SpO2 Scale 2 for hypercapnia, rolling per-patient baselines,
beta-blocker HR blunting), sensor-artifact suppression, explainable Watch/Review/Urgent alerts,
and a clinician dashboard.

> **Clinical decision support only — NOT a medical diagnosis system.**

## Repository layout (2-laptop build, merged)

| Folder | Owner | Purpose |
|---|---|---|
| `backend/` | Backend agent | FastAPI + SQLite read-model + HAPI FHIR client + frontend compat layer |
| `frontend/` | Frontend agent | React app ("Smart Patient Monitoring & Early Warning System") |
| `contract/` | Both (frozen) | `openapi.yaml`, `WEBSOCKET.md`, `COMPAT.md` |
| `AGENTS.md` | Both | Scope + golden rules |
| `docker-compose.yml` | Backend | HAPI FHIR R4 (preferred) |
| `scripts/` | Backend | BIDMC downloader, Synthea regeneration, public-sandbox runner |
| `data/bidmc_sample/` | Backend | Bundled 90-min BIDMC-format demo record (offline replay) |

## Quick start (backend laptop)

```powershell
# 1. HAPI FHIR R4 — pick ONE:
docker compose up -d            # (a) preferred, if Docker is available
scripts\run_hapi_public.ps1     # (b) no Docker: use the public HAPI R4 sandbox (hapi.fhir.org/baseR4)
# (c) build from source: clone github.com/hapifhir/hapi-fhir-jpaserver-starter (needs Maven+JDK)
#     and set HAPI_FHIR_URL=http://localhost:8080/fhir

# 2. Backend
cd backend
python -m venv .venv; .\.venv\Scripts\activate
pip install -r requirements.txt
$env:HAPI_FHIR_URL = "http://localhost:8080/fhir"   # or (b)'s public URL
uvicorn app.main:app --reload --port 8000

# 3. Open http://localhost:8000/docs — 5 Synthea-style patients auto-seed
```

Optional data:
```powershell
scripts\download_bidmc.ps1      # full PhysioNet BIDMC CSVs (open access)
scripts\generate_synthea.ps1    # regenerate profiles with real Synthea
```

Tests: `cd backend; python -m pytest -q`

## Run the whole demo (one laptop)

```powershell
# Terminal 1 — backend (HAPI FHIR: docker compose up -d, or nothing for SQLite-only demo)
cd backend; python -m venv .venv; .\.venv\Scripts\activate; pip install -r requirements.txt
uvicorn app.main:app --port 8000

# Terminal 2 — frontend
cd frontend; npm install; npm run dev    # http://localhost:5173
```

Sign in with the demo account (Aadhaar `999941057058`, mobile `9876543210`, OTP `123456`).
See `frontend/README.md` for screens and the demo storyline. The frontend talks to the backend
through the Vite proxy (`/api` → `:8000`) via the compatibility layer in `backend/app/compat.py`;
PS-03 contract endpoints remain available alongside it. Frontend ↔ backend link verified:
HTML served at :5173, proxied `/api/patients` returns the 5 seeded patients.

## Demo script (6 minutes)

1. Sign in at http://localhost:5173 → Dashboard: 5 patients, p02 flagged High Risk (NEWS2 7).
2. **Live Monitoring** (`/live`) → **Start demo streams**: p02 drifts into deterioration on the
   telemetry grid, artifacts get suppressed, alert banner + chime fire, ack/resolve from the stream.
3. Open **watch companion** (`/watch?p=p02`) on a phone on the same LAN — wrist UI streams live
   vitals over WebSocket; URGENT flashes + buzzes.
4. `POST /api/simulator/p04/start {"scenario":"probe_removal"}` → grey device badge, **no** red alert.
5. `POST /api/escalations {"alert_id": …}` → EN/HI/KN message + FHIR Flag/CommunicationRequest.
6. `POST /api/scenarios/evaluate` → performance report: detection lead time & alerts/patient-day vs naive thresholds.
7. `GET /api/hapi/status` → shows async HAPI worker stats (`observations_flushed`, queue depth).

## Evaluation criteria coverage

Measured on the bundled deterministic replay (1-minute ticks, 24 h, 5 patients, seed 42):

- **Detection lead time**: **~516 min earlier** mean detection on slow_deterioration vs naive fixed-threshold rules (p02–p05). Naive's p01 minute-0 "alert" is a false alarm on the Scale-2 hypercapnia baseline and is disclosed/excluded in the report.
- **Alert efficiency**: 7.2 alerts/patient-day on slow_deterioration (vs naive 4.6 — personalized trades modestly more alerts for ~8.6 h earlier lead); **0.0 on stable_recovery and artifact replay** (naive: 28–29 false alerts/day there).
- **False-alert suppression**: **2,934 artifact readings suppressed** across replay; naive raised 236 alerts over the same scenarios.
- **FHIR compliance**: Observations are LOINC-coded R4 Vital Signs stored in HAPI FHIR (verified end-to-end: `Observation/<id>` returned on store). Validated with `fhir.resources`.
- **Explainability**: every alert carries `reading` + `rule` + `profile_fact` + `explanation`; artifact issues are device events, never clinical alerts.

- FHIR endpoints: `POST /api/fhir/Observation`, storage in HAPI R4 R4B (Docker or public sandbox `hapi.fhir.org/baseR4`)
