/**
 * Tests for the customer (mobile app) API surface.
 *
 * Covered:
 *
 *   1. Registration creates an awaiting_verification customer and mails a code;
 *      an unverified retry overwrites the password, a verified duplicate is 409.
 *   2. OTP verification flips the account to active and returns tokens; a
 *      wrong code is rejected without consuming the real one.
 *   3. Login works with the email and with the mobile number; an unverified
 *      account cannot sign in.
 *   4. GET /api/auth/me returns the customer shape.
 *   5. The profile round-trips and flips profile_completed.
 *   6. Change-password replaces the password and the old one stops working.
 *   7. Placing an order: server-side pricing, the app's field names, a unique
 *      order number, a payment row, a delivery row and a customer notification.
 *   8. Order reads are owner-only — another customer cannot see the order.
 *   9. Cancel + timeline + status endpoints.
 *  10. The support chat is locked until an order exists, then unlocked.
 *  11. The chatbot answers.
 *  12. Sockets: a customer may join its own order room but not a foreign one,
 *      and order_status_update reaches the customer's own room.
 *
 * The mailer is stubbed via require.cache so tests never touch the network.
 * Database-backed tests skip when no database is reachable and remove every
 * row they create.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

// ─── Mailer stub (installed before the routers are required) ─────────────────

const mailerPath = require.resolve('../src/utils/mailer');
const sentEmails = [];

require.cache[mailerPath] = {
  id: mailerPath,
  filename: mailerPath,
  loaded: true,
  exports: {
    sendEmail: async ({ to, subject, html }) => {
      sentEmails.push({ to, subject, html });
      return { messageId: `stub-${sentEmails.length}` };
    },
  },
};

let db = null;
try {
  db = require('../src/config/db');
} catch {
  db = null;
}

const canQuery = async () => {
  if (!db) return false;
  try {
    await db.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

// ─── HTTP + Socket harness (mirrors server.js) ───────────────────────────────

let harness = null;
const openClients = [];

/**
 * Boots the real routers on an ephemeral port with a real Socket.IO server,
 * so the socket protocol is exercised end to end.
 */
async function startHarness() {
  const express = require('express');
  const http = require('http');
  const { Server } = require('socket.io');

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });

  const menuCtrl = require('../src/modules/menu/menu.controller');
  const socketHub = require('../src/sockets');
  menuCtrl.setIO(io);
  socketHub.setIO(io);

  app.use(express.json());
  app.use('/api/auth', require('../src/modules/auth/auth.routes'));
  app.use('/api/auth/customer', require('../src/modules/customer/customer.routes'));
  app.use('/api/customer', require('../src/modules/customer/customer-api.routes'));
  app.use('/api/notifications', require('../src/modules/customer/customer-notification.routes'));
  app.use('/api/menu', require('../src/modules/menu/menu.routes'));
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/support-chat', require('../src/modules/support-chat/support-chat.routes'));
  app.use('/api/chatbot', require('../src/modules/chatbot/chatbot.routes'));

  await new Promise((resolve) => server.listen(0, resolve));
  return { app, server, io, port: server.address().port };
}

async function ensureHarness() {
  if (!harness) harness = await startHarness();
  return harness;
}

