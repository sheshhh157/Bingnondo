/*
  Bingnondo kitchen buzzer (ESP32 + 2.4" ST7789 240x320 + button)

  Every POLL_MS it asks the backend for waiting order alerts.
    - Waiting alerts  -> buzzer beeps, screen shows the oldest order with its
                         items, quantities and notes, plus "+N waiting".
    - Button press    -> acknowledges the order shown on screen (the oldest).
                         That order stays visible as ACKNOWLEDGED until another
                         order is waiting. Buzzer stops once no alerts are left.
  Alerts are created when an order is paid (counter order, or GCash receipt verified).

  First boot / Wi-Fi changes:
    1. The board opens a setup Wi-Fi named "Bingnondo-XXXX".
    2. Join it from a phone, pick the kitchen Wi-Fi, and enter its password.
    3. Enter the server URL (for example http://192.168.1.10:5000).
    4. The board saves both in flash and joins the same Wi-Fi as the phone.
    If the router password changes later, the board reopens the setup Wi-Fi
    automatically. No Wi-Fi name, password, or server IP is hardcoded.

  Libraries (Arduino IDE > Library Manager):
    - Adafruit ST7735 and ST7789 Library   (also installs Adafruit GFX + BusIO)
    - ArduinoJson  (version 7.x)
    - WiFiManager  (tzapu, v2.0.17+)

  Wiring (see SETUP.md):
    Buzzer : active buzzer (+) -> GPIO25, (-) -> GND works directly for testing
    Button : GPIO27 -> button -> GND   (optional; internal pull-up, no resistor needed.
             Without a button connected nothing happens; acknowledge from the kitchen screen.)
    Screen : VCC->3V3, GND->GND, SCK/SCL->GPIO18, SDI/SDA/MOSI->GPIO23,
             CS->GPIO5, DC->GPIO16, RESET->GPIO17, LED/BL->3V3
*/
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <WiFiManager.h>
#include <Preferences.h>

// ---- DEVICE IDENTITY -------------------------------------------------------
// Keep these matching backend/.env for the single-buzzer setup.
const char* DEVICE_CODE = "ESP32-KitchenA";          // same as esp32_devices.device_code
const char* DEVICE_KEY  = "6621aaa4feda0ccab5c33c8b9c45f10f4e93073340123e63";
const char* FORCE_SERVER_URL = "https://bingnondo-production.up.railway.app";
// ----------------------------------------------------------------------------

// Wi-Fi credentials and the backend URL are entered in the setup portal and
// stored in flash, so they are not hardcoded in the sketch.
Preferences prefs;
String serverUrl;
String setupApName;
unsigned long lastConfigPoll = 0;
unsigned int wifi_version = 0;
unsigned int failedConfigVersion = 0;
unsigned long configBackoffMs = 30000;
String configStatus = "";

const char* ISRG_ROOT_X2 = R"PEM(-----BEGIN CERTIFICATE-----
MIICGzCCAaGgAwIBAgIQQdKd0XLq7qeAwSxs6S+HUjAKBggqhkjOPQQDAzBPMQsw
CQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFyY2gg
R3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMjAeFw0yMDA5MDQwMDAwMDBaFw00
MDA5MTcxNjAwMDBaME8xCzAJBgNVBAYTAlVTMSkwJwYDVQQKEyBJbnRlcm5ldCBT
ZWN1cml0eSBSZXNlYXJjaCBHcm91cDEVMBMGA1UEAxMMSVNSRyBSb290IFgyMHYw
EAYHKoZIzj0CAQYFK4EEACIDYgAEzZvVn4CDCuwJSvMWSj5cz3es3mcFDR0HttwW
+1qLFNvicWDEukWVEYmO6gbf9yoWHKS5xcUy4APgHoIYOIvXRdgKam7mAHf7AlF9
ItgKbppbd9/w+kHsOdx1ymgHDB/qo0IwQDAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0T
AQH/BAUwAwEB/zAdBgNVHQ4EFgQUfEKWrt5LSDv6kviejM9ti6lyN5UwCgYIKoZI
zj0EAwMDaAAwZQIwe3lORlCEwkSHRhtFcP9Ymd70/aTSVaYgLXTWNLxBo1BfASdW
tL4ndQavEi51mI38AjEAi/V3bNTIZargCyzuFJ0nN6T5U6VR5CmD1/iQMVtCnwr1
/q4AaOeMSQ+2b1tbFfLn
-----END CERTIFICATE-----)PEM";

