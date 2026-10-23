const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff, requireCustomer } = require('../../middleware/auth.middleware');
const ctrl = require('./orders.controller');
const customerCtrl = require('./customer-orders.controller');
const receiptCtrl = require('../payments/receipt.controller');
const { receiptUpload, handleReceiptUploadError } = require('../../config/receiptUpload');

// All order routes require a valid token.
const authed = [authenticateToken];

// Staff role guards (authenticateToken is applied separately so the router
// can decide whether this is a staff or a customer request).
const staffAuth = [requireStaff];
const canOrder = [requireStaff, requireRoles('cashier', 'admin')];
const canUpdateStatus = [requireStaff, requireRoles('kitchen_staff', 'cashier', 'admin')];

/**
 * Dispatch a request to the customer handler or the staff handler, based on
 * the type of the presented token.
 *
 * The mobile app uses the same paths as the staff console (/api/orders,
 * /api/orders/:id, ...), so one URL serves two audiences. A customer token
 * never reaches a staff handler and a staff token never reaches a customer
 * handler.
 *
 * @param {Function} customerHandler
 * @param {Function[]} staffGuards  role middleware, run only for staff
 * @param {Function} staffHandler
 */
function dispatch(customerHandler, staffGuards, staffHandler) {
  return (req, res, next) => {
    if (req.user?.type === 'customer') {
      if (!customerHandler) {
        return res.status(403).json({ message: "You don't have permission to perform this action." });
      }
      return customerHandler(req, res, next);
    }
    if (req.user?.type !== 'staff') {
      return res.status(403).json({ message: "You don't have permission to perform this action." });
    }

    let index = 0;
    const step = () => {
      if (index < staffGuards.length) return staffGuards[index++](req, res, step);
      return staffHandler(req, res, next);
    };
    step();
  };
}

// POST /api/orders — place an order.
// Staff: counter order. Customer: online order from the app.
router.post('/', ...authed, dispatch(customerCtrl.placeOrder, canOrder, ctrl.createOrder));

// GET /api/orders — list orders.
// Staff: cashier sees own, others see all. Customer: their own orders.
router.get('/', ...authed, dispatch(customerCtrl.listMyOrders, staffAuth, ctrl.getOrders));

// GET /api/orders/totals — all-time revenue collected + count, one row.
// Must be registered before '/:id' or Express matches "totals" as an id.
router.get('/totals', ...authed, dispatch(null, staffAuth, ctrl.getOrderTotals));

// GET /api/orders/report — sales report aggregates, one row.
// Same ordering requirement as '/totals'.
router.get('/report', ...authed, dispatch(null, staffAuth, ctrl.getOrderReport));

// GET /api/orders/online — online-order console (customer + payment + delivery).
// Same ordering requirement as '/totals': must precede '/:id'.
router.get('/online', ...authed, dispatch(null, staffAuth, ctrl.getOnlineOrders));

// GET /api/orders/:id — get single order detail
router.get('/:id', ...authed, dispatch(customerCtrl.getMyOrder, staffAuth, ctrl.getOrderById));

// GET /api/orders/:id/timeline — status-history stepper (customer app).
router.get('/:id/timeline', ...authed, requireCustomer, customerCtrl.getMyOrderTimeline);

// GET /api/orders/:id/status — lightweight status poll (customer app).
router.get('/:id/status', ...authed, requireCustomer, customerCtrl.getMyOrderStatus);

// PATCH /api/orders/:id/status — update order status (kitchen, staff, owner)
router.patch('/:id/status', ...authed, dispatch(null, canUpdateStatus, ctrl.updateOrderStatus));

// POST /api/orders/:id/cancel — cancel an order
router.post('/:id/cancel', ...authed, dispatch(customerCtrl.cancelMyOrder, staffAuth, ctrl.cancelOrder));

// PATCH /api/orders/:id/items — replace order items (cashier edited draft after confirm)
router.patch('/:id/items', ...authed, dispatch(null, canOrder, ctrl.updateOrderItems));

// POST /api/orders/:id/reupload-receipt — customer uploads a new GCash receipt.
// Multipart form: field 'receipt' (image).
router.post(
  '/:id/reupload-receipt',
  ...authed,
  requireCustomer,
  receiptUpload.single('receipt'),
  handleReceiptUploadError,
  receiptCtrl.reuploadOrderReceipt
);

module.exports = router;