async function call(method, path, { body, token } = {}) {
  const { port } = await ensureHarness();
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let seq = 0;
const uniqueEmail = () => `__cust_test_${Date.now()}_${seq++}@example.test`;
const uniqueMobile = () => `09${String(Date.now()).slice(-9)}`.slice(0, 11);

const codeFromEmail = (email) => {
  const mail = sentEmails.filter((m) => m.to === email).pop();
  assert.ok(mail, `no email captured for ${email}`);
  const match = mail.html.match(/(\d{6})<\/span>/);
  assert.ok(match, 'email body should contain a 6-digit code in its span');
  return match[1];
};

const password = 'customerpass123';

/**
 * Registers + verifies a customer and returns { id, email, mobile, token }.
 */
async function makeVerifiedCustomer({ mobile } = {}) {
  const email = uniqueEmail();
  const mob = mobile || uniqueMobile();

  const reg = await call('POST', '/api/auth/customer/register', {
    body: { email, password },
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));

  const code = codeFromEmail(email);
  const ver = await call('POST', '/api/auth/customer/verify-otp', {
    body: { email, otp: code, purpose: 'email_verification' },
  });
  assert.equal(ver.status, 200, JSON.stringify(ver.body));

  const login = await call('POST', '/api/auth/customer/login', {
    body: { email, password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));

  // Give the account a complete profile so ordering is allowed.
  await call('PUT', '/api/customer/profile', {
    token: login.body.accessToken,
    body: {
      first_name: 'Test',
      last_name: 'Customer',
      mobile_number: mob,
      address: '1 Test Street, Quezon City',
      latitude: 14.676,
      longitude: 121.043,
    },
  });

  return {
    id: login.body.user.id,
    email,
    mobile: mob,
    token: login.body.accessToken,
  };
}

const createdCustomerIds = [];

async function anyMenuItem() {
  const { rows } = await db.query(
    `SELECT id FROM menu_items
      WHERE is_deleted = FALSE AND is_available = TRUE
      ORDER BY id LIMIT 1`
  );
  if (rows.length === 0) return null;
  return rows[0].id;
}

async function cleanup() {
  if (!db) return;
  for (const id of createdCustomerIds) {
    await db.query(`DELETE FROM chatbot_conversations WHERE customer_id = $1`, [id]);
    await db.query(`DELETE FROM support_chats WHERE customer_id = $1`, [id]);
    await db.query(`DELETE FROM orders WHERE customer_id = $1`, [id]);
    await db.query(`DELETE FROM customers WHERE id = $1`, [id]);
    await db.query(`DELETE FROM otp_verifications WHERE contact IN (SELECT email FROM customers WHERE id = $1)`, [id]);
  }
  createdCustomerIds.length = 0;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.after(async () => {
  await cleanup();
  // Close every socket client the tests opened, then the server, so the
  // process can exit even when an assertion failed halfway through.
  for (const client of openClients) {
    try {
      client.close();
    } catch {
      // already closed
    }
  }
  openClients.length = 0;
  if (harness) {
    harness.io.close();
    if (typeof harness.server.closeAllConnections === 'function') {
      harness.server.closeAllConnections();
    }
    await new Promise((resolve) => harness.server.close(resolve));
  }
});

test('registration creates an awaiting_verification customer and mails a code', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const email = uniqueEmail();

  const res = await call('POST', '/api/auth/customer/register', {
    body: { email, password },
  });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body?.user?.id, 'the response carries the customer id');
  assert.equal(res.body.user.email, email);
  assert.equal(res.body.user.email_verified, false);
  assert.equal(res.body.user.status, 'awaiting_verification');
  assert.equal(res.body.user.profile_completed, false);
  assert.ok(codeFromEmail(email), 'a verification code was emailed');

  const { rows } = await db.query('SELECT id FROM customers WHERE email = $1', [email]);
  assert.equal(rows.length, 1);
  createdCustomerIds.push(rows[0].id);

  // A second registration for an unverified address is allowed (retry).
  const again = await call('POST', '/api/auth/customer/register', {
    body: { email, password: 'otherpassword9' },
  });
  assert.equal(again.status, 201);
  assert.equal(again.body.user.id, res.body.user.id, 'the same account is reused');
});

test('a verified address cannot be registered again', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const res = await call('POST', '/api/auth/customer/register', {
    body: { email: customer.email, password },
  });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /already exists/i);
});

test('a wrong OTP is rejected and does not consume the real code', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const email = uniqueEmail();
  await call('POST', '/api/auth/customer/register', { body: { email, password } });
  const code = codeFromEmail(email);

  const wrong = await call('POST', '/api/auth/customer/verify-otp', {
    body: { email, otp: '000000', purpose: 'email_verification' },
  });
  assert.equal(wrong.status, 400);

  const ok = await call('POST', '/api/auth/customer/verify-otp', {
    body: { email, otp: code, purpose: 'email_verification' },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.accessToken, 'verification returns an access token');
  assert.ok(ok.body.refreshToken);

  const { rows } = await db.query('SELECT id, status FROM customers WHERE email = $1', [email]);
  assert.equal(rows[0].status, 'active');
  createdCustomerIds.push(rows[0].id);
});

test('login works with the email and with the mobile number', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const byEmail = await call('POST', '/api/auth/customer/login', {
    body: { email: customer.email, password },
  });
  assert.equal(byEmail.status, 200);
  assert.equal(byEmail.body.user.type, 'customer');

  const byMobile = await call('POST', '/api/auth/customer/login', {
    body: { email: customer.mobile, password },
  });
  assert.equal(byMobile.status, 200, JSON.stringify(byMobile.body));
  assert.equal(byMobile.body.user.id, customer.id);
});

test('an unverified account cannot sign in', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const email = uniqueEmail();
  await call('POST', '/api/auth/customer/register', { body: { email, password } });

  const res = await call('POST', '/api/auth/customer/login', {
    body: { email, password },
  });
  assert.equal(res.status, 403);
  assert.match(res.body.message, /verify/i);

  const { rows } = await db.query('SELECT id FROM customers WHERE email = $1', [email]);
  createdCustomerIds.push(rows[0].id);
});

