/*
  Bingnondo kitchen buzzer (ESP32 + 2.4" ST7789 240x320 + button)

  Every POLL_MS it asks the backend for waiting order alerts.
    - Waiting alerts  -> buzzer beeps, screen shows the oldest order
                         big, plus "+N waiting" and the next order numbers.
    - Button press    -> acknowledges the order shown on screen (the oldest).
                         Buzzer stops once no alerts are left.
  Alerts are created when an order is paid (counter order, or GCash receipt verified).

  Libraries (Arduino IDE > Library Manager):
    - Adafruit ST7735 and ST7789 Library   (also installs Adafruit GFX + BusIO)
    - ArduinoJson  (version 7.x)

  Wiring (see SETUP.md):
    Buzzer : active buzzer (+) -> GPIO25, (-) -> GND works directly for testing
    Button : GPIO27 -> button -> GND   (optional; internal pull-up, no resistor needed.
             Without a button connected nothing happens; acknowledge from the kitchen screen.)
    Screen : VCC->3V3, GND->GND, SCK/SCL->GPIO18, SDI/SDA/MOSI->GPIO23,
             CS->GPIO5, DC->GPIO16, RESET->GPIO17, LED/BL->3V3
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>

// ---- EDIT THESE ------------------------------------------------------------
const char* WIFI_SSID   = "only_for_daniel's";
const char* WIFI_PASS   = "fully_occupied";
// IP of the PC running the backend (run `ipconfig`, use the IPv4 address)
const char* SERVER_URL  = "http://192.168.101.75:5000";
const char* DEVICE_CODE = "ESP32-KitchenA";          // same as esp32_devices.device_code
const char* DEVICE_KEY  = "6621aaa4feda0ccab5c33c8b9c45f10f4e93073340123e63";
// ----------------------------------------------------------------------------

// Pins
const int BUZZER_PIN = 25;
const int BUTTON_PIN = 27;
#define TFT_CS   5
#define TFT_DC   16
#define TFT_RST  17

// Screen driver. Your screen is an ST7789, so leave this as 1.
// Many 2.4" 240x320 modules sold online are really ILI9341: if the screen stays
// white/blank or shows garbage, set this to 0 and also install the
// "Adafruit ILI9341" library.
#define USE_ST7789 1

#if USE_ST7789
  #include <Adafruit_ST7789.h>
  Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);
  #define TFT_START() tft.init(240, 320)
#else
  #include <Adafruit_ILI9341.h>
  Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);
  #define TFT_START() tft.begin()
#endif

// RGB565 colors (defined here so they work with either driver)
#define COL_BLACK  0x0000
#define COL_WHITE  0xFFFF
#define COL_RED    0xF800
#define COL_GREEN  0x07E0
#define COL_YELLOW 0xFFE0
#define COL_CYAN   0x07FF
#define COL_GREY   0x8410
#define COL_NAVY   0x1082

const int SCREEN_W = 320;   // landscape (rotation 1)
const int SCREEN_H = 240;

const unsigned long POLL_MS     = 1000;
const unsigned long BEEP_ON     = 300;
const unsigned long BEEP_OFF    = 500;
const unsigned long DEBOUNCE_MS = 50;
const unsigned long POLL_TIMEOUT_MS = 1500;

// State from the server
int    pending = 0;
long   alertId = 0;              // oldest waiting alert (what the button acknowledges)
String orders[4];
int    orderCount = 0;
int    failCount = 0;            // consecutive failed polls

// Local state
unsigned long lastPoll = 0, lastToggle = 0, lastPress = 0, lastRssi = 0;
bool outputOn = false;
bool lastButton = HIGH;
String lastScreen = "";          // signature of what's drawn, to avoid flicker

void setOutputs(bool on) {
  outputOn = on;
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Connecting to WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);                 // keep the radio awake — avoids dropped polls (HTTP -1)
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

// Print text horizontally centered on the screen at the given y
void printCentered(const String& text, int y, uint8_t size, uint16_t color) {
  tft.setTextSize(size);
  tft.setTextColor(color);
  int w = text.length() * 6 * size;          // default font is 6px wide per char at size 1
  tft.setCursor((SCREEN_W - w) / 2, y);
  tft.print(text);
}

// ---------------------------------------------------------------- screen ----
void drawScreen() {
  bool offline = failCount >= 3;

  // Only redraw when something visible changed
  String sig = String(offline) + "|" + pending + "|" + alertId;
  for (int i = 0; i < orderCount; i++) sig += "|" + orders[i];
  if (sig == lastScreen) return;
  lastScreen = sig;

  tft.fillScreen(COL_BLACK);

  // Header bar
  tft.fillRect(0, 0, SCREEN_W, 30, offline ? COL_RED : COL_NAVY);
  tft.setTextSize(2);
  tft.setTextColor(COL_WHITE);
  tft.setCursor(8, 8);
  tft.print("KITCHEN");
  String status = offline ? "SERVER OFFLINE" : "ONLINE";
  tft.setCursor(SCREEN_W - 8 - status.length() * 12, 8);
  tft.print(status);

  if (pending == 0) {
    printCentered("All clear", 90, 4, COL_GREEN);
    printCentered("No new orders", 140, 2, COL_GREY);
    return;
  }

  printCentered("NEW ORDER", 44, 2, COL_WHITE);
  printCentered(orders[0], 70, 6, COL_YELLOW);   // "ORD-0012" = 8 chars * 36px = 288px

  if (pending > 1) {
    printCentered(String("+") + (pending - 1) + " waiting", 130, 2, COL_CYAN);
    int y = 156;
    for (int i = 1; i < orderCount; i++) {       // up to 3 more
      printCentered(orders[i], y, 2, COL_GREY);
      y += 22;
    }
  }

  // Footer hint
  tft.fillRect(0, 210, SCREEN_W, 30, COL_RED);
  printCentered("PRESS BUTTON TO ACK", 218, 2, COL_WHITE);
}

// --------------------------------------------------------------- network ----
// Poll the server. Updates pending / alertId / orders. Returns true on success.
bool pollServer() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/esp32/alert?device_code=" + DEVICE_CODE;
  http.begin(url);
  http.setTimeout(POLL_TIMEOUT_MS);
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
    if (orderCount < 4) orders[orderCount++] = v.as<String>();
  }
  Serial.println(body);
  return true;
}

// Acknowledge the order currently on screen. Returns true if the server accepted it.
bool sendAck(long id) {
  if (WiFi.status() != WL_CONNECTED || id <= 0) return false;

  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/esp32/ack");
  http.setTimeout(3000);
  http.addHeader("x-device-key", DEVICE_KEY);
  http.addHeader("Content-Type", "application/json");
  String body = String("{\"device_code\":\"") + DEVICE_CODE + "\",\"alert_id\":" + id + "}";
  int code = http.POST(body);
  Serial.printf("Ack %ld -> HTTP %d\n", id, code);
  http.end();
  return code == 200;
}

// ----------------------------------------------------------------- setup ----
void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  setOutputs(false);

  TFT_START();
  tft.setRotation(1);                    // landscape: 320 x 240
  tft.fillScreen(COL_BLACK);
  printCentered("Connecting WiFi...", 110, 2, COL_WHITE);

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
    if (pending > 0 && sendAck(alertId)) {
      // Show the result right away instead of waiting for the next poll
      pending--;
      for (int i = 1; i < orderCount; i++) orders[i - 1] = orders[i];
      if (orderCount > 0) orderCount--;
      alertId = 0;                       // real next id arrives with the next poll
      if (pending == 0) setOutputs(false);
      drawScreen();
      lastPoll = 0;                      // poll immediately
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

    if (now - lastRssi >= 10000) {
      lastRssi = now;
      Serial.printf("RSSI %d dBm | WiFi %s | fails %d\n",
                    WiFi.RSSI(), WiFi.status() == WL_CONNECTED ? "up" : "DOWN", failCount);
    }
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
