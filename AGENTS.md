# AGENTS.md — DIstoHelp (MineArena PS-03)

This repo is a **two-agent, two-laptop hackathon build**. Read this fully before writing code.

## Golden rules

1. **Scope is split by folder.**
   - Frontend agent: works **only** inside `frontend/`. Never edit `backend/`, `contract/`, `docker-compose.yml`, or root configs.
   - Backend (human + backend agent): owns `backend/`, `contract/`, root infra files.
   - Need a contract change? Edit `contract/openapi.yaml` **and** tell the other side — do not silently diverge.
2. **The contract is the source of truth**: `contract/openapi.yaml`. Field names, enums, and error shapes there are frozen once agreed.
3. **Never commit secrets.** Use `.env` (git-ignored). `.env.example` documents every variable.
4. **Pull before you push, push often.** Rebase on `main` before asking for integration.

## Disclaimer (mandatory in the UI)

This system is **clinical decision support, not medical diagnosis**. The frontend **must** render this
disclaimer visibly on every screen that shows scores or alerts. Backend also returns it in
`GET /api/meta` under `disclaimer`.

## Port map (local dev)

| Service            | URL                          |
|--------------------|------------------------------|
| Frontend           | http://localhost:5173 (Vite) |
| Backend (FastAPI)  | http://localhost:8000        |
| HAPI FHIR R4       | http://localhost:8080/fhir   |
| API docs (Swagger) | http://localhost:8000/docs   |
| WebSocket live     | ws://localhost:8000/ws/live  |

Frontend reads `VITE_API_URL` (default `http://localhost:8000`) — never hardcode the backend host.

## Personalization rules (backend-implemented; UI must surface them)

- SpO2 **Scale 2** (target 88–92%) for patients with documented hypercapnic respiratory failure.
- **Rolling per-patient baselines** (directed z-score drift: rising HR/RR/Temp, falling SpO2) in addition to static thresholds.
- **Beta-blocker HR blunting**: HR thresholds shifted +10 bpm for patients on beta-blockers.
- **Persistence rule**: a vital's NEWS2 points only count after 3 consecutive elevated readings (suppresses momentary noise).

## Alert explanations

Every alert carries `reading`, `rule`, `profile_fact`, `explanation`. Show all four in the UI.
Alert levels: `watch` < `review` < `urgent`. Device-quality issues (probe removal, dropouts, motion
noise, implausible values) are **device events**, never clinical alerts.