const char* GTS_ROOT_R1 = R"PEM(-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw
MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp
Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjEwggIiMA0GCSqGSIb3DQEBAQUA
A4ICDwAwggIKAoICAQC2EQKLHuOhd5s73L+UPreVp0A8of2C+X0yBoJx9vaMf/vo
27xqLpeXo4xL+Sv2sfnOhB2x+cWX3u+58qPpvBKJXqeqUqv4IyfLpLGcY9vXmX7w
Cl7raKb0xlpHDU0QM+NOsROjyBhsS+z8CZDfnWQpJSMHobTSPS5g4M/SCYe7zUjw
TcLCeoiKu7rPWRnWr4+wB7CeMfGCwcDfLqZtbBkOtdh+JhpFAz2weaSUKK0Pfybl
qAj+lug8aJRT7oM6iCsVlgmy4HqMLnXWnOunVmSPlk9orj2XwoSPwLxAwAtcvfaH
szVsrBhQf4TgTM2S0yDpM7xSma8ytSmzJSq0SPly4cpk9+aCEI3oncKKiPo4Zor8
Y/kB+Xj9e1x3+naH+uzfsQ55lVe0vSbv1gHR6xYKu44LtcXFilWr06zqkUspzBmk
MiVOKvFlRNACzqrOSbTqn3yDsEB750Orp2yjj32JgfpMpf/VjsPOS+C12LOORc92
wO1AK/1TD7Cn1TsNsYqiA94xrcx36m97PtbfkSIS5r762DL8EGMUUXLeXdYWk70p
aDPvOmbsB4om3xPXV2V4J95eSRQAogB/mqghtqmxlbCluQ0WEdrHbEg8QOB+DVrN
VjzRlwW5y0vtOUucxD/SVRNuJLDWcfr0wbrM7Rv1/oFB2ACYPTrIrnqYNxgFlQID
AQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4E
FgQU5K8rJnEaK0gnhS9SZizv8IkTcT4wDQYJKoZIhvcNAQEMBQADggIBAJ+qQibb
C5u+/x6Wki4+omVKapi6Ist9wTrYggoGxval3sBOh2Z5ofmmWJyq+bXmYOfg6LEe
QkEzCzc9zolwFcq1JKjPa7XSQCGYzyI0zzvFIoTgxQ6KfF2I5DUkzps+GlQebtuy
h6f88/qBVRRiClmpIgUxPoLW7ttXNLwzldMXG+gnoot7TiYaelpkttGsN/H9oPM4
7HLwEXWdyzRSjeZ2axfG34arJ45JK3VmgRAhpuo+9K4l/3wV3s6MJT/KYnAK9y8J
ZgfIPxz88NtFMN9iiMG1D53Dn0reWVlHxYciNuaCp+0KueIHoI17eko8cdLiA6Ef
MgfdG+RCzgwARWGAtQsgWSl4vflVy2PFPEz0tv/bal8xa5meLMFrUKTX5hgUvYU/
Z6tGn6D/Qqc6f1zLXbBwHSs09dR2CQzreExZBfMzQsNhFRAbd03OIozUhfJFfbdT
6u9AWpQKXCBfTkBdYiJ23//OYb2MI3jSNwLgjt7RETeJ9r/tSQdirpLsQBqvFAnZ
0E6yove+7u7Y/9waLd64NnHi/Hm3lCXRSHNboTXns5lndcEZOitHTtNCjv0xyBZm
2tIMPNuzjsmhDYAPexZ3FL//2wmUspO8IFgV6dtxQ/PeEMMA3KgqlbbC1j+Qa3bb
bP6MvPJwNQzcmRk13NfIRmPVNnGuV/u3gm3c
-----END CERTIFICATE-----)PEM";

WiFiClient plainClient;

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
const unsigned long POLL_TIMEOUT_MS = 5000;

// State from the server
int    pending = 0;
long   alertId = 0;              // oldest waiting alert (what the button acknowledges)
String orders[4];
int    orderCount = 0;
int    failCount = 0;            // consecutive failed polls