test('GET /api/auth/me returns the customer shape', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const res = await call('GET', '/api/auth/me', { token: customer.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, customer.id);
  assert.equal(res.body.user.type, 'customer');
  assert.equal(res.body.user.email, customer.email);
  assert.equal(res.body.user.password_hash, undefined, 'the hash never leaves the server');
});

test('the profile round-trips and flips profile_completed', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const res = await call('GET', '/api/customer/profile', { token: customer.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.email, customer.email);
  assert.equal(res.body.first_name, 'Test');
  assert.equal(res.body.mobile_number, customer.mobile);
  assert.equal(res.body.has_saved_payment, false);
  assert.equal(res.body.profile_completed, true);
});

test('change-password replaces the password and the old one stops working', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const wrong = await call('POST', '/api/auth/change-password', {
    token: customer.token,
    body: { current_password: 'not-the-password', new_password: 'brandnewpass1' },
  });
  assert.equal(wrong.status, 401);

  const short = await call('POST', '/api/auth/change-password', {
    token: customer.token,
    body: { current_password: password, new_password: 'short' },
  });
  assert.equal(short.status, 400);

  const ok = await call('POST', '/api/auth/change-password', {
    token: customer.token,
    body: { current_password: password, new_password: 'brandnewpass1' },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  const oldLogin = await call('POST', '/api/auth/customer/login', {
    body: { email: customer.email, password },
  });
  assert.equal(oldLogin.status, 401, 'the old password must stop working');

  const newLogin = await call('POST', '/api/auth/customer/login', {
    body: { email: customer.email, password: 'brandnewpass1' },
  });
  assert.equal(newLogin.status, 200);
});

test('placing an order prices it server-side and stamps a unique order number', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const menuItemId = await anyMenuItem();
  if (!menuItemId) return t.skip('no available menu item');

  const { rows: menuRows } = await db.query(
    'SELECT id, price FROM menu_items WHERE id = $1', [menuItemId]
  );
  const dbPrice = parseFloat(menuRows[0].price);

  const res = await call('POST', '/api/orders', {
    token: customer.token,
    body: {
      payment_method: 'cod',
      delivery_address: '1 Test Street, Quezon City',
      delivery_latitude: 14.676,
      delivery_longitude: 121.043,
      notes: 'please hurry',
      items: [
        { menu_item_id: menuItemId, quantity: 2, unit_price: 1, note: 'no onions' },
      ],
    },
  });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.id);
  assert.match(res.body.order_number, /^ORD-\d{4}$/);
  assert.equal(res.body.payment_method, 'cod', "the app's vocabulary is preserved");
  assert.equal(res.body.total_amount, dbPrice * 2, 'the client price is ignored');

  // A second order must not reuse the order number.
  const second = await call('POST', '/api/orders', {
    token: customer.token,
    body: {
      payment_method: 'cod',
      items: [{ menu_item_id: menuItemId, quantity: 1 }],
    },
  });
  assert.equal(second.status, 201, JSON.stringify(second.body));
  assert.notEqual(second.body.order_number, res.body.order_number, 'order numbers are unique');

  // The line item keeps the app's note, and the order keeps the app's notes.
  const { rows: itemRows } = await db.query(
    'SELECT notes, unit_price FROM order_items WHERE order_id = $1', [res.body.id]
  );
  assert.equal(itemRows[0].notes, 'no onions');
  assert.equal(parseFloat(itemRows[0].unit_price), dbPrice);

  const { rows: orderRows } = await db.query(
    'SELECT special_request, delivery_address, delivery_latitude FROM orders WHERE id = $1',
    [res.body.id]
  );
  assert.equal(orderRows[0].special_request, 'please hurry');
  assert.equal(orderRows[0].delivery_address, '1 Test Street, Quezon City');
  assert.equal(parseFloat(orderRows[0].delivery_latitude), 14.676);

  // One payment row and one delivery row.
  const { rows: payRows } = await db.query(
    'SELECT method, status FROM payments WHERE order_id = $1', [res.body.id]
  );
  assert.equal(payRows.length, 1);
  assert.equal(payRows[0].method, 'cash_on_delivery');

  const { rows: delRows } = await db.query(
    'SELECT status FROM deliveries WHERE order_id = $1', [res.body.id]
  );
  assert.equal(delRows.length, 1);

  // And the customer has a notification about it.
  const { rows: notifRows } = await db.query(
    `SELECT type, related_order_id FROM customer_notifications
      WHERE customer_id = $1 AND related_order_id = $2`,
    [customer.id, res.body.id]
  );
  assert.equal(notifRows.length, 1);
  assert.equal(notifRows[0].type, 'order_pending');
});

