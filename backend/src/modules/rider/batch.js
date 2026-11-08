'use strict';

/**
 * batch.js — Delivery Batching System
 * ─────────────────────────────────────
 * Groups up to MAX_BATCH_SIZE orders into a single rider trip.
 *
 * Rules:
 *   - Timer starts when the first order is added to a batch.
 *   - Batch dispatches when MAX_BATCH_SIZE orders are collected OR
 *     BATCH_WINDOW_MS elapses — whichever comes first.
 *   - On dispatch, OSRM computes nearest-neighbor route from the restaurant
 *     and sets stop_sequence (1 = nearest, N = farthest).
 *   - Delivery order within the batch is FIFO by default; OSRM optimises
 *     the actual road sequence without changing who gets served first
 *     (every order is still delivered in the same trip).
 *   - Timer is per-rider and per-batch. When a batch dispatches, the next
 *     queued order (if any) starts a fresh batch for that rider.
 *
 * All functions that touch the database accept an open pg `client` and do
 * NOT commit/rollback — that is the caller's responsibility, matching the
 * pattern in assignment.js.
 */

const db = require('../../config/db');

const MAX_BATCH_SIZE    = 5;
const BATCH_WINDOW_MS   = 20 * 60 * 1000; // 20 minutes

// ── Routing provider config ───────────────────────────────────────────────────
// Routing uses OpenRouteService (ORS) for accurate Philippine road data.
// Set ORS_API_KEY in your .env file (get a free key at openrouteservice.org).
// Falls back to OSRM public demo if ORS key is not set.
const ORS_API_KEY = process.env.ORS_API_KEY || '';
const ORS_BASE    = 'https://api.openrouteservice.org';
const OSRM_BASE   = process.env.OSRM_URL || 'https://router.project-osrm.org';

// In-memory timer registry: riderId → { batchId, timer }
const _timers = new Map();

// ── Route optimization ────────────────────────────────────────────────────────

/**
 * computeOptimalOrder
 * ───────────────────
 * Uses OpenRouteService /optimization (Vroom) to find the fastest road-based
 * visiting order for a list of delivery stops starting from the restaurant.
 *
 * ORS /optimization uses actual road travel time (not straight-line distance),
 * so it correctly handles intersections, one-way streets, and local road quirks.
 *
 * Falls back to OSRM /trip (then FIFO) if ORS is unavailable or key is missing.
 *
 * @param {object} origin         { latitude, longitude }
 * @param {Array}  destinations   [{ id, latitude, longitude }, ...]
 * @returns {Promise<number[]>}   indices into `destinations` in optimal visit order
 */
async function computeOptimalOrder(origin, destinations) {
  if (!destinations.length) return [];
  if (destinations.length === 1) return [0];

  // ── Try ORS /optimization first ───────────────────────────────────────────
  if (ORS_API_KEY) {
    try {
      const result = await computeOptimalOrderORS(origin, destinations);
      console.log('[batch] Route optimized via ORS');
      return result;
    } catch (err) {
      console.warn('[batch] ORS optimization failed, trying OSRM:', err.message);
    }
  }

  // ── Fallback: OSRM /trip ───────────────────────────────────────────────────
  try {
    const result = await computeOptimalOrderOSRM(origin, destinations);
    console.log('[batch] Route optimized via OSRM (fallback)');
    return result;
  } catch (err) {
    console.warn('[batch] OSRM trip failed, using FIFO order:', err.message);
    return destinations.map((_, i) => i);
  }
}

/**
 * ORS /optimization (Vroom vehicle routing)
 * Sends a vehicle routing problem: 1 vehicle starting at restaurant,
 * visiting all delivery stops. ORS solves for minimum total travel time.
 */
