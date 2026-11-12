# Frontend compatibility layer (`app/compat.py`)

The merged frontend (`frontend/`, the "Smart Patient Monitoring & Early Warning System"
React app) was built against its own API dialect. `app/compat.py` implements that dialect
on top of the PS-03 core (pipeline, artifact filter, HAPI FHIR/SQLite, NEWS2 scorers).
All endpoints live under `/api` as before. **Demo OTP is `DEMO_OTP` (default `123456`);
tokens are random hex stored in SQLite — this is a demo build, not real authentication.**

## Endpoints (beyond / overriding the PS-03 contract)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/send-otp` `{aadhaar, mobile}` → `{sent, demoOtp}` | Aadhaar 12 digits, mobile 10 digits |
| POST | `/api/auth/verify-otp` `{aadhaar, otp}` → `{token, user}` | 401 on wrong OTP |
| GET  | `/api/auth/me` (Bearer) | `{user}` |
| GET  | `/api/patients` — returns **bare array** (frontend shape) | `fullName`, `latest.risk/total/escalation`, `conditions:[strings]`, `phone` |
| POST | `/api/patients` | create; conditions sent as string array |
| PUT  | `/api/patients/{id}` | update fullName/age/gender/phone/address/conditions (strings)/medicalHistory |
| GET  | `/api/patients/{id}` | superset: frontend `records[]`, `enquiries[]` + PS-03 `risk_flags`, `medications`, `fhir_ref` |
| GET  | `/api/patients/summary` | `{totalRegistered, monitored, low, lowMedium, medium, high, escalations, recent[]}` |
| POST | `/api/patients/score` `{vitals}` | live NEWS2 preview (partial-safe: missing values → `complete:false`) |
| POST | `/api/patients/{id}/records` `{vitals, source}` | saves reading; **vitals also flow through the PS-03 pipeline** (FHIR/HAPI + Watch/Review/Urgent alerts) |
| GET  | `/api/patients/enquiries` | all enquiries with patientName (deep link from Enquiries page) |
| POST | `/api/patients/{id}/enquiries` | patient symptom enquiry intake |
| POST | `/api/checkins` `{patient_id, breathlessness(0-2), fever(0/1), dizziness(0-2), notes?}` | PDF Hint #1 — daily symptom check-in; integrates into monitoring score (+1/+2 each) |
| GET  | `/api/checkins/{patient_id}` | check-in history |
| GET  | `/api/sensors/{id}/latest` | `{connected, reading:{timestamp, vitals}}` |
| POST | `/api/sensors/readings` `x-device-key` | ESP32 (MAX30102 + DS18B20) ingestion; header must equal `DEVICE_KEY` env (default `demo-esp32-key`) |

## Scoring shape (`news2` object in records & scores)

`{total, complete, escalation, items:[{key,label,value,unit,score,explanation}], risk:{level,label,clinical}, ps03_scale}`

Items: respiratoryRate, heartRate, spo2, temperature, systolic (SBP ≤90/91-110/111-219/≥220 = 3/1/0/3),
supplemental oxygen (+2), consciousness (A=0, CVPU=3). Risk: ≥7 high, ≥5 medium, any single 3 → low-medium (escalation alert), else low.

Note on the two scorers: the **PS-03 pipeline** (alerts, FHIR, personalization) uses NEWS2 with
hypercapnia Scale 2 / beta-blocker blunting / baseline drift / persistence; the **frontend
display scorer** shows the classic 7-item NEWS2. Clinicians see both consistently in one app.
