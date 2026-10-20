# ESP32 kitchen buzzer v2: for your NEW_Bingnondo system
Active buzzer + 2.4" ST7789 screen (240x320), USB powered. The acknowledge button is optional and can be added later.

## How it works
1. An order becomes **paid**. In your new system that happens in two places, and both now ring the buzzer:
   - a **counter order** (it is created already paid), and
   - a **GCash order** once staff verify the receipt.
2. The backend saves a row in `kitchen_alerts`; the kitchen screen lists the order under **New Orders** and the ESP32 starts beeping.
3. The ESP32 asks `GET /api/esp32/alert` every second (`POLL_MS`, default 1000 ms). While alerts are waiting it beeps, and the screen shows the oldest order big, with "+N waiting" and the next order numbers.
4. Press the **button** on the ESP32 if you've wired it, or press **Acknowledge (All)** on the kitchen screen. Either way the order's alert row is cleared, so the buzzer stops on the next poll.

With several orders waiting, each button press acknowledges the one on screen (the oldest), then the next one shows.

## 1. Copy the files into your project
Same folder layout as your project, so they drop in over yours.

| File | Change |
|---|---|
| `backend/src/modules/kitchen/kitchen-alert.js` | **new**: creates the alert (safe: if it fails, the sale still saves) |
| `backend/src/modules/kitchen/esp32.routes.js` | **new**: `GET /alert` (polled) and `POST /ack` (button) |
| `backend/src/modules/orders/orders.controller.js` | counter order creates the alert |
| `backend/src/modules/payments/payments.controller.js` | counter payment and GCash verify create the alert |
| `backend/src/sockets/index.js` | alert payload matches the kitchen panel; acknowledging also notifies kitchen screens |
| `backend/server.js` | one line mounting `/api/esp32` |
| `frontend/src/pages/kitchen/KitchenPage.jsx` | Acknowledge (All) also clears that order's alert row, stopping the ESP32 buzz |

If you've edited any of those 5 existing files since you sent the zip, don't overwrite them. Apply just the added lines (each is small and marked with a comment).

Add to `backend/.env`:
```
ESP32_DEVICE_KEY=pick_any_long_random_string
ESP32_DEVICE_CODE=ESP32-KitchenA
```
Database: no new SQL. Your migration `008_esp32_devices.sql` already creates the device `ESP32-KitchenA`. If you haven't run it, run `npm --prefix backend run migrate`. Restart the backend.

## 2. Test before touching hardware
```
curl -H "x-device-key: YOUR_KEY" "http://localhost:5000/api/esp32/alert?device_code=ESP32-KitchenA"
```
Expect `{"buzz":false,"pending":0,"alert_id":null,"orders":[]}`.
Create a counter order in the cashier page and run it again: `buzz:true` with the order number, and "Incoming Alerts" appears on the kitchen page. Test the button route (use the `alert_id` from the reply):
```
curl -X POST -H "x-device-key: YOUR_KEY" -H "Content-Type: application/json" -d "{\"device_code\":\"ESP32-KitchenA\",\"alert_id\":1}" http://localhost:5000/api/esp32/ack
```
The kitchen panel should clear it.

## 3. Wiring
**Buzzer** (active buzzer, wired directly, no transistor or resistor):
```
buzzer (+, longer leg)  ── GPIO25
buzzer (−)              ── GND
```
Fine for testing. If it ever stays in permanent use, add an NPN transistor (GPIO25 → 1k → base, emitter → GND, collector → buzzer −, buzzer + → VIN) so the pin isn't driving it directly.

**Button (optional, add later):** one leg to `GPIO27`, the other to `GND` (no resistor, the code uses the internal pull-up). Until you add it, acknowledge from the kitchen page.

**2.4" ST7789 screen** (match by the label printed on your module):
| Screen pin | ESP32 |
|---|---|
| VCC | 3V3 |
| GND | GND |
| SCK / SCL | GPIO18 |
| SDI / SDA / MOSI | GPIO23 |
| CS | GPIO5 |
| DC / A0 | GPIO16 |
| RESET / RES | GPIO17 |
| LED / BL / BLK | 3V3 |

Leave SDO/MISO, T_* (touch) and SD-card pins unconnected.

Three things that cost us hours — check them first if the screen misbehaves:
- **The screen's `SDA`/`SCL` are SPI names, not I²C.** They wire to `GPIO23`/`GPIO18` as in the table — *never* to the ESP32 pins actually labelled `SDA`/`SCL` (GPIO21/GPIO22).
- **`LED`/`BL`/`BLK` must be connected to `3V3`** or the screen stays dark/white no matter how perfect everything else is.
- Your DevKit prints GPIO16 as `RX2` and GPIO17 as `TX2` on the header; that's normal — use those pins for `DC` and `RESET`.

## 4. PC side (one-time Windows setup)
- **Firewall:** the backend listens on port 5000 and must accept inbound connections (admin PowerShell):
  ```powershell
  New-NetFirewallRule -DisplayName "Bingnondo backend 5000" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Any
  ```
- **Keep `SERVER_URL` in the sketch in sync** with the PC's LAN IP (`ipconfig`). A new DHCP lease breaks the ESP32 until the sketch is updated.
- **USB Wi-Fi adapters stutter with power saving on** (dropped polls → `HTTP -1`). Disable it (admin PowerShell):
  ```powershell
  Set-NetAdapterAdvancedProperty -Name "Wi-Fi" -RegistryKeyword "*SelectiveSuspend" -RegistryValue 0
  ```
- Liveness check anytime (in Postgres): `SELECT device_code, status, last_ping_at FROM esp32_devices;` — `last_ping_at` ticks on every poll.

## 5. Flash
Arduino IDE → Library Manager: install **Adafruit ST7735 and ST7789 Library** (accept its dependencies) and **ArduinoJson 7.x**. Open `esp32/kitchen_buzzer/kitchen_buzzer.ino`, fill in the five values at the top, choose your ESP32 board, upload, open Serial Monitor at 115200.

- ESP32 and PC must be on the same Wi-Fi; allow Node.js through the PC firewall on port 5000 (see section 4).
- **Screen stays white/blank or shows garbage:** check the wiring notes in section 3 first (BL to 3V3, module-side pin order) — on our build that was the real cause. If wiring is perfect and it is still blurred/garbled, set `#define USE_ST7789 0` and install the **Adafruit ILI9341** library instead.
- Colors look inverted: tell me and I'll flip it (one line).
- Serial `HTTP 401` = key mismatch, `HTTP 404` = device code not in `esp32_devices`, `HTTP -1` = server unreachable. Short `HTTP -1` bursts right after boot/reset are normal.
- Serial heartbeat every 10 s: `RSSI -XX dBm | WiFi up | fails N`. Healthy is RSSI above about −70 dBm with `fails 0`.
- Tuning knobs at the top of the sketch: `POLL_MS` (1000 ms poll rate) and `POLL_TIMEOUT_MS` (1500 ms before a stuck poll gives up and retries).
- Power: USB adapter (5V, 1A+) into the ESP32's micro-USB port.

## Notes
- The button (when added) acknowledges the *alert* (stops the buzz). It does not change the order's status; the kitchen still moves the order through preparing and ready on its own screen.
- Your zip's `.env.example` was filled with joke values; I didn't touch it. Keep your real `.env` private.