// Detail of the order drawn on screen, from the `display` field of /alert
bool   hasDisplay = false;
long   displayAlertId = 0;
String displayOrder;
String displayStatus;
String displayItems[5];
String displayItemNotes;
String displayRequest;
int    displayItemCount = 0;
int    displayMore = 0;
bool   displayAcked = false;

// Local state
unsigned long lastPoll = 0, lastToggle = 0, lastPress = 0, lastRssi = 0;
unsigned long lastRedraw = 0;
bool outputOn = false;
bool lastButton = HIGH;
String lastScreen = "";          // signature of what's drawn, to avoid flicker

void setOutputs(bool on) {
  outputOn = on;
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
}

String makeSetupApName() {
  uint64_t chip = ESP.getEfuseMac();
  char name[24];
  snprintf(name, sizeof(name), "Bingnondo-%04X", (uint16_t)(chip & 0xFFFF));
  return String(name);
}

void saveServerUrl(const String& url);

void loadSettings() {
  prefs.begin("bingnondo", true);
  serverUrl = prefs.getString("server_url", "");
  prefs.end();
  serverUrl.trim();
  while (serverUrl.endsWith("/")) serverUrl.remove(serverUrl.length() - 1);

  String forced = FORCE_SERVER_URL;
  forced.trim();
  while (forced.endsWith("/")) forced.remove(forced.length() - 1);
  if (forced.length() > 0 && forced != serverUrl) {
    saveServerUrl(forced);
    Serial.printf("Forced server URL to %s\n", serverUrl.c_str());
  }
}

void loadWifiVersion() {
  prefs.begin("bingnondo", true);
  wifi_version = prefs.getUInt("wifi_version", 0);
  prefs.end();
}

void saveWifiVersion(uint v) {
  prefs.begin("bingnondo", false);
  prefs.putUInt("wifi_version", v);
  prefs.end();
}

void loadFailedConfigVersion() {
  prefs.begin("bingnondo", true);
  failedConfigVersion = prefs.getUInt("wifi_failed_version", 0);
  prefs.end();
}

void saveFailedConfigVersion(uint v) {
  prefs.begin("bingnondo", false);
  if (v == 0) prefs.remove("wifi_failed_version");
  else prefs.putUInt("wifi_failed_version", v);
  prefs.end();
}

//
void saveServerUrl(const String& url) {
  serverUrl = url;
  serverUrl.trim();
  while (serverUrl.endsWith("/")) serverUrl.remove(serverUrl.length() - 1);
  prefs.begin("bingnondo", false);
  prefs.putString("server_url", serverUrl);
  prefs.end();
}

void printSerialHelp() {
  Serial.println("Serial commands: url <http(s)://...> | status | help");
}

bool isValidServerUrl(const String& value) {
  String lower = value;
  lower.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://");
}

void processSerialCommand(const String& line) {
  String trimmed = line;
  trimmed.trim();
  if (trimmed.length() == 0) return;

  String lower = trimmed;
  lower.toLowerCase();

  if (lower == "help" || lower == "?") {
    printSerialHelp();
    return;
  }

  if (lower == "status") {
    Serial.printf("Server URL: %s\n", serverUrl.length() ? serverUrl.c_str() : "(not set)");
    Serial.printf("WiFi: %s | IP: %s\n",
                  WiFi.status() == WL_CONNECTED ? "up" : "DOWN",
                  WiFi.localIP().toString().c_str());
    return;
  }

  if (lower == "url" || lower.startsWith("url ") || lower == "seturl" || lower.startsWith("seturl ")) {
    int space = trimmed.indexOf(' ');
    String value = space < 0 ? "" : trimmed.substring(space + 1);
    value.trim();
    while (value.endsWith("/")) value.remove(value.length() - 1);

    if (!isValidServerUrl(value)) {
      Serial.println("URL must start with http:// or https://");
      return;
    }

    saveServerUrl(value);
    failCount = 0;
    lastPoll = 0;
    lastConfigPoll = 0;
    lastScreen = "";
    Serial.printf("Server URL set to %s\n", serverUrl.c_str());
    if (WiFi.status() == WL_CONNECTED) drawScreen(millis());
    return;
  }

  printSerialHelp();
}

