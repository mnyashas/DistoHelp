# DIstoHelp — frontend

React 18 + Vite + Tailwind app ("Smart Patient Monitoring & Early Warning System") built by the
frontend agent against the backend compat layer (`../backend/app/compat.py`). Merged into this
folder; backend owns all logic.

## Run (full stack)

Terminal 1 — backend (see root README for HAPI FHIR options):

```powershell
cd ..\backend
python -m venv .venv; .\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --port 8000        # http://localhost:8000
```

Terminal 2 — frontend:

```powershell
cd frontend
npm install
npm run dev                              # http://localhost:5173
```

Open http://localhost:5173. Demo sign-in: **Aadhaar 999941057058, mobile 9876543210, OTP 123456**
(simulated; see Settings page in the app).

The Vite dev server proxies `/api` → `http://localhost:8000` (see `vite.config.js`), so no CORS
configuration is needed. `npm run build` produces a static bundle in `dist/` (git-ignored).

## Screens

Dashboard · **Live Monitoring** (`/live`, WS-driven telemetry grid, alert stream with ack/resolve,
demo streams, BLE band connect) · Patients (search/register/edit/profile) · Vital Signs (manual/
simulated/ESP32 input, live NEWS2 preview) · Sensor Monitoring · Risk Assessment · Monitoring
History · Patient Enquiries · Settings.

## Watch companion

Open `http://<lan-ip>:5173/watch?p=p02` on any phone/watch browser on the same network — no login.
Full-screen wrist UI: huge HR with NEWS2 arc gauge, SpO₂/RR/Temp, status banner, haptic buzz
(`navigator.vibrate`) on alerts, red flash on URGENT, reconnects automatically. WebSocket via the
Vite proxy (`/ws` → `:8000`).

## BLE wearable (Chrome/Edge on Android or PC only)

Live Monitoring → **Connect BLE band**. Reads standard Heart Rate Service (0x180D) from any
BLE chest strap/band and forwards readings to `POST /api/sensors/readings` (header
`x-device-key: demo-esp32-key`). Safari/iOS do not support Web Bluetooth.

## Demo storyline (matches PS-03)

1. Sign in → Dashboard: 5 discharged patients, p02 flagged High Risk (NEWS2 7, RR 25).
2. Open p02 → score breakdown with clinical escalation alert → monitoring history shows the
   21-hour deterioration curve → enquiry logged ("breathlessness worse at night").
3. Save a new vital-sign reading → both systems score it: the UI's 7-item NEWS2 and the PS-03
   pipeline (FHIR/HAPI, Watch/Review/Urgent emails/alerts).
4. PS-03 contract endpoints (`/api/scenarios/evaluate`, `/ws/live`) power the judge-facing demo;
   see root README.
