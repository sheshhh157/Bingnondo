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
ESP32_CONFIG_SECRET=64_hex_characters
```
Generate the encryption secret once and keep it stable:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Database: run `npm --prefix backend run migrate`. Migration `008_esp32_devices.sql` creates the device `ESP32-KitchenA`, and `026_esp32_wifi_config.sql` stores the encrypted Wi-Fi config. Restart the backend.

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
- **The server URL is stored on the ESP32**, not hardcoded in the sketch. Enter it in the setup portal (`http://<PC-IP>:5000`). If the PC's LAN IP changes, hold the ESP32 button while powering on to clear the saved Wi-Fi/server settings, then run the portal again.
- **USB Wi-Fi adapters stutter with power saving on** (dropped polls → `HTTP -1`). Disable it (admin PowerShell):
  ```powershell
  Set-NetAdapterAdvancedProperty -Name "Wi-Fi" -RegistryKeyword "*SelectiveSuspend" -RegistryValue 0
  ```
- Liveness check anytime (in Postgres): `SELECT device_code, status, last_ping_at FROM esp32_devices;` — `last_ping_at` ticks on every poll.

## 5. Flash and connect Wi-Fi
Arduino IDE → Library Manager: install **Adafruit ST7735 and ST7789 Library** (accept its dependencies), **ArduinoJson 7.x**, and **WiFiManager** (tzapu, v2.0.17+). Open `esp32/kitchen_buzzer/kitchen_buzzer.ino`, choose your ESP32 board, upload, and open Serial Monitor at 115200.

Only `DEVICE_CODE` and `DEVICE_KEY` remain in the sketch. Wi-Fi credentials and the server URL are not hardcoded.

First-time setup:
1. Power the ESP32. It creates a setup Wi-Fi named **`Bingnondo-XXXX`** (the last 4 hex digits of its MAC address).
2. On your phone, join that setup Wi-Fi. The phone will temporarily leave your normal Wi-Fi.
3. Open **`192.168.4.1`** in the phone browser.
4. Pick your kitchen Wi-Fi, enter its password, and enter the server URL, for example **`http://192.168.1.10:5000`** (use the PC's IPv4 address from `ipconfig`).
5. Save. The ESP32 joins the same Wi-Fi as your phone and starts polling the backend.

If the Wi-Fi password changes later, the ESP32 cannot reconnect and automatically reopens the `Bingnondo-XXXX` setup Wi-Fi. Join it from the phone and enter the new password. The saved server URL is prefilled.

If you need to start over completely, hold the button while powering on. That clears the saved Wi-Fi and server URL and restarts the setup portal.

- ESP32 and PC must be on the same Wi-Fi; allow Node.js through the PC firewall on port 5000 (see section 4).
- **Screen stays white/blank or shows garbage:** check the wiring notes in section 3 first (BL to 3V3, module-side pin order) — on our build that was the real cause. If wiring is perfect and it is still blurred/garbled, set `#define USE_ST7789 0` and install the **Adafruit ILI9341** library instead.
- Colors look inverted: tell me and I'll flip it (one line).
- Serial `HTTP 401` = key mismatch, `HTTP 404` = device code not in `esp32_devices`, `HTTP -1` = server unreachable. Short `HTTP -1` bursts right after boot/reset are normal.
- Serial heartbeat every 10 s: `RSSI -XX dBm | WiFi up | fails N`. Healthy is RSSI above about −70 dBm with `fails 0`.
- Tuning knobs at the top of the sketch: `POLL_MS` (1000 ms poll rate) and `POLL_TIMEOUT_MS` (1500 ms before a stuck poll gives up and retries).
- Power: USB adapter (5V, 1A+) into the ESP32's micro-USB port.

## 6. Change Wi-Fi from Admin → System Settings
Once the ESP32 is online, you do not need the `Bingnondo-XXXX` portal for routine changes:

1. Open **Admin → System Settings → ESP32 Wi-Fi**.
2. Press **Configure** on the `ESP32-KitchenA` row.
3. Enter the new SSID, password, and server URL. Leave the password blank to keep the current one. A password is required when the SSID changes.
4. Save. The device checks `GET /api/esp32/config` every 30 seconds, joins the new network, and confirms with `POST /api/esp32/config/ack`.

The admin table shows **applied** once the device confirms the version. If the device cannot join the new network it reconnects to the old Wi-Fi, records the error, and the portal remains the fallback. If the router password changes *before* the new config is pushed, the device cannot poll the backend and you must use the `Bingnondo-XXXX` portal.

**Admin-push troubleshooting:**
- **Status stays "waiting for device":** the device hasn't acknowledged the new config yet. It polls every 30 s (longer after failures). Confirm the device is **Online**, the server URL is correct, and the PC firewall allows port 5000. Press **Resend** to bump the version and make the device re-poll.
- **Status shows an error (⚠):** the device failed to join the new network. It rolled back to the old Wi-Fi. Fix the SSID/password/server URL, then press **Resend** or save a new version. The screen also shows `CONFIG FAILED`.
- **Serial `HTTP -1`:** the ESP32 can't reach the backend. Use **Test connection** in the admin row to check the URL, verify the PC IP hasn't changed, and check Windows Firewall on port 5000.
- **Serial `HTTP 401`:** `ESP32_DEVICE_KEY` mismatch between `backend/.env` and the sketch.
- **Serial `HTTP 404`:** device code not in `esp32_devices` (run migration `008`).
- **Exponential backoff:** after a failed config, the device waits longer between retries (30 s → 60 s → … → 5 min). It won't retry the same bad version until a newer version is saved or the device reboots.
- **Screen status chip:** `APPLYING…` while joining the new network, `CONFIG FAILED` on failure, blank once applied.
- **History:** press the history button on a device row to see past config changes and versions.
- **Bulk push:** use **PUT /api/admin/system-settings/esp32-devices/wifi/bulk** (or the admin UI) to push the same Wi-Fi to all online devices at once.

## Notes
- The button (when added) acknowledges the *alert* (stops the buzz). It does not change the order's status; the kitchen still moves the order through preparing and ready on its own screen.
- Keep `backend/.env` private. `ESP32_CONFIG_SECRET` decrypts the Wi-Fi passwords stored in the database.
