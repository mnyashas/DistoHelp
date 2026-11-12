# Frontend agent — read this first

You own `frontend/` **only**. Do not touch `backend/`, `contract/`, or root files.
The backend laptop exposes everything you need; do not implement scoring/FHIR logic in the UI.

## What to build

A clinician dashboard (React/Next/Vite — your call) + a patient symptom check-in view.

### Screens
1. **Dashboard** — grid of patients (from `GET /api/dashboard`): name, age, conditions chips,
   latest NEWS2 score with color-coded level (`none`=green, `watch`=yellow, `review`=orange, `urgent`=red),
   active alert count, urgent count.
2. **Patient detail** — `GET /api/patients/{id}`
   - conditions + medications (badge beta-blockers `⚕ beta-blocker`, hypercapnia `SpO2 Scale 2`)
   - vitals charts (`GET /api/patients/{id}/vitals`) — HR, SpO2, RR, temp; mark artifact points grey
   - NEWS2 breakdown bar chart (`score.breakdown`) + drift z-scores (`score.drift`)
   - personalization notes list (`score.notes`)
3. **Alerts feed** — `GET /api/alerts` (+ live via WS). Each alert MUST render:
   `reading` (vital + value), `rule`, `profile_fact`, `explanation`, level chip, status, ack/resolve buttons.
4. **Device events panel** — `GET /api/device-events` — grey info badges, visually separate from clinical alerts.
5. **Escalation** — button on each alert → `POST /api/escalations` → shows EN/HI/KN messages.
6. **Patient check-in form** (patient-facing route) — breathlessness 0–2, fever 0/1, dizziness 0–2 → `POST /api/checkins`.
7. **Demo controller** (hackathon only) — buttons to start/stop `POST /api/simulator/{id}/start` with scenario select,
   `POST /api/bidmc/replay`, and `POST /api/scenarios/evaluate` → render `report_markdown`.
8. **Missing-data banner** — `GET /api/missing-data`.

## Mandatory disclaimer

Show this banner on **every screen**:
> "Clinical decision support only — this system is NOT a medical diagnosis. All alerts must be reviewed by a qualified clinician."
(also available as `disclaimer` in `GET /api/meta`.)

## Config

```
VITE_API_URL=http://<backend-laptop-ip>:8000   # or http://localhost:8000
```
Never hardcode the host. WS URL derives from it: `ws://<host>:8000/ws/live`.

## Mocking until the backend is up

Use MSW or a static JSON server seeded from `contract/examples/` payloads. The contract is stable;
field names there are final. See `contract/openapi.yaml` and `contract/WEBSOCKET.md`.

## Integration checklist (final step, both agents together)

- [ ] `VITE_API_URL` points at the backend laptop/LAN IP
- [ ] Dashboard loads 5 seeded patients
- [ ] Start `slow_deterioration` simulator on p02 → vitals chart animates, score climbs, alert fires with explanation
- [ ] Probe-removal scenario → grey device badge, NO red alert
- [ ] "Escalate" on an alert → HI/KN message appears
- [ ] `POST /api/scenarios/evaluate` → report renders
- [ ] Disclaimer visible everywhere
