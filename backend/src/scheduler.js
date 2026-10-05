const db = require('./config/db');
const socketHub = require('./sockets');

const DEFAULT_TIMEOUT_MIN = 30;

function getTimeoutMinutes() {
  let min = parseInt(process.env.UNPAID_ORDER_TIMEOUT_MIN, 10);
  if (isNaN(min)) return DEFAULT_TIMEOUT_MIN;
  if (min < 5) {
    console.warn(`[scheduler] UNPAID_ORDER_TIMEOUT_MIN ${min} clamped to 5`);
    min = 5;
  }
  return min;
}

async function autoCancelCounterOrders() {
  const timeout = getTimeoutMinutes();
  try {
    const { rows: candidates } = await db.query(
      `SELECT o.id
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT status FROM payments p
         WHERE p.order_id = o.id
         ORDER BY p.paid_at DESC NULLS LAST, p.id DESC LIMIT 1
       ) latest_payment ON TRUE
       WHERE o.status = 'pending'
         AND o.order_type = 'counter'
         AND (latest_payment.status IS NULL OR latest_payment.status <> 'paid')
         AND o.created_at < NOW() - INTERVAL '${timeout} minutes'
       `
    );
    if (candidates.length > 0) {
      console.log(`[auto-cancel] cancelling ${candidates.length} unpaid counter order(s)`);
    }
    for (const { id } of candidates) {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        // Lock the order row to prevent concurrent modifications
        const { rows: orderRows } = await client.query(
          `SELECT status FROM orders WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (orderRows.length === 0) {
          await client.query('ROLLBACK');
          continue;
        }
        const currentStatus = orderRows[0].status;
        if (currentStatus !== 'pending') {
          await client.query('ROLLBACK');
          continue;
        }
        // Abort if a paid payment exists
        const { rows: paidCheck } = await client.query(
          `SELECT 1 FROM payments WHERE order_id = $1 AND status = 'paid' LIMIT 1`,
          [id]
        );
        if (paidCheck.length > 0) {
          await client.query('ROLLBACK');
          continue;
        }
        const { rows: updated } = await client.query(
          `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id`,
          [id]
        );
        if (updated.length === 0) {
          await client.query('ROLLBACK');
          continue;
        }
        await client.query(
          `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'cancelled', NULL)`,
          [id]
        );
        const { rows: closedAlerts } = await client.query(
          `UPDATE kitchen_alerts
            SET acknowledged_at = NOW()
          WHERE order_id = $1 AND acknowledged_at IS NULL
          RETURNING id`,
          [id]
        );
        try {
          await client.query('SAVEPOINT sp_audit');
          await client.query(
            `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
             VALUES (NULL, 'order_auto_cancelled', 'order', $1, $2)`,
            [id, JSON.stringify({ status: 'cancelled' })]
          );
          await client.query('RELEASE SAVEPOINT sp_audit');
        } catch (insertErr) {
          console.error('[audit_log] insert failed during auto-cancel:', insertErr);
          try { await client.query('ROLLBACK TO SAVEPOINT sp_audit'); } catch {}
        }
        await client.query('COMMIT');
        socketHub.emitOrderStatus({ orderId: id, orderNumber: `ORD-${String(id).padStart(4, '0')}`, status: 'cancelled' });
        for (const a of closedAlerts) {
          socketHub.emitKitchenAlertAck({ alertId: a.id });
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[auto-cancel]', err);
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error('[auto-cancel] run failed:', err);
  }
}

function startAutoCancelJob() {
  let running = false;
  const interval = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await autoCancelCounterOrders();
    } catch (err) {
      console.error('[auto-cancel] interval run failed:', err);
    } finally {
      running = false;
    }
  }, 60 * 1000);
  interval.unref();
}

module.exports = { startAutoCancelJob, autoCancelCounterOrders, getTimeoutMinutes };
