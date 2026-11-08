const express = require('express');
const crypto  = require('crypto');
const db      = require('../../config/db');
const esp32Crypto = require('../../config/esp32-config-crypto');
const socketHub = require('../../sockets');
const router  = express.Router();

// The ESP32 has no user login, so it proves itself with a shared key sent in
// the x-device-key header (set ESP32_DEVICE_KEY in backend/.env).
function deviceAuth(req, res, next) {
  const expected = process.env.ESP32_DEVICE_KEY;
  if (!expected) {
    return res.status(503).json({ message: 'ESP32_DEVICE_KEY is not set on the server.' });
  }
  const given = Buffer.from(req.get('x-device-key') || '');
  const want  = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return res.status(401).json({ message: 'Invalid device key.' });
  }
  next();
}

// GET /api/esp32/alert?device_code=ESP32-KitchenA
// The ESP32 polls this every couple of seconds. Reply:
//   { buzz, pending, alert_id, orders: ["ORD-0012", ...] }
//   buzz   -> true while any alert is unacknowledged
//   alert_id / orders[0] -> the oldest waiting alert (what the button will acknowledge)
//   orders -> up to 6 waiting order numbers, oldest first, for the screen
router.get('/alert', deviceAuth, async (req, res, next) => {
  try {
    const code = req.query.device_code;
    if (!code) return res.status(400).json({ message: 'device_code is required.' });

    const dev = await db.query(
      `UPDATE esp32_devices
          SET status = 'online', last_ping_at = NOW()
        WHERE device_code = $1
        RETURNING id`,
      [code]
    );
    if (!dev.rows[0]) return res.status(404).json({ message: 'Unknown device_code.' });

    const { rows } = await db.query(
      `SELECT ka.id AS alert_id,
              'ORD-' || LPAD(ka.order_id::text, 4, '0') AS order_number
         FROM kitchen_alerts ka
        WHERE ka.device_id = $1 AND ka.acknowledged_at IS NULL
        ORDER BY ka.triggered_at ASC, ka.id ASC`,
      [dev.rows[0].id]
    );

    res.json({
      buzz: rows.length > 0,
      pending: rows.length,
      alert_id: rows[0] ? rows[0].alert_id : null,
      orders: rows.slice(0, 6).map((r) => r.order_number),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/esp32/ack   body: { device_code, alert_id }
// The ESP32 button. Acknowledges the one alert the screen was showing (alert_id),
// so a new order arriving at the same moment is never acknowledged by mistake.
// Same effect as the kitchen pressing Acknowledge on screen.
router.post('/ack', deviceAuth, async (req, res, next) => {
  try {
    const { device_code, alert_id } = req.body || {};
    if (!device_code || !alert_id) {
      return res.status(400).json({ message: 'device_code and alert_id are required.' });
    }

    const { rows } = await db.query(
      `UPDATE kitchen_alerts ka
          SET acknowledged_at = NOW()
         FROM esp32_devices ed
        WHERE ka.id = $1
          AND ed.id = ka.device_id
          AND ed.device_code = $2
          AND ka.acknowledged_at IS NULL
        RETURNING ka.id, ka.device_id`,
      [Number(alert_id), device_code]
    );

    // Already acknowledged (e.g. on the kitchen screen a moment ago) is fine for the device.
    if (!rows[0]) return res.json({ ok: true, already: true });

    socketHub.emitKitchenAlertAck({ alertId: rows[0].id, deviceId: rows[0].device_id });
    res.json({ ok: true, alert_id: rows[0].id });
  } catch (err) {
    next(err);
  }
});

// GET /api/esp32/config?device_code=ESP32-KitchenA&version=3
// Returns credentials only when the server has a newer config version.
router.get('/config', deviceAuth, async (req, res, next) => {
  try {
    const code = req.query.device_code;
    if (!code) return res.status(400).json({ message: 'device_code is required.' });

    const currentVersion = Number(req.query.version || 0);
    if (!Number.isInteger(currentVersion) || currentVersion < 0) {
      return res.status(400).json({ message: 'version must be a non-negative integer.' });
    }

    const { rows } = await db.query(
      `SELECT d.id AS device_id,
              c.ssid,
              c.password_ciphertext,
              c.server_url,
              c.version,
              c.applied_version
         FROM esp32_devices d
         LEFT JOIN esp32_wifi_configs c ON c.device_id = d.id
        WHERE d.device_code = $1`,
      [code]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Unknown device_code.' });

    const cfg = rows[0];
    if (cfg.version == null) {
      return res.json({ version: 0, applied_version: 0 });
    }

    const payload = { version: cfg.version, applied_version: cfg.applied_version };
    if (cfg.version > currentVersion) {
      payload.ssid = cfg.ssid;
      payload.password = esp32Crypto.decryptPassword(cfg.password_ciphertext);
      payload.server_url = cfg.server_url;
    }
    return res.json(payload);
  } catch (err) {
    next(err);
  }
});

// POST /api/esp32/config/ack   body: { device_code, version, success, error }
// Records whether the device joined the new network or needs an admin retry.
router.post('/config/ack', deviceAuth, async (req, res, next) => {
  try {
    const { device_code, version, success, error } = req.body || {};
    const configVersion = Number(version);

    if (!device_code || !Number.isInteger(configVersion) || configVersion < 1) {
      return res.status(400).json({ message: 'device_code and a valid version are required.' });
    }
    if (typeof success !== 'boolean') {
      return res.status(400).json({ message: 'success must be true or false.' });
    }

    const lastError = success ? null : String(error || 'Device failed to apply the Wi-Fi config.').slice(0, 500);

    const { rows } = await db.query(
      `UPDATE esp32_wifi_configs c
          SET applied_version = CASE WHEN $3::boolean THEN $2::integer ELSE c.applied_version END,
              applied_at = CASE WHEN $3::boolean THEN NOW() ELSE c.applied_at END,
              last_error = $4
         FROM esp32_devices d
        WHERE c.device_id = d.id
          AND d.device_code = $1
          AND c.version = $2::integer
        RETURNING c.device_id`,
      [device_code, configVersion, success, lastError]
    );

    if (!rows[0]) return res.status(404).json({ message: 'No matching config version for this device.' });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
