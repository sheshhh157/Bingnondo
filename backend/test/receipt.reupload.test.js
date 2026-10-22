/**
 * receipt.reupload.test.js
 * ─────────────────────────
 * POST /api/orders/:id/reupload-receipt — the customer replaces a rejected
 * GCash receipt.
 *
 * The uploader is stubbed through require.cache (the same technique as the
 * mailer stub in customer.app-api.test.js), so the test never reaches
 * Cloudinary. The stub still runs a real multer instance with memory
 * storage, so the multipart body is parsed exactly as in production — only
 * the hosted URL Cloudinary would have returned is faked.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

// ─── Uploader stub (installed before the router is required) ─────────────────

const multer = require('multer');

const receiptUploadPath = require.resolve('../src/config/receiptUpload');
const STUB_RECEIPT_URL = 'https://cdn.example.test/replacement-receipt.png';
const ORIGINAL_RECEIPT_URL = 'https://cdn.example.test/original-receipt.png';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'));
    }
    cb(null, true);
  },
});

require.cache[receiptUploadPath] = {
  id: receiptUploadPath,
  filename: receiptUploadPath,
  loaded: true,
  exports: {
    receiptUpload: {
      single: (field) => (req, res, next) =>
        upload.single(field)(req, res, (err) => {
          if (err) return next(err);
          // Cloudinary would have returned a hosted URL; memory storage has
          // none, so fake the one field the controller reads.
          if (req.file) req.file.path = STUB_RECEIPT_URL;
          next();
        }),
    },
    handleReceiptUploadError: (err, req, res, next) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Image is too large. Maximum size is 8MB.' });
      }
      if (err?.message === 'Only image files are allowed.') {
        return res.status(415).json({ message: err.message });
      }
      next(err);
    },
  },
};

let db = null;
try {
  db = require('../src/config/db');
} catch {
  db = null;
}

const { signAccessToken } = require('../src/modules/auth/auth.jwt');

// ─── HTTP harness (mirrors server.js) ────────────────────────────────────────

let harness = null;

async function startHarness() {
  const express = require('express');
  const http = require('http');

  const app = express();
  const server = http.createServer(app);

  app.use(express.json());
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));

  await new Promise((resolve) => server.listen(0, resolve));
  return { server, port: server.address().port };
}

async function ensureHarness() {
  if (!harness) harness = await startHarness();
  return harness;
}

async function request(method, path, { token, body, form } = {}) {
  const { port } = await ensureHarness();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: payload,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Builds the multipart body the app posts for a receipt. */
