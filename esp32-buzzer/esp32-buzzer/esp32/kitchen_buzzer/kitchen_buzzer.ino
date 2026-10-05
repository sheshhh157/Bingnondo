/*
  Bingnondo kitchen buzzer (ESP32)

  Every POLL_MS it asks the backend: "is there an unacknowledged order alert?"
    buzz = true  -> beep the active buzzer + LED on
    buzz = false -> silent
  The alert is created when the cashier marks an order paid, and cleared when
  the kitchen presses Acknowledge on the kitchen screen.

  Wiring (direct drive, no transistor):
    GPIO25 -> buzzer (+) ; buzzer (-) -> GND
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <string.h>
#include "secrets.h"   // local-only credentials: copy secrets.example.h -> secrets.h and fill in

// Match device_code on this device's row in the backend's esp32_devices table.
const char* DEVICE_CODE = "ESP32-KitchenA";

const int BUZZER_PIN = 25;
const int LED_PIN    = 26;

const unsigned long POLL_MS = 2000;   // how often to ask the server
const unsigned long BEEP_ON = 300;    // beep length
const unsigned long BEEP_OFF = 500;   // pause between beeps
// Self-test chirps and periodic failure chirps must not overlap the alert
// pattern, so both route through chirp(), which always no-ops when buzzing.
const int SELF_TEST_LONG_ON   = 400;
const int SELF_TEST_LONG_OFF  = 200;
const int SELF_TEST_SHORT_ON  = 140;
const int SELF_TEST_SHORT_OFF = 140;
const int FAIL_CHIRP_PERIOD_MS = 30000;  // repeat the failure chirps no faster than this
const int FAIL_CHIRP_COUNT     = 2;
const int FAIL_CONSECUTIVE_LIMIT = 5;    // about 10 s at POLL_MS cadence

bool buzzing = false;
unsigned long lastPoll = 0;
unsigned long lastToggle = 0;
bool outputOn = false;
int lastHttpCode = -1;            // HTTP code from the most recent poll (-1 = no response)
int consecutiveFailures = 0;
unsigned long lastFailChirpAt = 0;
bool selfTestDone = false;

// Newest alert stamp seen on the previous poll. An alert can open and be
// acknowledged inside one POLL_MS window, so buzz alone is not enough to notice
// it — comparing stamps catches an alert the device would otherwise never see.
String lastSeenAlertAt;
bool haveSeenAlertAt = false;
String lastAlertAtFromPoll;

void setOutputs(bool on) {
  outputOn = on;
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
}

void chirpTone(int count, int onMs, int offMs) {
  if (buzzing) return; // never chirp while an alert is actively buzzing
  for (int i = 0; i < count; i++) {
    setOutputs(true);
    delay(onMs);
    setOutputs(false);
    if (i + 1 < count) delay(offMs);
  }
}

/** Pull the "last_alert_at" ISO string out of the JSON body. Empty if null. */
String extractLastAlertAt(const String& body) {
  const char* key = "\"last_alert_at\":\"";
  int at = body.indexOf(key);
  if (at < 0) return String();
  int start = at + strlen(key);
  int end = body.indexOf('"', start);
  if (end < 0) return String();
  return body.substring(start, end);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Connecting to WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(300);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\nConnected, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi failed, will retry.");
  }
}

// Returns 1 = buzz, 0 = silent, -1 = request failed (keep previous state)
int checkAlert() {
  if (WiFi.status() != WL_CONNECTED) return -1;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/esp32/alert?device_code=" + DEVICE_CODE;
  http.begin(url);
  http.setTimeout(3000);
  http.addHeader("x-device-key", DEVICE_KEY);
  int code = http.GET();
  lastHttpCode = code;

  int result = -1;
  lastAlertAtFromPoll = "";
  if (code == 200) {
    String body = http.getString();
    result = (body.indexOf("\"buzz\":true") >= 0) ? 1 : 0;
    lastAlertAtFromPoll = extractLastAlertAt(body);
    Serial.println(body);
  } else {
    Serial.printf("Request failed, HTTP %d\n", code);   // 401 = wrong key, 404 = wrong device code
  }
  http.end();
  return result;
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  // LED pin not used in buzzer-only mode
  setOutputs(false);

  connectWiFi();

  // Short startup blip so you know it booted
  setOutputs(true);  delay(150);
  setOutputs(false);
}

void loop() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  if (now - lastPoll >= POLL_MS) {
    lastPoll = now;
    int r = checkAlert();
    if (r >= 0) {
      bool fresh = false;
      String stamp = lastAlertAtFromPoll;
      if (!stamp.isEmpty()) {
        if (!haveSeenAlertAt) {
          lastSeenAlertAt = stamp;
          haveSeenAlertAt = true;
        } else if (stamp != lastSeenAlertAt) {
          lastSeenAlertAt = stamp;
          fresh = true;
        }
      }

      // A fresh alert always rings, even if it was already acknowledged, so a
      // fast Acknowledge cannot swallow the beep.
      buzzing = fresh || (r == 1);
      consecutiveFailures = 0;
      if (!buzzing) {
        setOutputs(false);
      } else if (fresh) {
        // Ring straight away rather than waiting out the current toggle phase.
        setOutputs(true);
        lastToggle = now;
      }
    } else {
      consecutiveFailures++;
    }
  }
  // Self-test + failure chirp (must not play while alert is buzzing)
  if (!selfTestDone && !buzzing) {
    selfTestDone = true;
    if (lastHttpCode == 200) {
      chirpTone(1, SELF_TEST_SHORT_ON, 0);
      Serial.println("[self-test] OK: server reached, key accepted (HTTP 200)");
    } else if (lastHttpCode == 401 || lastHttpCode == 404) {
      chirpTone(3, SELF_TEST_SHORT_ON, SELF_TEST_SHORT_OFF);
      Serial.printf("[self-test] auth/device error: HTTP %d", lastHttpCode);
    } else {
      chirpTone(2, SELF_TEST_LONG_ON, SELF_TEST_LONG_OFF);
      Serial.println("[self-test] server unreachable / WiFi failed");
    }
  }

  // Consecutive failure chirp while running
  if (consecutiveFailures >= FAIL_CONSECUTIVE_LIMIT && !buzzing) {
    if (millis() - lastFailChirpAt >= FAIL_CHIRP_PERIOD_MS) {
      lastFailChirpAt = millis();
      chirpTone(FAIL_CHIRP_COUNT, SELF_TEST_SHORT_ON, SELF_TEST_SHORT_OFF);
      Serial.printf("[poll] %d consecutive failures, last HTTP %d\n", consecutiveFailures, lastHttpCode);
    }
  }

  // Beep pattern while an alert is active (no delay(), so polling keeps running)
  if (buzzing) {
    unsigned long interval = outputOn ? BEEP_ON : BEEP_OFF;
    if (now - lastToggle >= interval) {
      lastToggle = now;
      setOutputs(!outputOn);
    }
  }
}
