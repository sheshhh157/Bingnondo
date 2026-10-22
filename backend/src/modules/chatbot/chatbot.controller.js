/**
 * chatbot.controller.js
 * ─────────────────────
 * The app's menu assistant.
 *
 *   POST /api/chatbot/message   { message } → { reply }
 *   GET  /api/chatbot/history               → { conversation_id, messages }
 *
 * The bot answers from the live menu table, so it never quotes a stale price.
 * It is a rule-based assistant, not an LLM: it recognises the menu questions
 * people actually ask (what do you have, how much is X, is X available, do
 * you deliver) and falls back to pointing the customer at the menu screen.
 *
 * The conversation is stored in chatbot_conversations / chatbot_messages so
 * the app can restore the transcript on a cold start.
 */

const db = require('../../config/db');

/** The customer's most recent conversation, created on demand. */
async function getOrCreateConversation(customerId, client = db) {
  const conn = client || db;

  const { rows } = await conn.query(
    `SELECT id FROM chatbot_conversations
      WHERE customer_id = $1
      ORDER BY started_at DESC, id DESC
      LIMIT 1`,
    [customerId]
  );
  if (rows.length > 0) return rows[0].id;

  const { rows: created } = await conn.query(
    `INSERT INTO chatbot_conversations (customer_id) VALUES ($1) RETURNING id`,
    [customerId]
  );
  return created[0].id;
}

/** Lowercase, punctuation-free text for keyword matching. */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Answer a question using the live menu.
 *
 * @param {string} rawMessage
 * @returns {Promise<string>}
 */
async function answer(rawMessage) {
  const message = normalize(rawMessage);
  if (!message) {
    return 'Hi! Ask me anything about our menu, prices or availability.';
  }

  // ── Greetings ─────────────────────────────────────────────────────────────
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|kumusta|hello there)\b/.test(message)) {
    return 'Hi there! I can help with our menu, prices and availability. What would you like to know?';
  }

  // ── Delivery / hours ──────────────────────────────────────────────────────
  if (/\b(deliver|delivery|shipping|bring|courier|open|close|hours|closing|opening)\b/.test(message)) {
    return 'We are open daily from 7:00 AM to 10:00 PM. Orders placed in the app are delivered by our own riders — add your delivery pin at checkout and we will bring it to you.';
  }

  // ── Payment ───────────────────────────────────────────────────────────────
  if (/\b(pay|payment|gcash|cash|change|refund)\b/.test(message)) {
    return 'You can pay with GCash (upload your receipt at checkout) or Cash on Delivery. No other payment methods are available right now.';
  }

  // ── Item-specific questions: price or availability ───────────────────────
  // Look for a menu item whose name appears in the message.
  const { rows: items } = await db.query(
    `SELECT id, name, description, price::float, is_available
       FROM menu_items
      WHERE is_deleted = FALSE
        AND LOWER(name) = LOWER($1)`,
    [message]
  );

  let item = items[0];

  if (!item) {
    // Fall back to a partial match: "how much is the katsu sandwich?"
    const { rows: partial } = await db.query(
      `SELECT id, name, description, price::float, is_available
         FROM menu_items
        WHERE is_deleted = FALSE
          AND LOWER(name) <> ''
          AND $1 LIKE '%' || LOWER(name) || '%'
        LIMIT 1`,
      [message]
    );
    item = partial[0];
  }

  if (item) {
    if (!item.is_available) {
      return `${item.name} is currently unavailable. Please check back later — the app's menu shows what is in stock right now.`;
    }
    const price = `₱${Number(item.price).toFixed(2)}`;
    if (/\b(how much|price|cost|how many)\b/.test(message)) {
      return `${item.name} is ${price}.${item.description ? ` ${item.description}` : ''}`;
    }
    if (/\b(available|in stock|stock|have)\b/.test(message)) {
      return `Yes, ${item.name} is available right now (${price}).`;
    }
    return `${item.name} is ${price} and is available right now.${item.description ? ` ${item.description}` : ''}`;
  }

  // ── "What do you have?" — list a few highlights ──────────────────────────
  if (/\b(what|menu|recommend|suggest|have you|items?|dishes|food|drinks?)\b/.test(message)) {
    const { rows: highlights } = await db.query(
      `SELECT name, price::float
         FROM menu_items
        WHERE is_deleted = FALSE AND is_available = TRUE
        ORDER BY display_order ASC, id ASC
        LIMIT 5`
    );

    if (highlights.length === 0) {
      return 'Our menu is being updated right now. Please check the menu screen in the app for the latest items.';
    }

    const list = highlights
      .map((row) => `${row.name} (₱${Number(row.price).toFixed(2)})`)
      .join(', ');
    return `Here are a few of our favourites: ${list}. Open the Menu tab to see everything we are serving today.`;
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return 'I can help with our menu, prices, availability, opening hours and payment options. Try asking "how much is the Katsu Sando" or "what do you have today?"';
}

/** Store one message (customer or bot) in the conversation. */
async function storeMessage(conversationId, sender, content) {
  const { rows } = await db.query(
    `INSERT INTO chatbot_messages (conversation_id, sender, content)
     VALUES ($1, $2, $3)
     RETURNING id, conversation_id, sender, content, sent_at`,
    [conversationId, sender, content]
  );
  return rows[0];
}

// ─── POST /api/chatbot/message ──────────────────────────────────────────────
async function sendMessage(req, res, next) {
  try {
    const customerId = req.user.sub;
    const { message } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: 'Type a question first.' });
    }

    const conversationId = await getOrCreateConversation(customerId);
    await storeMessage(conversationId, 'customer', String(message).trim());

    const reply = await answer(String(message).trim());
    await storeMessage(conversationId, 'bot', reply);

    return res.status(200).json({ reply, conversation_id: conversationId });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/chatbot/history ───────────────────────────────────────────────
async function getHistory(req, res, next) {
  try {
    const customerId = req.user.sub;

    const { rows: conversations } = await db.query(
      `SELECT id FROM chatbot_conversations
        WHERE customer_id = $1
        ORDER BY started_at DESC, id DESC
        LIMIT 1`,
      [customerId]
    );

    if (conversations.length === 0) {
      return res.status(404).json({ message: 'No conversation yet.' });
    }

    const conversationId = conversations[0].id;

    const { rows: messages } = await db.query(
      `SELECT id, conversation_id, sender, content, sent_at
         FROM chatbot_messages
        WHERE conversation_id = $1
        ORDER BY sent_at ASC, id ASC`,
      [conversationId]
    );

    return res.status(200).json({
      conversation_id: conversationId,
      messages,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendMessage, getHistory, __internal: { normalize, getOrCreateConversation } };