function receiptForm(fields = {}, { withFile = true, mimetype = 'image/png' } = {}) {
  const form = new FormData();
  if (withFile) {
    form.append(
      'receipt',
      new Blob([Buffer.from('fake-receipt-bytes')], { type: mimetype }),
      'receipt.png'
    );
  }
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  return form;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const createdCustomerIds = [];
let seq = 0;

/**
 * Creates a customer with a complete profile and mints a customer token.
 * The customer endpoints are not under test here, so the row is inserted
 * directly instead of walking the register → OTP → login flow.
 */
async function makeCustomer() {
  seq += 1;
  const email = `__receipt_test_${Date.now()}_${seq}@example.test`;
  const mobile = `09${String(Date.now() + seq).slice(-9)}`;

  const { rows } = await db.query(
    `INSERT INTO customers
       (email, password_hash, email_verified, first_name, last_name,
        mobile_number, mobile_verified, address, profile_completed, status,
        latitude, longitude)
     VALUES ($1, 'not-a-real-hash', TRUE, 'Receipt', 'Tester', $2, TRUE,
             '1 Test Street, Quezon City', TRUE, 'active', 14.676, 121.043)
     RETURNING id`,
    [email, mobile]
  );
  const id = rows[0].id;
  createdCustomerIds.push(id);

  return {
    id,
    email,
    token: signAccessToken({ sub: id, type: 'customer', role: 'customer' }),
  };
}

async function anyMenuItem() {
  const { rows } = await db.query(
    `SELECT id FROM menu_items
      WHERE is_deleted = FALSE AND is_available = TRUE
      ORDER BY id LIMIT 1`
  );
  return rows.length === 0 ? null : rows[0].id;
}

/** Places a GCash order, which creates the order and its payment row. */
async function placeGcashOrder(customer) {
  const menuItemId = await anyMenuItem();
  if (!menuItemId) return null;

  const res = await request('POST', '/api/orders', {
    token: customer.token,
    body: {
      payment_method: 'gcash',
      gcash_receipt_temp_url: ORIGINAL_RECEIPT_URL,
      items: [{ menu_item_id: menuItemId, quantity: 1 }],
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id;
}

/** Puts the order's payment into the state the cashier leaves it in. */
async function markPaymentRejected(orderId, { reason = 'The receipt is blurry.', count = 1 } = {}) {
  await db.query(
    `UPDATE payments
        SET status             = 'rejected',
            receipt_image_url  = $2,
            receipt_uploaded_at = NOW(),
            rejection_reason   = $3,
            rejected_at        = NOW(),
            rejection_count    = $4
      WHERE order_id = $1`,
    [orderId, ORIGINAL_RECEIPT_URL, reason, count]
  );
}

async function paymentRow(orderId) {
  const { rows } = await db.query(
    `SELECT status, receipt_image_url, previous_receipt_image_url, rejection_reason,
            rejected_at, resubmitted_at, rejection_count, gcash_ref_number,
            gcash_amount_sent
       FROM payments WHERE order_id = $1`,
    [orderId]
  );
  return rows[0] || null;
}

async function cleanup() {
  if (!db) return;
  for (const id of createdCustomerIds) {
    // Placing an order opens a support-chat thread, and support_chats /
    // chatbot_conversations point back at the customer without a cascade —
    // they have to go before the customer row does.
    await db.query('DELETE FROM support_chats WHERE customer_id = $1', [id]);
    await db.query('DELETE FROM chatbot_conversations WHERE customer_id = $1', [id]);
    await db.query('DELETE FROM customer_order_violations WHERE customer_id = $1', [id]);
    await db.query('DELETE FROM orders WHERE customer_id = $1', [id]);
    await db.query('DELETE FROM customers WHERE id = $1', [id]);
  }
  createdCustomerIds.length = 0;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.after(async () => {
  try {
    await cleanup();
  } catch (err) {
    // Never let a leftover row hang the runner — say so loudly instead.
    console.error('[receipt.reupload] cleanup failed:', err.message);
  }
  if (harness) {
    if (typeof harness.server.closeAllConnections === 'function') {
      harness.server.closeAllConnections();
    }
    await new Promise((resolve) => harness.server.close(resolve));
  }
});

test('a rejected receipt is replaced and the payment returns to the staff queue', async (t) => {
  if (!db) return t.skip('database unavailable');

  const customer = await makeCustomer();
  const orderId = await placeGcashOrder(customer);
  if (!orderId) return t.skip('no available menu item');

  await markPaymentRejected(orderId, { reason: 'The receipt is blurry.', count: 2 });

  const res = await request('POST', `/api/orders/${orderId}/reupload-receipt`, {
    token: customer.token,
    form: receiptForm(),
  });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.temp_url, STUB_RECEIPT_URL, 'the new receipt is returned to the app');
  assert.equal(res.body.ref_found, false, 'there is no OCR engine, so no reference number is read');
  assert.equal(res.body.amount_found, false);

  const row = await paymentRow(orderId);
  assert.equal(row.status, 'awaiting_verification', 'the payment is queued for verification again');
  assert.equal(row.receipt_image_url, STUB_RECEIPT_URL, 'the new receipt replaced the old one');
  assert.equal(row.rejection_reason, null, 'the rejection reason was cleared');
  assert.equal(row.rejected_at, null, 'the rejection timestamp was cleared');
  assert.ok(row.resubmitted_at, 'the re-submission was stamped');
  assert.equal(row.rejection_count, 2, 'how many times it was rejected is still counted');
});

test('the rejected receipt is archived next to the new one and kept on a second re-upload', async (t) => {
  if (!db) return t.skip('database unavailable');

  const customer = await makeCustomer();
  const orderId = await placeGcashOrder(customer);
  if (!orderId) return t.skip('no available menu item');

  await markPaymentRejected(orderId);

  const first = await request('POST', `/api/orders/${orderId}/reupload-receipt`, {
    token: customer.token,
    form: receiptForm(),
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));

  let row = await paymentRow(orderId);
  assert.equal(
    row.previous_receipt_image_url,
    ORIGINAL_RECEIPT_URL,
    'the rejected receipt is archived so the cashier can compare the two'
  );

  const second = await request('POST', `/api/orders/${orderId}/reupload-receipt`, {
    token: customer.token,
    form: receiptForm(),
  });
  assert.equal(second.status, 200, JSON.stringify(second.body));

  row = await paymentRow(orderId);
  assert.equal(
    row.previous_receipt_image_url,
    ORIGINAL_RECEIPT_URL,
    'the first rejected receipt is kept, not overwritten by the first replacement'
  );
});

test('a payment that was not rejected keeps no previous receipt', async (t) => {
  if (!db) return t.skip('database unavailable');

  const customer = await makeCustomer();
  const orderId = await placeGcashOrder(customer);
  if (!orderId) return t.skip('no available menu item');

  const res = await request('POST', `/api/orders/${orderId}/reupload-receipt`, {
    token: customer.token,
    form: receiptForm(),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const row = await paymentRow(orderId);
  assert.equal(
    row.previous_receipt_image_url,
    null,
    'there is no rejected receipt to compare against'
  );
  assert.equal(row.status, 'awaiting_verification');
});

test('the reference number and amount typed by the customer are stored', async (t) => {
  if (!db) return t.skip('database unavailable');

  const customer = await makeCustomer();
  const orderId = await placeGcashOrder(customer);
  if (!orderId) return t.skip('no available menu item');

  await markPaymentRejected(orderId);

  const res = await request('POST', `/api/orders/${orderId}/reupload-receipt`, {
    token: customer.token,
    form: receiptForm({ gcash_ref_number: '1234567890', gcash_amount_sent: '250.50' }),
  });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.gcash_ref_number, '1234567890');
  assert.equal(res.body.gcash_amount, 250.5);

  const row = await paymentRow(orderId);
  assert.equal(row.gcash_ref_number, '1234567890');
  assert.equal(Number(row.gcash_amount_sent), 250.5);
});

test('another customer cannot re-upload a receipt for an order they do not own', async (t) => {
  if (!db) return t.skip('database unavailable');

  const owner = await makeCustomer();
  const stranger = await makeCustomer();
  const orderId = await placeGcashOrder(owner);
  if (!orderId) return t.skip('no available menu item');

  await markPaymentRejected(orderId);

  const res = await request('POST', `/api/orders/${orderId}/reupload-receipt`, {
    token: stranger.token,
    form: receiptForm(),
  });

  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.equal(res.body.message, 'Order not found.');

  const row = await paymentRow(orderId);
  assert.equal(row.status, 'rejected', 'the payment was left alone');
});

test('an order without a payment row is reported as missing', async (t) => {
  if (!db) return t.skip('database unavailable');

  const customer = await makeCustomer();
  const orderId = await placeGcashOrder(customer);
  if (!orderId) return t.skip('no available menu item');

  await db.query('DELETE FROM payments WHERE order_id = $1', [orderId]);

  const res = await request('POST', `/api/orders/${orderId}/reupload-receipt`, {
    token: customer.token,
    form: receiptForm(),
  });

  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.equal(res.body.message, 'No payment found for this order.');
});

test('the upload is rejected when no image is attached', async (t) => {
  if (!db) return t.skip('database unavailable');

  const customer = await makeCustomer();
  const orderId = await placeGcashOrder(customer);
  if (!orderId) return t.skip('no available menu item');

  const res = await request('POST', `/api/orders/${orderId}/reupload-receipt`, {
    token: customer.token,
    form: receiptForm({}, { withFile: false }),
  });

  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body.message, 'No receipt image provided.');
});

test('a staff account cannot use the customer re-upload route', async (t) => {
  if (!db) return t.skip('database unavailable');

  const customer = await makeCustomer();
  const orderId = await placeGcashOrder(customer);
  if (!orderId) return t.skip('no available menu item');

  const staffToken = signAccessToken({ sub: 1, type: 'staff', role: 'cashier' });
  const res = await request('POST', `/api/orders/${orderId}/reupload-receipt`, {
    token: staffToken,
    form: receiptForm(),
  });

  assert.equal(res.status, 403, JSON.stringify(res.body));
});
