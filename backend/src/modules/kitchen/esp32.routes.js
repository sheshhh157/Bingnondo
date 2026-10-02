const express = require('express');
const crypto  = require('crypto');
const db      = require('../../config/db');
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
// The ESP32 polls this every couple of seconds.
//   buzz: true  -> at least one alert is unacknowledged, keep buzzing
//   buzz: false -> stay silent
// Alerts are cleared by either kitchen acknowledge route, and both are idempotent
// so a retried tap still silences the buzzer:
//   PATCH /api/kitchen/orders/:id/acknowledge  (the order card's single button)
//   POST  /api/kitchen/alerts/:id/acknowledge  (ack one alert by id)
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
              'ORD-' || LPAD(ka.order_id::text, 4, '0') AS order_number,
              COUNT(*) OVER ()::int AS pending
         FROM kitchen_alerts ka
        WHERE ka.device_id = $1 AND ka.acknowledged_at IS NULL
        ORDER BY ka.triggered_at ASC
        LIMIT 1`,
      [dev.rows[0].id]
    );

    // The newest alert for this device whether or not it has been acknowledged.
    // Polling alone is racy: the kitchen can press Acknowledge inside one poll
    // interval, so an alert can open and close before the device ever reads
    // buzz:true and the buzzer stays silent. Comparing this stamp against the
    // previous poll lets the firmware see that something rang in between.
    const { rows: latest } = await db.query(
      `SELECT MAX(triggered_at) AS last_alert_at
         FROM kitchen_alerts WHERE device_id = $1`,
      [dev.rows[0].id]
    );

    const payload = rows[0]
      ? { buzz: true, alert_id: rows[0].alert_id, order_number: rows[0].order_number, pending: rows[0].pending }
      : { buzz: false, pending: 0 };

    payload.last_alert_at = latest[0].last_alert_at
      ? new Date(latest[0].last_alert_at).toISOString()
      : null;

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
