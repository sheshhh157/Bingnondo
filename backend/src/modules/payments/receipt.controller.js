/**
 * receipt.controller.js
 * ──────────────────────
 * GCash receipt upload for the customer app.
 *
 *   POST /api/payments/extract-receipt      → upload only (before checkout)
 *   POST /api/orders/:id/reupload-receipt    → upload + attach to an order
 *
 * Extraction
 * ──────────
 * The backend has no OCR engine (no tesseract/OCR dependency), so the
 * reference number and amount are NOT read from the image. The response
 * reports `ref_found: false` / `amount_found: false` and the app falls back
 * to its manual-entry fields — see checkout_screen.dart, which leaves the
 * ref/amount boxes empty and editable when the extraction flags are false.
 * When an OCR service is added later, only `extractFromImage` has to change;
 * the response shape is already fixed.
 */

const db = require('../../config/db');
const socketHub = require('../../sockets');
const { createCustomerNotification } = require('../customer/customer-notifications');

/**
 * The shape the app parses (GcashExtractResult.fromJson).
 * `temp_url` is required and must be a string.
 */
function extractPayload({ tempUrl, refNumber = null, amount = null }) {
  const hasRef = Boolean(refNumber);
  const hasAmount = amount !== null && amount !== undefined;
  return {
    temp_url: tempUrl,
    gcash_ref_number: hasRef ? refNumber : null,
    gcash_amount: hasAmount ? Number(amount) : null,
    ocr_confidence: 0,
    ref_found: hasRef,
    amount_found: hasAmount,
  };
}

/**
 * Read the reference number / amount from the uploaded image.
 *
 * Placeholder for the OCR service — returns nulls, which the app treats as
 * "ask the customer to type it in".
 */
async function extractFromImage(_file) {
  return { refNumber: null, amount: null };
}

// ─── POST /api/payments/extract-receipt ─────────────────────────────────────
/**
 * Multipart: field 'receipt' (image).
 * Customer only.
 */
async function extractReceipt(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No receipt image provided.' });
    }

    const { refNumber, amount } = await extractFromImage(req.file);

    return res.status(200).json(
      extractPayload({ tempUrl: req.file.path, refNumber, amount })
    );
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/orders/:id/reupload-receipt ───────────────────────────────────
/**
 * Multipart: field 'receipt' (image).
 * Body (optional): gcash_ref_number, gcash_amount_sent
 *
 * Replaces the receipt on the order's payment row and puts the payment back
 * into 'awaiting_verification' so it returns to the staff queue.
 */
async function reuploadOrderReceipt(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No receipt image provided.' });
    }

    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: 'Invalid order id.' });
    }

    // The order must belong to the signed-in customer.
    const { rows: orderRows } = await db.query(
      'SELECT id, customer_id, status FROM orders WHERE id = $1',
      [orderId]
    );
    if (orderRows.length === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    const order = orderRows[0];
    if (req.user?.type === 'customer' && order.customer_id !== req.user.sub) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    if (order.status === 'cancelled' || order.status === 'completed') {
      return res.status(409).json({ message: `Cannot attach a receipt to a ${order.status} order.` });
    }

    const { refNumber, amount } = await extractFromImage(req.file);

    // The body may carry values the customer typed by hand.
    const bodyRef = req.body?.gcash_ref_number ? String(req.body.gcash_ref_number).trim() : null;
    const bodyAmount = req.body?.gcash_amount_sent !== undefined && req.body?.gcash_amount_sent !== ''
      ? parseFloat(req.body.gcash_amount_sent)
      : null;

    const finalRef = bodyRef || refNumber;
    const finalAmount = Number.isFinite(bodyAmount) ? bodyAmount : amount;

    // Read the payment's current state first. The cashier's online-orders
    // console shows the rejected receipt beside the new one, so the receipt
    // that was just rejected has to be archived before it gets overwritten.
    const { rows: existingRows } = await db.query(
      `SELECT p.id, p.status, p.receipt_image_url, p.rejection_count, o.order_number
         FROM payments p
         JOIN orders o ON o.id = p.order_id
        WHERE p.order_id = $1
        ORDER BY p.id DESC
        LIMIT 1`,
      [orderId]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'No payment found for this order.' });
    }
    const existing = existingRows[0];
    // Only a rejected receipt is worth keeping as the "previous" one — an
    // upload over a pending payment has nothing to compare against.
    const wasRejected = existing.status === 'rejected';

    const { rows: paymentRows } = await db.query(
      `UPDATE payments
          SET gcash_ref_number    = $1,
              gcash_amount_sent   = $2,
              receipt_image_url   = $3,
              receipt_uploaded_at = NOW(),
              status              = 'awaiting_verification',
              rejection_reason    = NULL,
              rejected_at         = NULL,
              resubmitted_at      = NOW(),
              previous_receipt_image_url = CASE
                WHEN $5 THEN COALESCE(previous_receipt_image_url, receipt_image_url)
                ELSE previous_receipt_image_url
              END
        WHERE order_id = $4
        RETURNING id, order_id, status, gcash_ref_number, gcash_amount_sent,
                  receipt_image_url, rejection_count`,
      [finalRef, finalAmount, req.file.path, orderId, wasRejected]
    );

    if (paymentRows.length === 0) {
      return res.status(404).json({ message: 'No payment found for this order.' });
    }

    const payment = paymentRows[0];

    // Tell the staff queue a receipt is waiting again.
    socketHub.emitPaymentPending({
      orderId,
      orderNumber: `ORD-${String(orderId).padStart(4, '0')}`,
      customerId: order.customer_id,
      customerName: null,
      totalAmount: null,
    });

    // The cashier's online-orders console listens for this event so it can
    // swap in the new receipt and show the rejected one next to it.
    try {
      socketHub.emitPaymentResubmitted({
        orderId,
        orderNumber: existing.order_number || `ORD-${String(orderId).padStart(4, '0')}`,
        customerId: order.customer_id,
        gcashRefNumber: payment.gcash_ref_number,
        gcashAmountSent: payment.gcash_amount_sent !== null ? parseFloat(payment.gcash_amount_sent) : null,
        rejectionCount: Number(payment.rejection_count) || 0,
        resubmittedAt: new Date().toISOString(),
      });
    } catch (_) { /* non-fatal — the poll still picks the row up */ }

    await createCustomerNotification({
      customerId: order.customer_id,
      type: 'payment_received',
      message: 'Your new GCash receipt was uploaded and is waiting for verification.',
      relatedOrderId: orderId,
    });

    return res.status(200).json(
      extractPayload({
        tempUrl: payment.receipt_image_url,
        refNumber: payment.gcash_ref_number,
        amount: payment.gcash_amount_sent !== null ? parseFloat(payment.gcash_amount_sent) : null,
      })
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { extractReceipt, reuploadOrderReceipt, extractPayload };
