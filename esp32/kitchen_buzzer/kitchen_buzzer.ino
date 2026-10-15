/*
  Bingnondo kitchen buzzer (ESP32 + ST7789 2.4" SPI TFT + button)

  Every POLL_MS it asks the backend for waiting order alerts.
    - Waiting alerts  -> buzzer beeps, LED blinks, screen shows the oldest order
                         big, plus "+N waiting" and the next order numbers.
    - Button press    -> acknowledges the order shown on screen (the oldest).
                         Buzzer stops once no alerts are left.
  Alerts are created when an order is paid (cash, or GCash receipt verified).

  Libraries (Arduino IDE > Library Manager):
    - Adafruit ST7735 and ST7789 Library   (also installs Adafruit GFX + BusIO)
    - ArduinoJson  (version 7.x)

  Display: 2.4" ST7789, 240x320 native, used in landscape (320x240).

  Wiring (see SETUP.md):
    Buzzer : GPIO25 -> 1k -> transistor base; emitter -> GND; collector -> buzzer(-); buzzer(+) -> VIN
    LED    : GPIO26 -> 220R -> LED(+); LED(-) -> GND
    Button : GPIO27 -> button -> GND   (internal pull-up, no resistor needed)
    ST7789 : VCC->3V3, GND->GND, SCL/SCK->GPIO18, SDA/MOSI->GPIO23, CS->GPIO5, DC->GPIO16, RES->GPIO17, BLK->3V3
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

// ---- EDIT THESE ------------------------------------------------------------
const char* WIFI_SSID   = "YOUR_WIFI_NAME";
const char* WIFI_PASS   = "YOUR_WIFI_PASSWORD";
// IP of the PC running the backend (run `ipconfig`, use the IPv4 address)
const char* SERVER_URL  = "http://192.168.1.50:5000";
const char* DEVICE_CODE = "ESP32-KitchenA";          // same as esp32_devices.device_code
const char* DEVICE_KEY  = "same_value_as_ESP32_DEVICE_KEY_in_.env";
// ----------------------------------------------------------------------------

// Pins
const int BUZZER_PIN = 25;
const int LED_PIN    = 26;
const int BUTTON_PIN = 27;
#define TFT_CS   5
#define TFT_DC   16
#define TFT_RST  17

// 2.4" ST7789 (240x320). Rotation 1 = landscape 320x240.
Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);
#define SCREEN_W 320
#define SCREEN_H 240

const unsigned long POLL_MS  = 2000;
const unsigned long BEEP_ON  = 300;
const unsigned long BEEP_OFF = 500;
const unsigned long DEBOUNCE_MS = 50;

// Max orders remembered from a poll — must match MAX_ORDERS in
// backend/src/modules/kitchen/esp32.routes.js.
const int MAX_ORDERS = 8;

// State from the server
int  pending = 0;
long alertId = 0;                // oldest waiting alert (what the button acknowledges)
String orders[MAX_ORDERS];
int  orderCount = 0;
int  failCount = 0;              // consecutive failed polls

// Local state
unsigned long lastPoll = 0, lastToggle = 0, lastPress = 0;
bool outputOn = false;
bool lastButton = HIGH;
String lastScreen = "";          // signature of what's drawn, to avoid flicker

void setOutputs(bool on) {
  outputOn = on;
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
  digitalWrite(LED_PIN, on ? HIGH : LOW);
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

// Center a string horizontally at the current text size.
int centerX(const char* s) {
  int16_t x1, y1;
  uint16_t w, h;
  tft.getTextBounds(s, 0, 0, &x1, &y1, &w, &h);
  return (SCREEN_W - (int)w) / 2;
}

// ---------------------------------------------------------------- screen ----
void drawScreen() {
  bool offline = failCount >= 3;

  // Only redraw when something visible changed
  String sig = String(offline) + "|" + pending + "|" + alertId;
  for (int i = 0; i < orderCount; i++) sig += "|" + orders[i];
  if (sig == lastScreen) return;
  lastScreen = sig;

  tft.fillScreen(ST77XX_BLACK);

  // ── Header bar ──────────────────────────────────────────────────────────────
  tft.fillRect(0, 0, SCREEN_W, 28, offline ? ST77XX_RED : 0x2945);
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(8, 6);
  tft.print("KITCHEN");
  const char* status = offline ? "SERVER OFFLINE" : "online";
  tft.setCursor(SCREEN_W - (int)strlen(status) * 12 - 8, 6);
  tft.print(status);

  // ── Footer bar ──────────────────────────────────────────────────────────────
  tft.fillRect(0, SCREEN_H - 28, SCREEN_W, 28, ST77XX_RED);
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(centerX("PRESS BUTTON TO ACK"), SCREEN_H - 22);
  tft.print("PRESS BUTTON TO ACK");

  if (pending == 0) {
    tft.setTextColor(ST77XX_GREEN);
    tft.setTextSize(3);
    tft.setCursor(centerX("All clear"), 100);
    tft.print("All clear");
    tft.setTextSize(2);
    tft.setTextColor(0x8410);
    tft.setCursor(centerX("No new orders"), 150);
    tft.print("No new orders");
    return;
  }

  // ── Newest order, big ───────────────────────────────────────────────────────
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(8, 36);
  tft.print("NEW ORDER");

  tft.setTextColor(ST77XX_YELLOW);
  tft.setTextSize(4);                    // "ORD-0012" = 8 chars * 24px = 192px
  tft.setCursor(8, 58);
  tft.print(orders[0]);

  tft.setTextSize(2);
  tft.setTextColor(ST77XX_CYAN);
  tft.setCursor(8, 100);
  tft.print("+");
  tft.print(pending - 1);
  tft.print(" waiting");

  // ── Next orders, two columns ────────────────────────────────────────────────
  tft.setTextColor(0xBDF7);
  const int listY = 104, rowH = 24;
  for (int i = 1; i < orderCount; i++) {         // orders[1..]
    int idx = i - 1;
    int col = idx % 2;
    int row = idx / 2;
    tft.setCursor(12 + col * 168, listY + row * rowH);
    tft.print(orders[i]);
  }
}

// --------------------------------------------------------------- network ----
// Poll the server. Updates pending / alertId / orders. Returns true on success.
bool pollServer() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/esp32/alert?device_code=" + DEVICE_CODE;
  http.begin(url);
  http.setTimeout(3000);
  http.addHeader("x-device-key", DEVICE_KEY);
  int code = http.GET();

  if (code != 200) {
    Serial.printf("Poll failed, HTTP %d\n", code);   // 401 = wrong key, 404 = wrong device code
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    Serial.println("Bad JSON from server");
    return false;
  }

  pending = doc["pending"] | 0;
  alertId = doc["alert_id"] | 0L;
  orderCount = 0;
  for (JsonVariant v : doc["orders"].as<JsonArray>()) {
    if (orderCount < MAX_ORDERS) orders[orderCount++] = v.as<String>();
  }
  Serial.println(body);
  return true;
}

// Acknowledge the order currently on screen
void sendAck(long id) {
  if (WiFi.status() != WL_CONNECTED || id <= 0) return;

  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/esp32/ack");
  http.setTimeout(3000);
  http.addHeader("x-device-key", DEVICE_KEY);
  http.addHeader("Content-Type", "application/json");
  String body = String("{\"device_code\":\"") + DEVICE_CODE + "\",\"alert_id\":" + id + "}";
  int code = http.POST(body);
  Serial.printf("Ack %ld -> HTTP %d\n", id, code);
  http.end();
}

// ----------------------------------------------------------------- setup ----
void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  setOutputs(false);

  tft.init(240, 320);                    // 2.4" ST7789 native resolution
  tft.setRotation(1);                    // landscape 320x240
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(8, 8);
  tft.print("Connecting WiFi...");

  connectWiFi();

  setOutputs(true);  delay(150);         // startup blip
  setOutputs(false);

  lastScreen = "";
  drawScreen();
}

// ------------------------------------------------------------------ loop ----
void loop() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  // Button (active LOW), debounced, acts on the press
  bool b = digitalRead(BUTTON_PIN);
  if (b == LOW && lastButton == HIGH && now - lastPress > DEBOUNCE_MS) {
    lastPress = now;
    if (pending > 0) {
      sendAck(alertId);
      lastPoll = 0;                      // refresh right away
    }
  }
  lastButton = b;

  // Poll the server
  if (now - lastPoll >= POLL_MS) {
    lastPoll = now;
    if (pollServer()) {
      failCount = 0;
    } else if (failCount < 100) {
      failCount++;                       // keeps last known state meanwhile
    }
    if (pending == 0) setOutputs(false);
    drawScreen();
  }

  // Non-blocking beep pattern while alerts are waiting
  if (pending > 0) {
    unsigned long interval = outputOn ? BEEP_ON : BEEP_OFF;
    if (now - lastToggle >= interval) {
      lastToggle = now;
      setOutputs(!outputOn);
    }
  }
}
