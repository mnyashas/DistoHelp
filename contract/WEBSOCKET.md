# WebSocket contract — `ws://<backend-host>:8000/ws/live`

Frontend connects once; the backend pushes JSON frames. No client->server messages required
(a text frame is treated as a ping; server ignores content).

## Frame shapes

```jsonc
// connection established
{"type": "connected", "data": {"clients": 1}}

// every ingested vital (after artifact filter + scoring)
{"type": "vital", "data": {
  "patient_id": "p02",
  "loinc": "9279-1",
  "display": "Respiratory rate",
  "value": 23.4,
  "unit": "/min",
  "artifact": null,            // null = clean reading
  "fhir_ref": "Observation/abc123",
  "score":  { "...": "same shape as GET /api/patients/{id}/score" },
  "alert":  null               // or an Alert object when one fired
}}

// device-quality event (NEVER a clinical alert)
{"type": "device_event", "data": {
  "patient_id": "p04",
  "kind": "probe_removal",     // probe_removal | flatline | motion_noise | implausible | missing_data | dropout
  "value": 0
}}

// clinical alert
{"type": "alert", "data": { "...": "Alert object — reading, rule, profile_fact, explanation, level: watch|review|urgent" }}
```

## Suggested frontend handling

- `vital` → append to charts; update the patient's score badge (`data.score.total`, `data.score.level`).
- `device_event` → show a grey "device issue" badge, do NOT show red clinical banner.
- `alert` → toast + alert feed; badge counts from `GET /api/dashboard` on load, then live increments.

Reconnect with exponential backoff. On reconnect, refetch `GET /api/dashboard` to resync.
