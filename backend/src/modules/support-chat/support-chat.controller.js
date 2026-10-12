/**
 * support-chat.controller.js
 * ──────────────────────────
 * Customer–Staff Support Chat backend.
 *
 * Business rules (from flow doc §1.7 / §4.5 / §8.3):
 *   - ONE thread per customer (support_chats.customer_id is UNIQUE)
 *   - Thread unlocks when customer has ≥1 active order
 *     (active = NOT IN ('completed', 'cancelled'))
 *   - Thread auto-locks when ALL of customer's orders reach completed/cancelled
 *   - Messages can optionally tag a related_order_id for staff context
 *   - Staff see all unlocked threads; locked threads listed last
 *
 * Routes:
 *   Customer:
 *     GET  /api/support-chat            → getOrCreateThread
 *     POST /api/support-chat/message    → sendCustomerMessage
 *
 *   Staff (roles: staff, cashier, owner, admin):
 *     GET  /api/support-chat/threads    → getAllThreads
 *     POST /api/support-chat/reply      → sendStaffReply
 *
 * Socket.io events emitted:
 *   support_chat:message   → room `customer:<customerId>` + room `staff`
 *     payload: { chatId, messageId, senderType, content, sentAt, relatedOrderId }
 *
 * Auth shape (req.user from auth.middleware):
 *   { sub, type: 'customer'|'staff', role }
 */

const db        = require('../../config/db');
const socketHub = require('../../sockets');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INACTIVE_STATUSES = ['completed', 'cancelled'];

/**
 * Check whether a customer currently has at least one active order.
 * Used to enforce the lock/unlock rule.
 */
async function customerHasActiveOrder(customerId, client) {
  const conn = client || db;
  const { rows } = await conn.query(
    `SELECT 1
       FROM orders
      WHERE customer_id = $1
        AND status NOT IN ('completed', 'cancelled')
      LIMIT 1`,
    [customerId]
  );
  return rows.length > 0;
}

/**
 * Fetch (or create) the support_chats row for this customer.
 * Returns the chat row — does NOT unlock automatically here;
 * unlock happens on order placement (called from orders.controller).
 */
