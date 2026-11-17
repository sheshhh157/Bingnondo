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
//   { buzz, pending, alert_id, orders: ["ORD-0012", ...], display }
//   buzz   -> true while any alert is unacknowledged
//   alert_id / orders[0] -> the oldest waiting alert (what the button will acknowledge)
//   orders -> up to 6 waiting order numbers, oldest first, for the screen
//   display -> the order to draw on screen (items, notes, special request) with
//              acknowledged=true for the last acknowledged order when nothing waits
const DISPLAY_WINDOW_MINUTES = 10;
const MAX_DISPLAY_ITEMS = 5;

const clipText = (value, max) => {
  const text = value == null ? '' : String(value).trim();
  if (text.length <= max) return text;
  return max > 2 ? `${text.slice(0, max - 2)}..` : text.slice(0, max);
};

function formatDisplay(row, acknowledged) {
  if (!row) return null;
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    alert_id: row.alert_id,
    order_number: row.order_number,
    acknowledged,
    special_request: clipText(row.special_request, 40),
    items: items.slice(0, MAX_DISPLAY_ITEMS).map((item) => ({
      name: clipText(item.name, 26),
      qty: item.qty,
      notes: clipText(item.notes, 36),
    })),
    more: Math.max(0, items.length - MAX_DISPLAY_ITEMS),
  };
}

const DISPLAY_SELECT = `
   SELECT ka.id AS alert_id,
          'ORD-' || LPAD(ka.order_id::text, 4, '0') AS order_number,
          o.special_request,
          json_agg(
            json_build_object(
              'name', mi.name || COALESCE(' - ' || oi.variant_name, ''),
              'qty', oi.quantity,
              'notes', oi.notes
            ) ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL) AS items
     FROM kitchen_alerts ka
     JOIN orders o ON o.id = ka.order_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
`;

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

    let display = null;
    if (rows.length > 0) {
      const { rows: waiting } = await db.query(
        `${DISPLAY_SELECT}
          WHERE ka.device_id = $1 AND ka.acknowledged_at IS NULL
          GROUP BY ka.id, o.id, o.special_request
          ORDER BY ka.triggered_at ASC, ka.id ASC
          LIMIT 1`,
        [dev.rows[0].id]
      );
      display = formatDisplay(waiting[0], false);
    } else {
      const { rows: recent } = await db.query(
        `${DISPLAY_SELECT}
          WHERE ka.device_id = $1
            AND ka.acknowledged_at IS NOT NULL
            AND ka.acknowledged_at >= NOW() - ($2::int * INTERVAL '1 minute')
          GROUP BY ka.id, o.id, o.special_request
          ORDER BY ka.acknowledged_at DESC, ka.id DESC
          LIMIT 1`,
        [dev.rows[0].id, DISPLAY_WINDOW_MINUTES]
      );
      display = formatDisplay(recent[0], true);
    }

    res.json({
      buzz: rows.length > 0,
      pending: rows.length,
      alert_id: rows[0] ? rows[0].alert_id : null,
      orders: rows.slice(0, 6).map((r) => r.order_number),
      display,
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
