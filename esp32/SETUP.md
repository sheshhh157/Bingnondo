# ESP32 kitchen buzzer — setup (buzzer + ST7789 2.4" TFT + ack button, USB powered)

The buzzer is part of the main Bingnondo backend — no separate server. It rings
when an order is paid and the kitchen's **Incoming Alerts** panel shows the same
alert, so either the physical button or the on-screen button clears it.

## How it works
1. Cashier creates an order, then marks it **paid** (cash) — or, for GCash, staff
   verifies the receipt (`POST /api/payments` → `processPayment`, or
   `POST /api/payments/:orderId/verify` → `verifyPayment`).
2. The backend inserts a row in `kitchen_alerts` (in the same transaction as the
   payment) and emits Socket.io `kitchen_alert`, so the kitchen screen's
   "Incoming Alerts" panel shows it live.
3. The ESP32 asks `GET /api/esp32/alert` every 2 s. While alerts are waiting it
   beeps, blinks the LED, and shows the oldest order big, with "+N waiting" and
   the next order numbers.
4. Press the **button** on the ESP32 (or click Acknowledge on screen). That
   order's alert is acknowledged and disappears from the display and the panel.
   The buzzer stops when no alerts are left.

With several orders waiting, each button press acknowledges the one currently on
screen (the oldest), then the next one shows.

## 1. Backend / frontend pieces (already in this repo)
| File | Role |
|---|---|
| `backend/src/modules/kitchen/esp32.routes.js` | `GET /alert` (polled) and `POST /ack` (button), device-key auth |
| `backend/src/modules/kitchen/kitchen.alert.js` | `createAlert` (in the payment transaction) + `emitAlert` (after commit) |
| `backend/src/modules/payments/payments.controller.js` | creates the alert when a payment is recorded or a GCash receipt is verified |
| `backend/server.js` | mounts `/api/esp32` |
| `backend/src/sockets/index.js` | `kitchen_alert` / `kitchen_alert:ack` events, `esp32:<id>` rooms |
| `frontend/src/pages/kitchen/KitchenPage.jsx` | listens for `kitchen_alert:ack` so a button-acknowledged alert vanishes from the panel live |

Add to `backend/.env` (already done in this repo — change the key if you like):
```
ESP32_DEVICE_KEY=<paste the value from backend/.env>
ESP32_DEVICE_CODE=ESP32-KitchenA
```
Database: the `esp32_devices` table and a row for `ESP32-KitchenA` already exist.
If it's missing, run `esp32/seed_esp32_device.sql` (or check `SELECT * FROM esp32_devices;`
and set `ESP32_DEVICE_CODE` to an existing `device_code`). Restart the backend.

## 2. Test before touching hardware
```
curl -H "x-device-key: YOUR_KEY" "http://localhost:5000/api/esp32/alert?device_code=ESP32-KitchenA"
```
Expect `{"buzz":false,"pending":0,"alert_id":null,"orders":[]}`. Mark an order paid
in the cashier page and run it again: `buzz:true` with the order number. Then test
the button route:
```
curl -X POST -H "x-device-key: YOUR_KEY" -H "Content-Type: application/json" -d "{\"device_code\":\"ESP32-KitchenA\",\"alert_id\":1}" http://localhost:5000/api/esp32/ack
```
(use the `alert_id` from the previous reply; the kitchen panel should clear it).

## 3. Wiring
**Buzzer** (active buzzer via NPN transistor, e.g. 2N2222 / S8050 / BC547; check your part's pinout):
```
GPIO25 ──[1k]── transistor BASE
transistor EMITTER ── GND
transistor COLLECTOR ── buzzer (−)
buzzer (+) ── VIN (5V)
```
**LED:** `GPIO26 ──[220Ω]── LED long leg`, `LED short leg ── GND`

**Button:** one leg to `GPIO27`, the other leg to `GND` (no resistor, the code uses the internal pull-up)

**ST7789 2.4" screen:**
| Screen pin | ESP32 |
|---|---|
| VCC | 3V3 |
| GND | GND |
| SCL / SCK / CLK | GPIO18 |
| SDA / MOSI / DIN | GPIO23 |
| CS | GPIO5 |
| DC / A0 | GPIO16 |
| RES / RST | GPIO17 |
| BLK / BL / LED | 3V3 |

Use 3V3 for the screen, not VIN. Pin labels vary by module, so match by name.

## 4. Flash
In Arduino IDE, Library Manager: install **Adafruit ST7735 and ST7789 Library**
(accept its dependencies) and **ArduinoJson 7.x**. Open
`esp32/kitchen_buzzer/kitchen_buzzer.ino`, fill in the five values at the top
(`WIFI_SSID`, `WIFI_PASS`, `SERVER_URL`, `DEVICE_CODE`, `DEVICE_KEY`), choose your
ESP32 board, upload, open Serial Monitor at 115200.

- ESP32 and PC must be on the same Wi-Fi; allow Node.js through the PC firewall on port 5000.
- Screen blank/white: recheck wiring, then confirm `tft.init(240, 320)` matches your module.
  Wrong colors: try `tft.invertDisplay(true);` right after `tft.init(...)`.
  A colored strip along one edge: adjust `tft.setRotation()`.
- Serial `HTTP 401` = key mismatch, `HTTP 404` = device code not in `esp32_devices`, `HTTP -1` = server unreachable.
- Power: USB adapter (5V, 1A+) into the ESP32's micro-USB port.

## Note
The button acknowledges the *alert* (stops the buzz). It does not change the
order's status; the kitchen still moves the order through confirmed → preparing →
ready on its own screen.