test('an order without an address is refused', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const email = uniqueEmail();
  await call('POST', '/api/auth/customer/register', { body: { email, password } });
  const code = codeFromEmail(email);
  await call('POST', '/api/auth/customer/verify-otp', {
    body: { email, otp: code, purpose: 'email_verification' },
  });
  const login = await call('POST', '/api/auth/customer/login', {
    body: { email, password },
  });
  const { rows } = await db.query('SELECT id FROM customers WHERE email = $1', [email]);
  createdCustomerIds.push(rows[0].id);

  const menuItemId = await anyMenuItem();
  if (!menuItemId) return t.skip('no available menu item');

  const res = await call('POST', '/api/orders', {
    token: login.body.accessToken,
    body: { payment_method: 'cod', items: [{ menu_item_id: menuItemId, quantity: 1 }] },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'profile_incomplete');
});

test('order reads are owner-only', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const owner = await makeVerifiedCustomer();
  const stranger = await makeVerifiedCustomer();
  createdCustomerIds.push(owner.id, stranger.id);

  const menuItemId = await anyMenuItem();
  if (!menuItemId) return t.skip('no available menu item');

  const placed = await call('POST', '/api/orders', {
    token: owner.token,
    body: { payment_method: 'cod', items: [{ menu_item_id: menuItemId, quantity: 1 }] },
  });
  assert.equal(placed.status, 201);

  // The owner sees it.
  const mine = await call('GET', `/api/orders/${placed.body.id}`, { token: owner.token });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.id, placed.body.id);
  assert.ok(Array.isArray(mine.body.items));
  assert.equal(mine.body.items[0].note, null);

  // The stranger does not.
  const theirs = await call('GET', `/api/orders/${placed.body.id}`, { token: stranger.token });
  assert.equal(theirs.status, 404, JSON.stringify(theirs.body));

  const list = await call('GET', '/api/orders', { token: stranger.token });
  assert.equal(list.status, 200);
  assert.equal(list.body.orders.length, 0, 'a stranger sees none of the orders');
});

test('the order timeline, status and cancel endpoints work', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const menuItemId = await anyMenuItem();
  if (!menuItemId) return t.skip('no available menu item');

  const placed = await call('POST', '/api/orders', {
    token: customer.token,
    body: { payment_method: 'cod', items: [{ menu_item_id: menuItemId, quantity: 1 }] },
  });
  const orderId = placed.body.id;

  const timeline = await call('GET', `/api/orders/${orderId}/timeline`, { token: customer.token });
  assert.equal(timeline.status, 200, JSON.stringify(timeline.body));
  assert.equal(timeline.body.order_id, orderId);
  assert.ok(Array.isArray(timeline.body.timeline));
  assert.equal(timeline.body.timeline[0].status, 'pending');
  assert.equal(timeline.body.timeline[0].is_current, true);

  const status = await call('GET', `/api/orders/${orderId}/status`, { token: customer.token });
  assert.equal(status.status, 200);
  assert.equal(status.body.status, 'pending');
  assert.equal(status.body.can_cancel, true);

  const cancel = await call('POST', `/api/orders/${orderId}/cancel`, { token: customer.token });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));

  const after = await call('GET', `/api/orders/${orderId}/status`, { token: customer.token });
  assert.equal(after.body.status, 'cancelled');
  assert.equal(after.body.can_cancel, false);
});

test('the customer notification feed can be read and marked as read', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const menuItemId = await anyMenuItem();
  if (!menuItemId) return t.skip('no available menu item');

  const placed = await call('POST', '/api/orders', {
    token: customer.token,
    body: { payment_method: 'cod', items: [{ menu_item_id: menuItemId, quantity: 1 }] },
  });
  assert.equal(placed.status, 201);

  const feed = await call('GET', '/api/customer/notifications', { token: customer.token });
  assert.equal(feed.status, 200, JSON.stringify(feed.body));
  const list = feed.body.notifications || feed.body.data || [];
  assert.ok(list.length >= 1, 'the order produced a notification');
  assert.equal(list[0].is_read, false);

  const read = await call('PUT', `/api/notifications/${list[0].id}/read`, { token: customer.token });
  assert.equal(read.status, 200);

  const all = await call('PUT', '/api/notifications/read-all', { token: customer.token });
  assert.equal(all.status, 200);
});

