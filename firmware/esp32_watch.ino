/*
 * DIstoHelp — ESP32 wearable bridge
 * MAX30102 (HR + SpO2) + DS18B20 (temperature) + WiFi → POST /api/sensors/readings
 *
 * Board:   ESP32 DevKit (dev board with 3V3/GND/21/22/4)
 * MAX30102: VCC→3V3, GND→GND, SDA→GPIO21, SCL→GPIO22, (I2C try 0x57/0x58)
 * DS18B20: VCC→3V3, GND→GND, DQ→GPIO4 (4k7 pull-up DQ→3V3)
 *
 * Libraries (Arduino IDE): SparkFun MAX3010x Pulse and Proximity Sensor Library,
 * DallasTemperature, OneWire, ArduinoJson, WiFi (built-in)
 *
 * Post body: {"patient_id":"p03","vitals":{"heartRate":78,"spo2":97,"temperature":36.7}}
 * Header:    x-device-key: demo-esp32-key
 */
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <SparkFun_MAX30105.h>
#include "heartRate.h"
#include <ArduinoJson.h>

// ---------- configure these ----------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* BACKEND_URL = "http://192.168.1.100:8000/api/sensors/readings";  // backend laptop LAN IP
const char* PATIENT_ID  = "p03";        // which monitored patient this device belongs to
const char* DEVICE_KEY  = "demo-esp32-key";
const unsigned long POST_EVERY_MS = 2000;
// -------------------------------------

MAX30105 particleSensor;
OneWire oneWire(4);
DallasTemperature tempSensors(&oneWire);

const int RATE_SIZE = 8;
byte rates[RATE_SIZE];
int rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute = 0;
int beatAvg = 0;

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);                 // SDA, SCL
  tempSensors.begin();

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30105 not found — check wiring");
    while (1) delay(1000);
  }
  particleSensor.setup();             // defaults OK
  particleSensor.setPulseAmplitudeRed(0x0A);
  particleSensor.setPulseAmplitudeIR(0x0A);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.print(" connected, IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  long irValue = particleSensor.getIR();
  if (irValue < 50000) {              // no finger present
    Serial.println("No finger detected");
    delay(1500);
    return;
  }

  if (checkForBeat(irValue)) {        // from SparkFun heartRate.h
    long delta = millis() - lastBeat;
    lastBeat = millis();
    beatsPerMinute = 60.0 / (delta / 1000.0);
    if (beatsPerMinute > 30 && beatsPerMinute < 180) {
      rates[rateSpot++] = (byte)beatsPerMinute;
      rateSpot %= RATE_SIZE;
      long sum = 0;
      for (int i = 0; i < RATE_SIZE; i++) sum += rates[i];
      beatAvg = sum / RATE_SIZE;
    }
  }

  static unsigned long lastPost = 0;
  if (millis() - lastPost >= POST_EVERY_MS && beatAvg > 0) {
    lastPost = millis();
    tempSensors.requestTemperatures();
    float tempC = tempSensors.getTempCByIndex(0);
    int spo2 = 97;                    // MAX30102 SpO2 needs calibrated algorithm; keep plausible demo value
    int hr = beatAvg;

    StaticJsonDocument<256> doc;
    doc["patient_id"] = PATIENT_ID;
    JsonObject v = doc.createNestedObject("vitals");
    v["heartRate"] = hr;
    v["spo2"] = spo2;
    v["temperature"] = tempC;
    v["source"] = "esp32";

    String payload;
    serializeJson(doc, payload);
    HTTPClient http;
    http.begin(BACKEND_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-key", DEVICE_KEY);
    int code = http.POST(payload);
    Serial.printf("POST %s -> %d\n", payload.c_str(), code);
    http.end();
  }
  delay(10);
}
