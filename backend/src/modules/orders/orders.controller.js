const db = require('../../config/db');
const socketHub = require('../../sockets');

// ─── Helper: format order number ─────────────────────────────────────────────
function orderNumber(id) {
  return `ORD-${String(id).padStart(4, '0')}`;
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────
// Cashier creates a counter order.
// Body: { items: [{ menu_item_id, quantity, notes? }], special_request? }
// Status is immediately 'confirmed' — kitchen gets the socket event right away.
// A 'pending' payment row is created; cashier confirms payment via POST /api/payments.
async function createOrder(req, res, next) {
  const client = await db.getClient();
  try {
    const { items, special_request } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item.' });
    }

    // 1. Validate all items exist and are available, compute total
    const menuIds = items.map((i) => Number(i.menu_item_id));
    const menuRes = await db.query(
      'SELECT id, name, price, is_available FROM menu_items WHERE id = ANY($1)',
      [menuIds]
    );
    const menuMap = Object.fromEntries(menuRes.rows.map((r) => [r.id, r]));

    let totalAmount = 0;
    const validated = [];

    for (const item of items) {
      const mi = menuMap[Number(item.menu_item_id)];
      if (!mi) {
        return res.status(400).json({ message: `Menu item ${item.menu_item_id} not found.` });
      }
      if (!mi.is_available) {
        return res.status(400).json({ message: `"${mi.name}" is currently unavailable.` });
      }
      const qty = Number(item.quantity);
      if (!qty || qty < 1) {
        return res.status(400).json({ message: 'Quantity must be at least 1.' });
      }
      totalAmount += parseFloat(mi.price) * qty;
      validated.push({ menu_item_id: mi.id, name: mi.name, unit_price: parseFloat(mi.price), quantity: qty, notes: item.notes || null });
    }

    await client.query('BEGIN');

    // 2. Insert order — status 'confirmed' immediately for counter orders
    const orderRes = await client.query(
      `INSERT INTO orders
         (order_type, cashier_id, status, order_channel, total_amount, special_request)
       VALUES ('counter', $1, 'confirmed', 'web_counter', $2, $3)
       RETURNING *`,
      [req.user.sub, totalAmount, special_request || null]
    );
    const order = orderRes.rows[0];
    order.order_number = orderNumber(order.id);

    // 3. Insert order items
    for (const item of validated) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.menu_item_id, item.quantity, item.unit_price, item.notes]
      );
    }

    // 4. Log status in history
    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'confirmed', $2)`,
      [order.id, req.user.sub]
    );

    // 5. Create pending payment record (method updated when cashier confirms payment)
    await client.query(
      `INSERT INTO payments (order_id, method, amount, status) VALUES ($1, 'cash', $2, 'pending')`,
      [order.id, totalAmount]
    );

    await client.query('COMMIT');

    // 6. Attach items to response and emit to kitchen
    order.items = validated;
    order.total_amount = parseFloat(order.total_amount);

    socketHub.emitNewOrder(order);

    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── GET /api/orders ──────────────────────────────────────────────────────────
// Cashier: their own counter orders (filtered by range).
// Kitchen/Staff/Owner: all orders.
async function getOrders(req, res, next) {
  try {
    const { range = 'today', status } = req.query;
    const role = req.user.role;

    const conditions = ['1=1'];
    const params = [];
    let p = 1;

    // Cashiers only see their own orders
    if (role === 'cashier') {
      conditions.push(`o.cashier_id = $${p++}`);
      params.push(req.user.sub);
    }

    // Date range
    if (range === 'today') {
      conditions.push(`o.created_at >= CURRENT_DATE`);
    } else if (range === 'week') {
      conditions.push(`o.created_at >= CURRENT_DATE - INTERVAL '7 days'`);
    }

    // Status filter (comma-separated)
    if (status) {
      conditions.push(`o.status = ANY($${p++})`);
      params.push(status.split(',').map((s) => s.trim()));
    }

    const where = conditions.join(' AND ');

    const { rows } = await db.query(
      `SELECT
         o.id,
         'ORD-' || LPAD(o.id::text, 4, '0') AS order_number,
         o.order_type,
         o.order_channel,
         o.status,
         o.total_amount::float,
         o.special_request,
         o.created_at,
         o.cashier_id,
         sa.full_name AS cashier_name,
         p.method     AS payment_method,
         p.status     AS payment_status,
         p.paid_at,
         json_agg(
           json_build_object(
             'id',           oi.id,
             'menu_item_id', oi.menu_item_id,
             'name',         mi.name,
             'quantity',     oi.quantity,
             'unit_price',   oi.unit_price::float,
             'notes',        oi.notes
           ) ORDER BY oi.id
         ) AS items
       FROM orders o
       LEFT JOIN staff_accounts sa ON sa.id = o.cashier_id
       LEFT JOIN payments p ON p.order_id = o.id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE ${where}
       GROUP BY o.id, sa.full_name, p.method, p.status, p.paid_at
       ORDER BY o.created_at DESC
       LIMIT 200`,
      params
    );

    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────
async function getOrderById(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT
         o.id,
         'ORD-' || LPAD(o.id::text, 4, '0') AS order_number,
         o.order_type, o.order_channel, o.status,
         o.total_amount::float, o.special_request, o.created_at,
         o.cashier_id, sa.full_name AS cashier_name,
         p.method AS payment_method, p.status AS payment_status, p.paid_at,
         json_agg(
           json_build_object(
             'id', oi.id, 'menu_item_id', oi.menu_item_id,
             'name', mi.name, 'quantity', oi.quantity,
             'unit_price', oi.unit_price::float, 'notes', oi.notes
           ) ORDER BY oi.id
         ) AS items
       FROM orders o
       LEFT JOIN staff_accounts sa ON sa.id = o.cashier_id
       LEFT JOIN payments p ON p.order_id = o.id
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.id = $1
       GROUP BY o.id, sa.full_name, p.method, p.status, p.paid_at`,
      [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ message: 'Order not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/orders/:id/status ────────────────────────────────────────────
async function updateOrderStatus(req, res, next) {
  const client = await db.getClient();
  try {
    const { status } = req.body;
    const VALID = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
    if (!VALID.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${VALID.join(', ')}` });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, $2, $3)`,
      [req.params.id, status, req.user.sub]
    );

    await client.query('COMMIT');

    const order = rows[0];
    order.order_number = orderNumber(order.id);
    order.total_amount = parseFloat(order.total_amount);

    // Emit status update to all relevant rooms
    socketHub.emitOrderStatus({ orderId: order.id, orderNumber: order.order_number, status });
    if (status === 'ready') {
      socketHub.emitOrderReady({ orderId: order.id, orderNumber: order.order_number });
    }

    res.json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── POST /api/orders/:id/cancel ─────────────────────────────────────────────
async function cancelOrder(req, res, next) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, status FROM orders WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }

    const cancellable = ['pending', 'confirmed'];
    if (!cancellable.includes(rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `Cannot cancel an order with status "${rows[0].status}".` });
    }

    await client.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'cancelled', $2)`,
      [req.params.id, req.user.sub]
    );

    await client.query('COMMIT');

    socketHub.emitOrderStatus({ orderId: rows[0].id, orderNumber: orderNumber(rows[0].id), status: 'cancelled' });

    res.json({ message: 'Order cancelled.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { createOrder, getOrders, getOrderById, updateOrderStatus, cancelOrder };