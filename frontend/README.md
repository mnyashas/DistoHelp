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

## Wearable Mode (`/wearable`) — real patient on a real phone

The one path that streams a **real person's pulse** into the same pipeline as the synthetic cohort:

1. Sign in on the phone (same Wi-Fi, `http://<lan-ip>:5173`) → **Wearable Mode**.
2. Either pick an existing patient, or tap **Register real person** (e.g., a teammate) — creates a real profile on the spot.
3. Choose the sensor: **Phone camera** (real fingertip PPG — no hardware, shows quality bar) or **BLE heart-rate band** (Polar H10 etc., Chrome/Edge).
4. **Start streaming** — readings POST every 2 s to `/api/sensors/readings` (`source: camera`/`ble`), flow through the artifact filter → NEWS2 → HAPI FHIR → alerts. Watch the wrist view at `/watch?p=<id>` flash with real data.

Motion-noise suppression works on real signals too — wave the phone or jiggle the finger to see artifacts filtered instead of alerted.

## Patient self-report (`/me`) — sign in with a mobile number

Any registered patient's phone number opens **only their own** report — no staff login required:

- `POST /api/patient/send-otp {mobile}` → OTP (demo: always `123456`)
- `POST /api/patient/verify {mobile, otp}` → patient-scoped token
- `GET /api/patient/me` (Bearer) → own conditions, meds (beta-blockers flagged), records, NEWS2 trend chart, alerts, check-ins, print-friendly view
- Demo numbers: `9845001001` Beryl (p01), `...02002` Denis, `...03003` Athena, `...04004` April, `...05005` Andre — OTP `123456` everywhere

Also addable from the staff login page ("Patient? View your report") and directly at `/me` — best demoed on a phone.

## Screens

Dashboard · **Live Monitoring** (`/live`, WS-driven telemetry grid, alert stream with ack/resolve,
demo streams, BLE band connect) · **Wearable Mode** (`/wearable`) · Patients · Vital Signs ·
Sensor Monitoring · Risk Assessment · Monitoring History · Patient Enquiries · Settings.

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
