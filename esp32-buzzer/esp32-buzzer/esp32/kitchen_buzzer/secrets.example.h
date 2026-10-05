// secrets.example.h — template for secrets.h. Do NOT put real credentials
// here; this file is the one that is safe to commit. To use it:
//   1. copy this file to secrets.h
//   2. set WIFI_SSID / WIFI_PASS to your Wi-Fi network
//   3. set SERVER_URL to the backend PC's IPv4 address (run `ipconfig`)
//   4. set DEVICE_KEY to the same value as ESP32_DEVICE_KEY in backend/.env
#pragma once

const char* WIFI_SSID  = "your_wifi_ssid_here";
const char* WIFI_PASS  = "your_wifi_password_here";
const char* SERVER_URL = "http://YOUR_PC_IP:5000";
const char* DEVICE_KEY = "must_match_ESP32_DEVICE_KEY_in_backend_.env";
