'use strict';

const INTERNAL_BRIDGE_URL = process.env.INTERNAL_BRIDGE_URL || 'http://localhost:3000/api/internal';
const INTERNAL_API_KEY     = process.env.INTERNAL_API_KEY;

async function postInternal(path, body) {
  if (!INTERNAL_API_KEY) {
    // If not configured, silently skip — bridge is optional.
    return { ok: false, skipped: 'no_key' };
  }

  try {
    const res = await fetch(`${INTERNAL_BRIDGE_URL}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-internal-key': INTERNAL_API_KEY,
      },
      body: JSON.stringify(body ?? {}),
    });

    if (!res.ok) {
      console.error('[internalBridge] HTTP', res.status, path);
      return { ok: false, status: res.status };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    console.error('[internalBridge] error:', err.message);
    return { ok: false, error: err.message };
  }
}

function notifyOrderStatus(orderId, status, extra = {}) {
  if (!orderId || !status) return;
  return postInternal('/order-status', { orderId, status, extra });
}

function notifyPaymentStatus(orderId, event, extra = {}) {
  if (!orderId || !['approved', 'rejected'].includes(event)) return;
  return postInternal('/payment-status', { orderId, event, reason: extra?.reason ?? null });
}

module.exports = { postInternal, notifyOrderStatus, notifyPaymentStatus };