async function computeOptimalOrderORS(origin, destinations) {
  // Build jobs (delivery stops) — id must be a positive integer
  const jobs = destinations.map((d, i) => ({
    id:       i + 1,
    location: [parseFloat(d.longitude), parseFloat(d.latitude)],
  }));

  // One vehicle starting at the restaurant
  const vehicle = {
    id:    1,
    profile: 'driving-car',
    start: [parseFloat(origin.longitude), parseFloat(origin.latitude)],
  };

  const body = { jobs, vehicles: [vehicle] };

  const response = await fetch(`${ORS_BASE}/optimization`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': ORS_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ORS optimization HTTP ${response.status}: ${text.slice(0, 120)}`);
  }

  const data = await response.json();

  // ORS returns routes[0].steps — each step with type 'job' has a job id
  const steps = data.routes?.[0]?.steps ?? [];
  const jobSteps = steps.filter((s) => s.type === 'job');

  if (!jobSteps.length) throw new Error('ORS returned no job steps');

  // job id is 1-based index into destinations
  return jobSteps.map((s) => s.job - 1);
}

/**
 * OSRM /trip fallback
 */
async function computeOptimalOrderOSRM(origin, destinations) {
  const coords = [
    `${origin.longitude},${origin.latitude}`,
    ...destinations.map((d) => `${d.longitude},${d.latitude}`),
  ].join(';');

  const url = `${OSRM_BASE}/trip/v1/driving/${coords}?source=first&roundtrip=false&geometries=polyline`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);

  const data = await response.json();
  if (data.code !== 'Ok' || !data.waypoints?.length) {
    throw new Error(`OSRM code: ${data.code}`);
  }

  return data.waypoints
    .slice(1)
    .sort((a, b) => a.trips_index !== b.trips_index
      ? a.trips_index - b.trips_index
      : a.waypoint_index - b.waypoint_index
    )
    .map((wp) => wp.waypoint_index - 1);
}

// ── Batch queries ─────────────────────────────────────────────────────────────

/**
 * Find the active 'waiting' batch for this rider, if any.
 * Locked FOR UPDATE so concurrent additions don't race.
 */
async function findWaitingBatch(client, riderId) {
  const { rows } = await client.query(
    `SELECT id, rider_id, status, batch_started_at,
            (SELECT COUNT(*) FROM deliveries WHERE batch_id = delivery_batches.id)::int AS order_count
       FROM delivery_batches
      WHERE rider_id = $1 AND status = 'waiting'
      ORDER BY batch_started_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [riderId]
  );
  return rows[0] || null;
}

/**
 * Create a new 'waiting' batch for the rider.
 */
async function createBatch(client, riderId) {
  const { rows } = await client.query(
    `INSERT INTO delivery_batches (rider_id, status, batch_started_at)
     VALUES ($1, 'waiting', NOW())
     RETURNING id, batch_started_at`,
    [riderId]
  );
  return rows[0];
}

/**
 * Attach a delivery row to a batch.
 */
async function addDeliveryToBatch(client, deliveryId, batchId) {
  await client.query(
    `UPDATE deliveries SET batch_id = $1 WHERE id = $2`,
    [batchId, deliveryId]
  );
}

/**
 * Load all deliveries belonging to a batch with their destination coordinates.
 */
async function getBatchDeliveries(client, batchId) {
  const { rows } = await client.query(
    `SELECT
        d.id               AS delivery_id,
        d.order_id,
        d.assigned_at,
        COALESCE(o.delivery_latitude,  c.latitude)  AS dest_lat,
        COALESCE(o.delivery_longitude, c.longitude) AS dest_lng
       FROM deliveries d
       JOIN orders     o ON o.id = d.order_id
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE d.batch_id = $1
      ORDER BY d.assigned_at ASC`,  /* FIFO base order */
    [batchId]
  );
  return rows;
}

// ── Restaurant origin ─────────────────────────────────────────────────────────

/**
 * Restaurant GPS coordinates from system_settings.
 * Falls back to a sensible Manila default so routing never hard-fails.
 */
async function getRestaurantCoords() {
  try {
    const { rows } = await db.query(
      `SELECT value FROM system_settings WHERE key = 'restaurant_location' LIMIT 1`
    );
    if (rows.length && rows[0].value) {
      const loc = JSON.parse(rows[0].value);
      if (loc.latitude && loc.longitude) return loc;
    }
  } catch (_) { /* fall through */ }
  // Default: Manila city hall area
  return { latitude: 14.5995, longitude: 120.9842 };
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Dispatch a batch:
 *   1. Compute OSRM nearest-neighbor route.
 *   2. Write stop_sequence onto each delivery row.
 *   3. Set batch status → 'in_progress', dispatched_at = NOW().
 *   4. Cancel the in-memory timer for this rider.
 *
 * Returns the dispatched batch row.
 * Caller must commit the transaction after this returns.
 */
async function dispatchBatch(client, batchId) {
  const deliveries = await getBatchDeliveries(client, batchId);
  if (!deliveries.length) return null;

  // Build destination list (only deliveries that have coordinates)
  const withCoords = deliveries.filter(
    (d) => d.dest_lat != null && d.dest_lng != null
  );
  const withoutCoords = deliveries.filter(
    (d) => d.dest_lat == null || d.dest_lng == null
  );

  let orderedIds = [];

  if (withCoords.length > 0) {
    const origin = await getRestaurantCoords();
    const visitOrder = await computeOptimalOrder(
      origin,
      withCoords.map((d) => ({ id: d.delivery_id, latitude: parseFloat(d.dest_lat), longitude: parseFloat(d.dest_lng) }))
    );
    orderedIds = visitOrder.map((i) => withCoords[i].delivery_id);
  }

  // Deliveries without coordinates go last (FIFO among themselves)
  orderedIds = [...orderedIds, ...withoutCoords.map((d) => d.delivery_id)];

  // Write stop_sequence
  for (let seq = 0; seq < orderedIds.length; seq++) {
    await client.query(
      `UPDATE deliveries SET stop_sequence = $1 WHERE id = $2`,
      [seq + 1, orderedIds[seq]]
    );
  }

  // Mark batch dispatched
  const { rows } = await client.query(
    `UPDATE delivery_batches
        SET status = 'in_progress', dispatched_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [batchId]
  );

  return rows[0] || null;
}