async function getOrCreateChatRow(customerId, client) {
  const conn = client || db;

  // Try to fetch existing
  const existing = await conn.query(
    'SELECT * FROM support_chats WHERE customer_id = $1',
    [customerId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  // Create locked by default — unlocked when order is placed
  const inserted = await conn.query(
    `INSERT INTO support_chats (customer_id, status, opened_at)
     VALUES ($1, 'locked', NULL)
     RETURNING *`,
    [customerId]
  );
  return inserted.rows[0];
}

// ─── Customer: GET /api/support-chat ─────────────────────────────────────────
/**
 * Returns the customer's thread status + messages.
 * If the thread is locked, returns status with an explanatory UI message.
 * Creates the row on first access (locked) so future unlocks work smoothly.
 */
async function getOrCreateThread(req, res, next) {
  try {
    const customerId = req.user.sub;

    const chat = await getOrCreateChatRow(customerId);

    if (chat.status === 'locked') {
      return res.json({
        data: {
          chat_id:  chat.id,
          status:   'locked',
          messages: [],
          ui_message:
            'No active order. Ask our chatbot for menu questions, or place an order to chat with staff.',
        },
      });
    }

    // Fetch messages with sender display name
    const { rows: messages } = await db.query(
      `SELECT
         scm.id,
         scm.sender_type,
         scm.sender_id,
         scm.content,
         scm.related_order_id,
         scm.sent_at,
         CASE
           WHEN scm.sender_type = 'customer'
             THEN CONCAT(c.first_name, ' ', c.last_name)
           ELSE sa.full_name
         END AS sender_name
       FROM support_chat_messages scm
       LEFT JOIN customers      c  ON scm.sender_type = 'customer' AND scm.sender_id = c.id
       LEFT JOIN staff_accounts sa ON scm.sender_type = 'staff'    AND scm.sender_id = sa.id
       WHERE scm.chat_id = $1
       ORDER BY scm.sent_at ASC`,
      [chat.id]
    );

    // Attach the customer's active orders as context (handy for the UI)
    const { rows: activeOrders } = await db.query(
      `SELECT id, status, total_amount, created_at
         FROM orders
        WHERE customer_id = $1
          AND status NOT IN ('completed', 'cancelled')
        ORDER BY created_at DESC`,
      [customerId]
    );

    return res.json({
      data: {
        chat_id:       chat.id,
        status:        chat.status,
        opened_at:     chat.opened_at,
        messages,
        active_orders: activeOrders,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Customer: POST /api/support-chat/message ────────────────────────────────
/**
 * Body: { content: string, related_order_id?: number }
 *
 * Gate: thread must be unlocked (i.e. customer has an active order).
 * We re-check on every send (not just on GET) to prevent a race
 * where the last order completes while the customer is typing.
 */
async function sendCustomerMessage(req, res, next) {
  try {
    const customerId     = req.user.sub;
    const { content, related_order_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Message content is required.' });
    }

    // 1. Fetch chat row (creates it locked if this is their very first visit)
    const chat = await getOrCreateChatRow(customerId);

    // 2. Enforce lock gate
    if (chat.status === 'locked') {
      return res.status(403).json({
        message:
          'You must have an active order to contact staff. Place an order to start chatting.',
      });
    }

    // 3. Validate related_order_id belongs to this customer (if provided)
    if (related_order_id) {
      const orderCheck = await db.query(
        'SELECT 1 FROM orders WHERE id = $1 AND customer_id = $2',
        [related_order_id, customerId]
      );
      if (orderCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Invalid related order.' });
      }
    }

    // 4. Insert message
    const { rows } = await db.query(
      `INSERT INTO support_chat_messages
         (chat_id, sender_type, sender_id, content, related_order_id)
       VALUES ($1, 'customer', $2, $3, $4)
       RETURNING *`,
      [chat.id, customerId, content.trim(), related_order_id || null]
    );
    const message = rows[0];

    // 5. Emit real-time event to staff room + customer's own room
    emitSupportChatMessage({
      chatId:         chat.id,
      customerId,
      messageId:      message.id,
      senderType:     'customer',
      content:        message.content,
      sentAt:         message.sent_at,
      relatedOrderId: message.related_order_id,
    });

    return res.status(201).json({ data: message });
  } catch (err) {
    next(err);
  }
}

// ─── Staff: GET /api/support-chat/threads ────────────────────────────────────
/**
 * Returns all threads — unlocked first, then locked — with:
 *   - last message preview
 *   - unread count (messages since staff last replied — simple heuristic)
 *   - customer info
 *   - customer's active orders (sidebar context)
 *
 * Query params:
 *   ?status=unlocked|locked|all   (default: all)
 *   ?customer_id=<n>              (filter to a single customer's thread)
 */
async function getAllThreads(req, res, next) {
  try {
    const { status: filterStatus, customer_id: filterCustomerId } = req.query;

    const conditions = [];
    const params     = [];

    if (filterStatus && filterStatus !== 'all') {
      params.push(filterStatus);
      conditions.push(`sc.status = $${params.length}`);
    }

    if (filterCustomerId) {
      params.push(Number(filterCustomerId));
      conditions.push(`sc.customer_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: threads } = await db.query(
      `SELECT
         sc.id                AS chat_id,
         sc.customer_id,
         sc.status,
         sc.opened_at,
         sc.locked_at,
         c.first_name,
         c.last_name,
         c.mobile_number,
         -- Last message preview
         lm.content          AS last_message,
         lm.sender_type      AS last_message_sender,
         lm.sent_at          AS last_message_at,
         -- Unread count: messages from customer after last staff reply
         COALESCE(unread.cnt, 0) AS unread_count
       FROM support_chats sc
       JOIN customers c ON c.id = sc.customer_id
       -- Last message (any sender)
       LEFT JOIN LATERAL (
         SELECT content, sender_type, sent_at
           FROM support_chat_messages
          WHERE chat_id = sc.id
          ORDER BY sent_at DESC
          LIMIT 1
       ) lm ON TRUE
       -- Unread = customer messages after the most recent staff message
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS cnt
           FROM support_chat_messages incoming
          WHERE incoming.chat_id    = sc.id
            AND incoming.sender_type = 'customer'
            AND incoming.sent_at    > COALESCE(
                  (SELECT sent_at
                     FROM support_chat_messages staff_reply
                    WHERE staff_reply.chat_id     = sc.id
                      AND staff_reply.sender_type = 'staff'
                    ORDER BY sent_at DESC
                    LIMIT 1),
                  '1970-01-01'::timestamp
                )
       ) unread ON TRUE
       ${whereClause}
       ORDER BY
         -- Unlocked threads first, then locked
         CASE sc.status WHEN 'unlocked' THEN 0 ELSE 1 END,
         -- Within each group: most recently active first
         COALESCE(lm.sent_at, sc.opened_at) DESC NULLS LAST`,
      params
    );

    // Enrich each thread with active orders for the staff sidebar
    const enriched = await Promise.all(
      threads.map(async (thread) => {
        const { rows: orders } = await db.query(
          `SELECT id, status, total_amount, created_at
             FROM orders
            WHERE customer_id = $1
              AND status NOT IN ('completed', 'cancelled')
            ORDER BY created_at DESC`,
          [thread.customer_id]
        );
        return { ...thread, active_orders: orders };
      })
    );

    return res.json({ data: enriched });
  } catch (err) {
    next(err);
  }
}

// ─── Staff: GET /api/support-chat/threads/:chatId/messages ───────────────────
/**
 * Returns the full message history for a specific thread.
 * Staff open the thread to see the conversation.
 */
async function getThreadMessages(req, res, next) {
  try {
    const chatId = Number(req.params.chatId);

    // Verify the thread exists
    const { rows: chatRows } = await db.query(
      'SELECT * FROM support_chats WHERE id = $1',
      [chatId]
    );
    if (chatRows.length === 0) {
      return res.status(404).json({ message: 'Thread not found.' });
    }
    const chat = chatRows[0];

    const { rows: messages } = await db.query(
      `SELECT
         scm.id,
         scm.sender_type,
         scm.sender_id,
         scm.content,
         scm.related_order_id,
         scm.sent_at,
         CASE
           WHEN scm.sender_type = 'customer'
             THEN CONCAT(c.first_name, ' ', c.last_name)
           ELSE sa.full_name
         END AS sender_name
       FROM support_chat_messages scm
       LEFT JOIN customers      c  ON scm.sender_type = 'customer' AND scm.sender_id = c.id
       LEFT JOIN staff_accounts sa ON scm.sender_type = 'staff'    AND scm.sender_id = sa.id
       WHERE scm.chat_id = $1
       ORDER BY scm.sent_at ASC`,
      [chatId]
    );

    // Include active orders for staff reference panel
    const { rows: activeOrders } = await db.query(
      `SELECT id, status, total_amount, created_at
         FROM orders
        WHERE customer_id = $1
          AND status NOT IN ('completed', 'cancelled')
        ORDER BY created_at DESC`,
      [chat.customer_id]
    );

    return res.json({
      data: {
        chat_id:       chat.id,
        customer_id:   chat.customer_id,
        status:        chat.status,
        messages,
        active_orders: activeOrders,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Staff: POST /api/support-chat/reply ─────────────────────────────────────
/**
 * Body: { chat_id: number, content: string, related_order_id?: number }
 *
 * Staff can reply even to locked threads (edge case: staff replies while
 * order is completing). The UI should surface a warning in that case.
 */
async function sendStaffReply(req, res, next) {
  try {
    const staffId = req.user.sub;
    const { chat_id, content, related_order_id } = req.body;

    if (!chat_id)        return res.status(400).json({ message: 'chat_id is required.' });
    if (!content?.trim()) return res.status(400).json({ message: 'Message content is required.' });

    // Verify thread exists and get customer_id for socket targeting
    const { rows: chatRows } = await db.query(
      'SELECT * FROM support_chats WHERE id = $1',
      [chat_id]
    );
    if (chatRows.length === 0) {
      return res.status(404).json({ message: 'Support chat thread not found.' });
    }
    const chat = chatRows[0];

    // Validate related_order_id belongs to this chat's customer (if provided)
    if (related_order_id) {
      const orderCheck = await db.query(
        'SELECT 1 FROM orders WHERE id = $1 AND customer_id = $2',
        [related_order_id, chat.customer_id]
      );
      if (orderCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Invalid related order.' });
      }
    }

    const { rows } = await db.query(
      `INSERT INTO support_chat_messages
         (chat_id, sender_type, sender_id, content, related_order_id)
       VALUES ($1, 'staff', $2, $3, $4)
       RETURNING *`,
      [chat_id, staffId, content.trim(), related_order_id || null]
    );
    const message = rows[0];

    // Emit to the customer's personal room + staff room
    emitSupportChatMessage({
      chatId:         chat.id,
      customerId:     chat.customer_id,
      messageId:      message.id,
      senderType:     'staff',
      content:        message.content,
      sentAt:         message.sent_at,
      relatedOrderId: message.related_order_id,
    });

    // Create a notification for the customer
    await db.query(
      `INSERT INTO notifications (type, reference_id, is_read)
       VALUES ('support_chat_reply', $1, FALSE)`,
      [message.id]
    );

    return res.status(201).json({ data: message });
  } catch (err) {
    next(err);
  }
}

// ─── Internal: unlock thread (called from orders.controller on order place) ──
/**
 * Called when a new order is placed by a customer.
 * If the customer's thread is locked, unlocks it.
 * Exported so orders.controller can call it after order creation.
 */
async function unlockThreadForCustomer(customerId, client) {
  const conn = client || db;

  // Upsert: if no row yet, create unlocked; if locked, flip to unlocked
  await conn.query(
    `INSERT INTO support_chats (customer_id, status, opened_at)
     VALUES ($1, 'unlocked', NOW())
     ON CONFLICT (customer_id) DO UPDATE
       SET status    = 'unlocked',
           opened_at = COALESCE(support_chats.opened_at, NOW()),
           locked_at = NULL
     WHERE support_chats.status = 'locked'`,
    [customerId]
  );
}

// ─── Internal: lock thread (called after every order status change) ───────────
/**
 * Called after an order reaches completed/cancelled.
 * Checks if the customer has any remaining active orders;
 * if none, locks the thread.
 * Exported so orders.controller can call it.
 */
async function maybeLockThreadForCustomer(customerId, client) {
  const conn = client || db;

  const hasActive = await customerHasActiveOrder(customerId, conn);
  if (hasActive) return; // still has active orders — keep unlocked

  await conn.query(
    `UPDATE support_chats
        SET status    = 'locked',
            locked_at = NOW()
      WHERE customer_id = $1
        AND status      = 'unlocked'`,
    [customerId]
  );
}

// ─── Socket.io emitter ────────────────────────────────────────────────────────
/**
 * Emit a new support chat message to:
 *   - room `customer:<customerId>` → so the mobile app picks it up
 *   - room `staff`                 → so the staff inbox updates in real-time
 *
 * The `_io` instance is accessed through the socketHub module (same pattern
 * used by orders.controller / kitchen.controller via emitXxx helpers).
 * We add our own emitter here since socketHub doesn't export one for chat yet.
 */
function emitSupportChatMessage({ chatId, customerId, messageId, senderType, content, sentAt, relatedOrderId }) {
  // Access _io through a thin wrapper — add emitSupportChatMessage to sockets/index.js
  // (see the patch in support-chat.socket-patch.js)
  if (socketHub._emitSupportChatMessage) {
    socketHub._emitSupportChatMessage({ chatId, customerId, messageId, senderType, content, sentAt, relatedOrderId });
  }
}

module.exports = {
  // Route handlers
  getOrCreateThread,
  sendCustomerMessage,
  getAllThreads,
  getThreadMessages,
  sendStaffReply,
  // Internal helpers (called by orders.controller)
  unlockThreadForCustomer,
  maybeLockThreadForCustomer,
};