void handleSerialCommands() {
  static String buffer;
  static unsigned long lastCharAt = 0;

  while (Serial.available()) {
    char c = static_cast<char>(Serial.read());
    if (c == '\n' || c == '\r') {
      String line = buffer;
      buffer = "";
      lastCharAt = 0;
      processSerialCommand(line);
      return;
    }
    if (buffer.length() < 220) buffer += c;
    lastCharAt = millis();
  }

  if (buffer.length() > 0 && millis() - lastCharAt > 1000) {
    buffer = "";
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

String fitText(const String& text, int maxChars) {
  if (text.length() <= maxChars) return text;
  return text.substring(0, maxChars - 2) + "..";
}

void printCenteredFit(const String& text, int y, uint8_t size, uint16_t color) {
  int maxChars = (SCREEN_W - 16) / (6 * size);
  printCentered(fitText(text, maxChars), y, size, color);
}

void drawSetupScreen() {
  tft.fillScreen(COL_BLACK);
  tft.fillRect(0, 0, SCREEN_W, 30, COL_NAVY);
  tft.setTextSize(2);
  tft.setTextColor(COL_WHITE);
  tft.setCursor(8, 8);
  tft.print("KITCHEN");
  String setupLabel = "WIFI SETUP";
  tft.setCursor(SCREEN_W - 8 - setupLabel.length() * 12, 8);
  tft.print(setupLabel);

  printCentered("Join this Wi-Fi:", 52, 2, COL_WHITE);
  printCentered(setupApName, 82, 3, COL_YELLOW);
  printCentered("Open 192.168.4.1", 132, 2, COL_CYAN);
  printCentered("Enter Wi-Fi + server URL", 168, 1, COL_GREY);
}

void runSetupPortal() {
  if (WiFi.status() == WL_CONNECTED && serverUrl.length() > 0) {
    WiFi.setSleep(false);
    return;
  }

  drawSetupScreen();

  WiFiManager wm;
  wm.setConfigPortalTimeout(300);
  wm.setDebugOutput(false);
  wm.setAPCallback([](WiFiManager*) {
    drawSetupScreen();
  });

  WiFiManagerParameter customServerUrl(
    "server_url",
    "Server URL (http://PC-IP:5000 or https://...)",
    serverUrl.c_str(),
    200
  );
  wm.addParameter(&customServerUrl);

  bool ok;
  if (WiFi.status() == WL_CONNECTED) {
    // Wi-Fi is already fine; only the server URL is missing.
    ok = wm.startConfigPortal(setupApName.c_str());
  } else {
    ok = wm.autoConnect(setupApName.c_str());
  }

  if (!ok) {
    Serial.println("Setup portal timed out, will retry.");
    return;
  }

  String newUrl = customServerUrl.getValue();
  newUrl.trim();
  while (newUrl.endsWith("/")) newUrl.remove(newUrl.length() - 1);
  if (newUrl.length() > 0 && newUrl != serverUrl) {
    saveServerUrl(newUrl);
  }

  WiFi.setSleep(false);                 // keep the radio awake, avoids dropped polls
  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());
  Serial.printf("Server URL: %s\n", serverUrl.length() ? serverUrl.c_str() : "(not set)");

  lastScreen = "";
}

// ---------------------------------------------------------------- screen ----
void drawScreen(unsigned long now) {
  bool offline = failCount >= 3;

  // Only redraw when something visible changed, plus a periodic refresh so the
  // screen never looks stuck.
  String sig = String(offline) + "|" + pending + "|" + alertId;
  sig += String("|") + hasDisplay + "|" + displayStatus + "|" + displayOrder;
  for (int i = 0; i < displayItemCount; i++) sig += "|" + displayItems[i];
  sig += "|" + displayItemNotes + "|" + displayRequest + "|" + displayMore;
  for (int i = 0; i < orderCount; i++) sig += "|" + orders[i];
  if (sig == lastScreen && now - lastRedraw < 5000) return;
  lastScreen = sig;
  lastRedraw = now;

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

  if (!hasDisplay) {
    if (pending == 0) {
      printCentered("All clear", 90, 4, COL_GREEN);
      printCentered("No new orders", 140, 2, COL_GREY);
      if (configStatus.length() > 0) printCentered(configStatus, 185, 1, COL_YELLOW);
      return;
    }

    printCentered("NEW ORDER", 44, 2, COL_WHITE);
    String bigOrder = orderCount > 0 ? orders[0] : String("NEW ORDER");
    printCentered(bigOrder, 70, 6, COL_YELLOW);

    if (pending > 1) {
      printCentered(String("+") + (pending - 1) + " waiting", 130, 2, COL_CYAN);
      int y = 156;
      for (int i = 1; i < orderCount; i++) {
        printCentered(orders[i], y, 2, COL_GREY);
        y += 22;
      }
    }

    if (configStatus.length() > 0) printCentered(configStatus, 185, 1, COL_YELLOW);
    tft.fillRect(0, 210, SCREEN_W, 30, COL_RED);
    printCentered("PRESS BUTTON TO ACK", 218, 2, COL_WHITE);
    return;
  }

  printCenteredFit(displayStatus, 38, 2, displayAcked ? COL_GREEN : COL_YELLOW);
  printCenteredFit(displayOrder, 60, 4, COL_WHITE);

  int y = 94;
  for (int i = 0; i < displayItemCount; i++) {
    printCenteredFit(displayItems[i], y, 2, i % 2 == 0 ? COL_CYAN : COL_WHITE);
    y += 15;
  }
  if (displayMore > 0) {
    printCenteredFit(String("+") + displayMore + " more items", 172, 1, COL_GREY);
  }
  if (displayItemNotes.length() > 0) {
    printCenteredFit(String("Items: ") + displayItemNotes, 181, 1, COL_GREY);
  }
  if (displayRequest.length() > 0) {
    printCenteredFit(String("Note: ") + displayRequest, 191, 1, COL_YELLOW);
  }
  if (pending > 1) {
    printCenteredFit(String("+") + (pending - 1) + " waiting", 201, 1, COL_CYAN);
  } else if (configStatus.length() > 0) {
    printCenteredFit(configStatus, 201, 1, COL_GREY);
  }

  if (displayAcked) {
    tft.fillRect(0, 210, SCREEN_W, 30, COL_GREEN);
    printCentered("ACKNOWLEDGED", 218, 2, COL_BLACK);
  } else {
    tft.fillRect(0, 210, SCREEN_W, 30, COL_RED);
    printCentered("PRESS BUTTON TO ACK", 218, 2, COL_WHITE);
  }
}

// --------------------------------------------------------------- network ----
const char* rootCaForUrl(const String& url) {
  if (url.indexOf("bingnondo-production.up.railway.app") >= 0) return ISRG_ROOT_X2;
  if (url.indexOf("bingnondo.vercel.app") >= 0) return GTS_ROOT_R1;
  return nullptr;
}

bool beginRequest(HTTPClient& http, const String& url) {
  if (!url.startsWith("https://")) return http.begin(plainClient, url);

  WiFiClientSecure secureClient;
  const char* rootCa = rootCaForUrl(url);
  if (rootCa != nullptr) secureClient.setCACert(rootCa);
  else secureClient.setInsecure();
  secureClient.setHandshakeTimeout(30);
  return http.begin(secureClient, url);
}

void logHttpError(HTTPClient& http, const char* label, int code) {
  if (code < 0) Serial.printf("%s error: %s\n", label, http.errorToString(code).c_str());
}

// Poll the server. Updates pending / alertId / orders. Returns true on success.
bool pollServer() {
  if (WiFi.status() != WL_CONNECTED || serverUrl.length() == 0) return false;

  HTTPClient http;
  String url = serverUrl + "/api/esp32/alert?device_code=" + DEVICE_CODE;
  beginRequest(http, url);
  http.setTimeout(POLL_TIMEOUT_MS);
  http.addHeader("x-device-key", DEVICE_KEY);
  int code = http.GET();

  if (code != 200) {
    logHttpError(http, "Poll failed", code);
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

  JsonObject d = doc["display"];
  hasDisplay = !d.isNull();
  displayItemCount = 0;
  displayItemNotes = "";
  if (hasDisplay) {
    displayAlertId = d["alert_id"] | 0L;
    displayOrder = d["order_number"] | "";
    displayRequest = d["special_request"] | "";
    displayAcked = d["acknowledged"] | false;
    displayStatus = displayAcked ? "ACKNOWLEDGED" : "NEW ORDER";
    displayMore = d["more"] | 0;
    for (JsonVariant v : d["items"].as<JsonArray>()) {
      if (displayItemCount >= 5) break;
      JsonObject item = v.as<JsonObject>();
      displayItems[displayItemCount++] = String(item["qty"] | 1) + "x " + String(item["name"] | "");
      String notes = item["notes"] | "";
      if (notes.length() > 0 && displayItemNotes.length() < 60) {
        if (displayItemNotes.length() > 0) displayItemNotes += "; ";
        displayItemNotes += notes;
      }
    }
  }
  Serial.println(body);
  return true;
}

// Acknowledge the order currently on screen. Returns true if the server accepted it.
bool sendAck(long id) {
  if (WiFi.status() != WL_CONNECTED || serverUrl.length() == 0 || id <= 0) return false;

  HTTPClient http;
  beginRequest(http, serverUrl + "/api/esp32/ack");
  http.setTimeout(5000);
  http.addHeader("x-device-key", DEVICE_KEY);
  http.addHeader("Content-Type", "application/json");
  String body = String("{\"device_code\":\"") + DEVICE_CODE + "\",\"alert_id\":" + id + "}";
  int code = http.POST(body);
  logHttpError(http, "Ack failed", code);
  Serial.printf("Ack %ld -> HTTP %d\n", id, code);
  http.end();
  return code == 200;
}

bool connectToWifi(const String& ssid, const String& pass, unsigned long timeoutMs) {
  WiFi.disconnect();
  delay(150);
  WiFi.begin(ssid.c_str(), pass.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
    delay(250);
  }
  return WiFi.status() == WL_CONNECTED;
}

bool sendConfigAckTo(const String& targetUrl, unsigned int version, bool success, const String& error) {
  if (WiFi.status() != WL_CONNECTED || targetUrl.length() == 0) return false;

  HTTPClient http;
  beginRequest(http, targetUrl + "/api/esp32/config/ack");
  http.setTimeout(5000);
  http.addHeader("x-device-key", DEVICE_KEY);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["device_code"] = DEVICE_CODE;
  doc["version"] = version;
  doc["success"] = success;
  if (!success) doc["error"] = error;

  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  logHttpError(http, "Config ack failed", code);
  Serial.printf("Config ack v%u %s -> HTTP %d\n", version, success ? "ok" : "failed", code);
  http.end();
  return code == 200;
}

bool sendConfigAck(unsigned int version, bool success, const String& error) {
  return sendConfigAckTo(serverUrl, version, success, error);
}

void applyWifiConfig(unsigned int newVersion, const String& newSsid,
                     const String& newPassword, const String& newServerUrl) {
  String oldSsid = WiFi.SSID();
  String oldPass = WiFi.psk();
  String oldServer = serverUrl;

  Serial.printf("Applying Wi-Fi config v%u for %s\n", newVersion, newSsid.c_str());

  if (!connectToWifi(newSsid, newPassword, 20000)) {
    Serial.println("New Wi-Fi failed, rolling back");
    bool restored = oldSsid.length() > 0 && connectToWifi(oldSsid, oldPass, 20000);
    if (!restored) {
      Serial.println("Rollback failed; setup portal will open");
      WiFi.disconnect(true);
    }
    serverUrl = oldServer;
    failedConfigVersion = newVersion;
    saveFailedConfigVersion(newVersion);
    configBackoffMs = min(configBackoffMs * 2, 300000ul);
    configStatus = "CONFIG FAILED";
    sendConfigAck(newVersion, false, "Could not connect to the new Wi-Fi network.");
    lastScreen = "";
    return;
  }

  WiFi.setSleep(false);
  bool serverChanged = newServerUrl.length() > 0 && newServerUrl != oldServer;
  if (serverChanged) sendConfigAckTo(oldServer, newVersion, true, "");
  if (newServerUrl.length() > 0) saveServerUrl(newServerUrl);
  saveWifiVersion(newVersion);
  wifi_version = newVersion;
  failedConfigVersion = 0;
  saveFailedConfigVersion(0);
  configBackoffMs = 30000;
  configStatus = "";
  failCount = 0;
  lastPoll = 0;
  lastScreen = "";

  sendConfigAck(newVersion, true, "");
  Serial.println("Wi-Fi config applied");
}

void pollConfig() {
  if (WiFi.status() != WL_CONNECTED || serverUrl.length() == 0) return;

  HTTPClient http;
  String url = serverUrl + "/api/esp32/config?device_code=" + DEVICE_CODE
             + "&version=" + String(wifi_version);
  beginRequest(http, url);
  http.setTimeout(5000);
  http.addHeader("x-device-key", DEVICE_KEY);
  int code = http.GET();

  if (code != 200) {
    logHttpError(http, "Config poll failed", code);
    Serial.printf("Config poll failed, HTTP %d\n", code);
    http.end();
    return;
  }

  String body = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    Serial.println("Bad JSON from config endpoint");
    return;
  }

  unsigned int newVersion = doc["version"] | 0;
  if (newVersion <= wifi_version || newVersion == failedConfigVersion) return;

  String newSsid = doc["ssid"] | "";
  String newPassword = doc["password"] | "";
  String newServer = doc["server_url"] | "";
  if (newSsid.length() == 0 || newPassword.length() == 0) {
    failedConfigVersion = newVersion;
    saveFailedConfigVersion(newVersion);
    configBackoffMs = min(configBackoffMs * 2, 300000ul);
    configStatus = "CONFIG FAILED";
    sendConfigAck(newVersion, false, "Config response was missing credentials.");
    return;
  }

  configStatus = "APPLYING…";
  lastScreen = "";
  applyWifiConfig(newVersion, newSsid, newPassword, newServer);
}

// ----------------------------------------------------------------- setup ----
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);
  delay(500);                       // let USB-serial settle before printing
  Serial.println("> boot: serial up");

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  setOutputs(false);

  // Fallback: hold the button while powering on to erase Wi-Fi + server URL.
  // Do NOT restart here — a stuck/shorted button would cause an infinite boot
  // loop before the screen even initializes. Clear settings and fall through to
  // the setup portal instead.
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(3000);
    if (digitalRead(BUTTON_PIN) == LOW) {
      Serial.println("> boot: button held — clearing Wi-Fi + server URL");
      WiFiManager wm;
      wm.resetSettings();
      prefs.begin("bingnondo", false);
      prefs.remove("server_url");
      prefs.remove("wifi_version");
      prefs.remove("wifi_failed_version");
      prefs.end();
      prefs.begin("bingnondo", true);
      Serial.println("> boot: settings cleared, will open setup portal");
      prefs.end();
    }
  }

  TFT_START();
  Serial.println("> boot: tft init done");
  tft.setRotation(1);                    // landscape: 320 x 240
  tft.fillScreen(COL_BLACK);
  printCentered("Starting...", 110, 2, COL_WHITE);

  setupApName = makeSetupApName();
  loadSettings();
  loadWifiVersion();
  loadFailedConfigVersion();
  Serial.printf("Server URL: %s\n", serverUrl.length() ? serverUrl.c_str() : "(not set)");
  printSerialHelp();
  Serial.println("> boot: entering setup portal");
  runSetupPortal();
  Serial.println("> boot: setup portal returned");

  setOutputs(true);  delay(150);         // startup blip
  setOutputs(false);

  lastScreen = "";
  lastRedraw = 0;
  if (WiFi.status() == WL_CONNECTED && serverUrl.length() > 0) drawScreen(millis());
  else drawSetupScreen();
}