// ── Timer management ──────────────────────────────────────────────────────────

/**
 * Schedule the 20-minute auto-dispatch timer for a batch.
 * Clears any existing timer for this rider first.
 *
 * When the timer fires, it opens its own DB client, dispatches,
 * commits, and emits socket events — all outside any parent transaction.
 *
 * @param {number} riderId
 * @param {number} batchId
 * @param {number} remainingMs  time left (allows restoring timers on restart)
 */
function scheduleBatchTimer(riderId, batchId, remainingMs = BATCH_WINDOW_MS) {
  // Clear any existing timer for this rider
  clearBatchTimer(riderId);

  const timer = setTimeout(async () => {
    _timers.delete(riderId);
    try {
      await triggerTimerDispatch(riderId, batchId);
    } catch (err) {
      console.error(`[batch] timer dispatch failed for rider ${riderId}:`, err.message);
    }
  }, Math.max(remainingMs, 0));

  _timers.set(riderId, { batchId, timer });
}

function clearBatchTimer(riderId) {
  const existing = _timers.get(riderId);
  if (existing) {
    clearTimeout(existing.timer);
    _timers.delete(riderId);
  }
}

/**
 * Called by the timer — opens its own transaction, dispatches, emits events.
 */
async function triggerTimerDispatch(riderId, batchId) {
  const socketHub = require('../../sockets');
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Confirm batch is still 'waiting' (might have been manually dispatched)
    const { rows } = await client.query(
      `SELECT id, status FROM delivery_batches WHERE id = $1 FOR UPDATE`,
      [batchId]
    );
    if (!rows.length || rows[0].status !== 'waiting') {
      await client.query('ROLLBACK');
      return;
    }

    const batch = await dispatchBatch(client, batchId);
    if (!batch) { await client.query('ROLLBACK'); return; }

    // Mark all batch deliveries as 'assigned' and rider as 'on_delivery'
    await client.query(
      `UPDATE deliveries SET status = 'assigned', assigned_at = COALESCE(assigned_at, NOW())
        WHERE batch_id = $1 AND status IN ('pending_assignment','assigned')`,
      [batchId]
    );
    await client.query(
      `UPDATE riders SET status = 'on_delivery', updated_at = NOW() WHERE id = $1`,
      [riderId]
    );

    await client.query('COMMIT');

    // Notify rider via socket
    socketHub.emitBatchDispatched({ riderId, batchId: batch.id });
    console.log(`[batch] Timer dispatched batch ${batchId} for rider ${riderId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * addOrderToBatch
 * ───────────────
 * Called by assignment.js when a delivery is assigned to a rider.
 * Finds or creates the rider's waiting batch, adds the delivery,
 * and dispatches immediately if the batch is now full.
 *
 * Returns:
 *   { batch, dispatched: boolean }
 *
 * Caller must commit the transaction.
 * Socket events for dispatch are emitted by the caller AFTER commit.
 */
async function addOrderToBatch(client, riderId, deliveryId) {
  let batch = await findWaitingBatch(client, riderId);
  let isNewBatch = false;

  if (!batch) {
    batch = await createBatch(client, riderId);
    isNewBatch = true;
  }

  await addDeliveryToBatch(client, deliveryId, batch.id);
  const newCount = (batch.order_count || 0) + 1;

  if (newCount >= MAX_BATCH_SIZE) {
    // Batch is full — dispatch immediately
    clearBatchTimer(riderId);
    const dispatched = await dispatchBatch(client, batch.id);

    // Mark all deliveries as 'assigned', rider as 'on_delivery'
    await client.query(
      `UPDATE deliveries SET status = 'assigned', assigned_at = COALESCE(assigned_at, NOW())
        WHERE batch_id = $1 AND status IN ('pending_assignment','assigned')`,
      [batch.id]
    );
    await client.query(
      `UPDATE riders SET status = 'on_delivery', updated_at = NOW() WHERE id = $1`,
      [riderId]
    );

    return { batch: dispatched || batch, dispatched: true };
  }

  // Batch not full yet — ensure timer is running
  if (isNewBatch) {
    // Timer will fire AFTER the caller commits, using setTimeout which is async
    // We schedule it here; if the process restarts, restoreBatchTimers() re-registers
    const remaining = BATCH_WINDOW_MS;
    // Defer scheduling so we don't start the timer inside a transaction that
    // might still roll back
    setImmediate(() => scheduleBatchTimer(riderId, batch.id, remaining));
  }

  return { batch, dispatched: false };
}

/**
 * completeBatchStop
 * ─────────────────
 * Called when a rider marks one delivery as 'delivered'.
 * Checks if all stops in the batch are delivered — if so, closes the batch
 * and returns true (caller should free the rider).
 *
 * Returns: { batchComplete: boolean, nextStop: object|null }
 */
async function completeBatchStop(client, deliveryId) {
  // Find the batch for this delivery
  const { rows: dRows } = await client.query(
    `SELECT batch_id, stop_sequence FROM deliveries WHERE id = $1`,
    [deliveryId]
  );
  if (!dRows.length || !dRows[0].batch_id) {
    // Not in a batch (legacy single delivery)
    return { batchComplete: true, nextStop: null };
  }

  const batchId = dRows[0].batch_id;

  // Count remaining (non-delivered, non-cancelled) stops
  const { rows: remaining } = await client.query(
    `SELECT id, stop_sequence, order_id FROM deliveries
      WHERE batch_id = $1
        AND id != $2
        AND status NOT IN ('delivered','cancelled')
      ORDER BY stop_sequence ASC
      LIMIT 1`,
    [batchId, deliveryId]
  );

  if (remaining.length === 0) {
    // All stops done — close the batch
    await client.query(
      `UPDATE delivery_batches
          SET status = 'completed', completed_at = NOW()
        WHERE id = $1`,
      [batchId]
    );
    return { batchComplete: true, nextStop: null };
  }

  return { batchComplete: false, nextStop: remaining[0] };
}

/**
 * getRiderActiveBatch
 * ───────────────────
 * Returns the full batch details for a rider's current trip:
 * batch metadata + all stops with customer/order info.
 *
 * Used by GET /api/rider/batch/current
 */
async function getRiderActiveBatch(riderId) {
  // Find in_progress batch first, then waiting
  const { rows: batchRows } = await db.query(
    `SELECT id, status, batch_started_at, dispatched_at
       FROM delivery_batches
      WHERE rider_id = $1
        AND status IN ('in_progress','waiting')
      ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END, batch_started_at DESC
      LIMIT 1`,
    [riderId]
  );

  if (!batchRows.length) return null;
  const batch = batchRows[0];

  // Load all stops
  const { rows: stops } = await db.query(
    `SELECT
        d.id               AS delivery_id,
        d.stop_sequence,
        d.status           AS delivery_status,
        d.order_id,
        d.assigned_at,
        d.delivered_at,
        o.total_amount,
        o.special_request,
        o.delivery_latitude,
        o.delivery_longitude,
        c.first_name,
        c.last_name,
        c.mobile_number    AS customer_mobile,
        c.latitude         AS customer_latitude,
        c.longitude        AS customer_longitude,
        COALESCE(o.delivery_address, c.address) AS delivery_address
       FROM deliveries d
       JOIN orders     o ON o.id = d.order_id
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE d.batch_id = $1
      ORDER BY COALESCE(d.stop_sequence, 999), d.assigned_at ASC`,
    [batch.id]
  );

  // Load items for all stops in one query
  const orderIds = stops.map((s) => s.order_id);
  let itemsByOrder = {};
  if (orderIds.length) {
    const { rows: items } = await db.query(
      `SELECT oi.order_id, oi.quantity, oi.unit_price, oi.notes, oi.variant_name, mi.name
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = ANY($1)`,
      [orderIds]
    );
    for (const item of items) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push({
        name:         item.name,
        variant_name: item.variant_name ?? null,
        quantity:     item.quantity,
        unit_price:   parseFloat(item.unit_price),
        notes:        item.notes ?? null,
      });
    }
  }

  // Timer remaining (ms) — only relevant for 'waiting' batches
  const timerEntry = _timers.get(riderId);
  const batchStartedAt = new Date(batch.batch_started_at).getTime();
  const elapsed = Date.now() - batchStartedAt;
  const timerRemainingMs = batch.status === 'waiting'
    ? Math.max(0, BATCH_WINDOW_MS - elapsed)
    : null;

  return {
    batch_id:          batch.id,
    status:            batch.status,
    batch_started_at:  batch.batch_started_at,
    dispatched_at:     batch.dispatched_at,
    timer_remaining_ms: timerRemainingMs,
    stops: stops.map((s) => {
      const destLat = s.delivery_latitude != null
        ? parseFloat(s.delivery_latitude)
        : (s.customer_latitude != null ? parseFloat(s.customer_latitude) : null);
      const destLng = s.delivery_longitude != null
        ? parseFloat(s.delivery_longitude)
        : (s.customer_longitude != null ? parseFloat(s.customer_longitude) : null);

      return {
        delivery_id:          s.delivery_id,
        stop_sequence:        s.stop_sequence,
        delivery_status:      s.delivery_status,
        order_id:             s.order_id,
        order_number:         `ORD-${String(s.order_id).padStart(4, '0')}`,
        customer_name:        `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'N/A',
        customer_contact:     s.customer_mobile ?? null,
        delivery_address:     s.delivery_address ?? '—',
        destination_latitude:  destLat,
        destination_longitude: destLng,
        total_amount:         parseFloat(s.total_amount),
        special_request:      s.special_request ?? null,
        assigned_at:          s.assigned_at,
        delivered_at:         s.delivered_at,
        items:                itemsByOrder[s.order_id] ?? [],
      };
    }),
  };
}

/**
 * restoreBatchTimers
 * ─────────────────
 * Called once on server startup to re-register in-memory timers for any
 * 'waiting' batches that survived a restart.
 */
async function restoreBatchTimers() {
  try {
    const { rows } = await db.query(
      `SELECT id, rider_id,
              EXTRACT(EPOCH FROM (NOW() - batch_started_at)) * 1000 AS elapsed_ms
         FROM delivery_batches
        WHERE status = 'waiting'`
    );

    for (const row of rows) {
      const remaining = Math.max(0, BATCH_WINDOW_MS - parseFloat(row.elapsed_ms));
      scheduleBatchTimer(row.rider_id, row.id, remaining);
      console.log(`[batch] Restored timer for rider ${row.rider_id}, batch ${row.id}, ${Math.round(remaining / 1000)}s remaining`);
    }
  } catch (err) {
    console.error('[batch] restoreBatchTimers failed:', err.message);
  }
}

module.exports = {
  addOrderToBatch,
  completeBatchStop,
  getRiderActiveBatch,
  dispatchBatch,
  clearBatchTimer,
  scheduleBatchTimer,
  restoreBatchTimers,
  BATCH_WINDOW_MS,
  MAX_BATCH_SIZE,
};