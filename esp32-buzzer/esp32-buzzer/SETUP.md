# ESP32 kitchen buzzer — setup

## How it works
1. Cashier creates the order, then marks it **paid** (`POST /api/payments`).
2. The backend saves a row in `kitchen_alerts` and shows it in the kitchen screen's "Incoming Alerts" panel.
3. The ESP32 asks `GET /api/esp32/alert` every 2 seconds. While an unacknowledged alert exists it answers `buzz: true`, so the ESP32 beeps the buzzer.
4. Kitchen presses **Acknowledge** on their screen. The alert is marked acknowledged and the ESP32 goes quiet on its next check (within 2 s).

## 1. Backend
The backend already includes everything the buzzer needs — nothing to copy over. The real `backend/` folder already has:

- `src/modules/payments/payments.controller.js` — creates the alert when payment is recorded
- `src/modules/orders/orders.controller.js` — the order-creation alert was removed (it fires on payment now, not order creation)
- `src/sockets/index.js` — alert payload matches what the kitchen panel reads
- `server.js` — mounts `/api/esp32`
- `src/modules/kitchen/esp32.routes.js` — the endpoint the ESP32 polls

Add to `backend/.env`:
```
ESP32_DEVICE_KEY=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ESP32_DEVICE_CODE=ESP32-KitchenA
```

Database: run `sql/seed_esp32_device.sql` (check `SELECT * FROM esp32_devices;` first; if a row exists, put its `device_code` in `ESP32_DEVICE_CODE` instead).

Restart the backend.

## 2. Test before touching hardware
```
curl -H "x-device-key: YOUR_KEY" "http://localhost:5000/api/esp32/alert?device_code=ESP32-KitchenA"
```
Expect `{"buzz":false,"pending":0}`. Mark an order paid in the cashier page, run it again: `buzz:true`. Press Acknowledge in the kitchen page: back to `false`.

## 3. Wiring (breadboard)
The sketch drives the buzzer directly from GPIO25 — no transistor, no LED.
`LED_PIN` is declared but intentionally unused in this buzzer-only version.

```
GPIO25 ──── buzzer (+)
buzzer (−) ── GND
```

That is the whole circuit. If the board doomscrolls you about GPIO25 not being
strong enough for the buzzer in your case, tell me and we can restore the
NPN-transistor variant — the code drives the pin the same way either way, only
the wiring changes.

No 10k resistor, passive buzzer or push button needed for this version.

## 4. Flash the ESP32
Open `esp32/kitchen_buzzer/kitchen_buzzer.ino` in Arduino IDE. Do **not** edit
credentials in the sketch — the sketch `#include "secrets.h"`. One-time setup:

```
cd esp32/kitchen_buzzer
cp secrets.example.h secrets.h
# then edit secrets.h: WIFI_SSID, WIFI_PASS, SERVER_URL, DEVICE_KEY
```

`DEVICE_KEY` must match `ESP32_DEVICE_KEY` in `backend/.env`. Pick your ESP32
board, upload, open Serial Monitor at 115200. `secrets.h` is gitignored and
never committed.

- The ESP32 and the PC must be on the same Wi-Fi/network.
- If Serial shows `HTTP -1`, the PC's firewall is probably blocking port 5000 (allow Node.js on private networks).
- `HTTP 401` = key mismatch, `HTTP 404` = device code not in `esp32_devices`.