// ------------------------------------------------------------------ loop ----
void loop() {
  unsigned long now = millis();

  handleSerialCommands();

  if (WiFi.status() != WL_CONNECTED || serverUrl.length() == 0) {
    runSetupPortal();
    if (WiFi.status() != WL_CONNECTED || serverUrl.length() == 0) {
      delay(1000);
      return;
    }
    lastScreen = "";
    now = millis();                      // the portal may have blocked for minutes
  }

  // Button (active LOW), debounced, acts on the press
  bool b = digitalRead(BUTTON_PIN);
  if (b == LOW && lastButton == HIGH && now - lastPress > DEBOUNCE_MS) {
    lastPress = now;
    if (pending > 0 && sendAck(alertId)) {
      long ackedId = alertId;
      pending--;
      for (int i = 1; i < orderCount; i++) orders[i - 1] = orders[i];
      if (orderCount > 0) orderCount--;
      alertId = 0;                       // real next id arrives with the next poll
      if (pending == 0) setOutputs(false);
      if (hasDisplay && displayAlertId == ackedId) {
        displayAcked = true;
        displayStatus = "ACKNOWLEDGED";
      }
      drawScreen(now);
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
    drawScreen(now);

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
  // Remote Wi-Fi config check with exponential backoff after failures
  if (now - lastConfigPoll >= configBackoffMs) {
    lastConfigPoll = now;
    pollConfig();
  }
}