test('the support chat is locked until the customer has an order', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const locked = await call('GET', '/api/support-chat', { token: customer.token });
  assert.equal(locked.status, 200, JSON.stringify(locked.body));
  assert.equal(locked.body.status, 'locked');
  assert.ok(Array.isArray(locked.body.messages));

  const blocked = await call('POST', '/api/support-chat/message', {
    token: customer.token,
    body: { content: 'hello?' },
  });
  assert.equal(blocked.status, 403);

  const menuItemId = await anyMenuItem();
  if (!menuItemId) return t.skip('no available menu item');
  await call('POST', '/api/orders', {
    token: customer.token,
    body: { payment_method: 'cod', items: [{ menu_item_id: menuItemId, quantity: 1 }] },
  });

  const unlocked = await call('GET', '/api/support-chat', { token: customer.token });
  assert.equal(unlocked.body.status, 'unlocked');

  const sent = await call('POST', '/api/support-chat/message', {
    token: customer.token,
    body: { content: 'Is my order ready?' },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.message.content, 'Is my order ready?');
  assert.equal(sent.body.message.sender_type, 'customer');

  const read = await call('PUT', '/api/support-chat/read', { token: customer.token });
  assert.equal(read.status, 200);
});

test('the chatbot answers a menu question', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const res = await call('POST', '/api/chatbot/message', {
    token: customer.token,
    body: { message: 'what do you have today?' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(typeof res.body.reply === 'string' || typeof res.body.message === 'string');
});

test('sockets: a customer joins its own order room but not a foreign one', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const { io: socketServer, port } = await ensureHarness();

  const owner = await makeVerifiedCustomer();
  const stranger = await makeVerifiedCustomer();
  createdCustomerIds.push(owner.id, stranger.id);

  const menuItemId = await anyMenuItem();
  if (!menuItemId) return t.skip('no available menu item');

  const placed = await call('POST', '/api/orders', {
    token: owner.token,
    body: { payment_method: 'cod', items: [{ menu_item_id: menuItemId, quantity: 1 }] },
  });
  const orderId = placed.body.id;

  const { io: ioClient } = require('socket.io-client');
  const strangerSocket = ioClient(`http://127.0.0.1:${port}`, {
    auth: { token: stranger.token },
    transports: ['websocket'],
  });
  openClients.push(strangerSocket);

  await new Promise((resolve, reject) => {
    strangerSocket.once('connect', resolve);
    strangerSocket.once('connect_error', reject);
  });

  // The customer room is claimed automatically on connect.
  const customerRoom = socketServer.sockets.adapter.rooms.get(`customer:${stranger.id}`);
  assert.ok(customerRoom, 'the customer auto-joins its own room');
  assert.ok(customerRoom.has(strangerSocket.id));

  // A foreign order room is refused.
  strangerSocket.emit('join_order', { order_id: orderId });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const foreignRoom = socketServer.sockets.adapter.rooms.get(`order:${orderId}`);
  assert.ok(
    !foreignRoom || !foreignRoom.has(strangerSocket.id),
    "a stranger must not join another customer's order room"
  );

  // Its own order room is allowed.
  const ownOrder = await call('POST', '/api/orders', {
    token: stranger.token,
    body: { payment_method: 'cod', items: [{ menu_item_id: menuItemId, quantity: 1 }] },
  });
  strangerSocket.emit('join_order', { order_id: ownOrder.body.id });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const ownRoom = socketServer.sockets.adapter.rooms.get(`order:${ownOrder.body.id}`);
  assert.ok(ownRoom && ownRoom.has(strangerSocket.id), 'the owner joins its own order room');

  strangerSocket.close();
});

test('sockets: order_status_update reaches the customer room', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const { port } = await ensureHarness();

  const customer = await makeVerifiedCustomer();
  createdCustomerIds.push(customer.id);

  const { io: ioClient } = require('socket.io-client');
  const client = ioClient(`http://127.0.0.1:${port}`, {
    auth: { token: customer.token },
    transports: ['websocket'],
  });
  openClients.push(client);

  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });

  const received = new Promise((resolve) => {
    client.once('order_status_update', resolve);
  });

  const socketHub = require('../src/sockets');
  socketHub.emitCustomerOrderStatus({
    orderId: 4242,
    status: 'preparing',
    customerId: customer.id,
  });

  const event = await Promise.race([
    received,
    new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);

  assert.ok(event, 'the customer receives order_status_update');
  assert.equal(event.order_id, 4242);
  assert.equal(event.status, 'preparing');

  client.close();
});
