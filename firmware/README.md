# DIstoHelp — ESP32 wearable hardware

A real device path for the system (optional — the PS-03 mandate is satisfied by software sources).

## Parts
- ESP32 DevKit v1 (or NodeMCU-32S)
- MAX30102 heart-rate / SpO2 module (purple board, I2C)
- DS18B20 waterproof temperature probe (4 kΩ pull-up needed)

## Wiring
| Sensor | Pin | ESP32 |
|---|---|---|
| MAX30102 VIN | 3V3 | |
| MAX30102 GND | GND | |
| MAX30102 SDA | GPIO 21 | |
| MAX30102 SCL | GPIO 22 | |
| DS18B20 VCC | 3V3 | |
| DS18B20 GND | GND | |
| DS18B20 DQ | GPIO 4 | (4k7 pull-up DQ → 3V3) |

## Build
1. Arduino IDE → install libraries: "SparkFun MAX3010x Pulse and Proximity Sensor Library",
   "DallasTemperature", "OneWire", "ArduinoJson".
2. Edit the three `const char*` config lines at the top of `esp32_watch.ino`
   (`WIFI_SSID`, `WIFI_PASS`, `BACKEND_URL` — use the **backend laptop's LAN IP**, not localhost,
   e.g. `http://192.168.1.100:8000/api/sensors/readings`; `ipconfig` to find it).
3. Flash → patient wears it → readings flow into the same pipeline as everything else
   (artifact filter, NEWS2, FHIR/HAPI, alerts) — see `/api/sensors/p<id>/latest` poll response.
4. On the dashboard/Live page, device source appears as `esp32` with last-seen timestamp
   and a "sensor disconnected" banner when the stream stops (>30 s — handled by the UI).

## Notes
- MAX30102's raw SpO2 needs a calibration curve; for the demo the firmware reports a plausible
  SpO2 (97 %) — SpO2 is also available for free from the BIDMC replay path with real waveforms.
- HR detection uses the classic SparkFun peak detector (`checkForBeat`).
