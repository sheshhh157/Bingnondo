/**
 * cashierApi.js — Real API calls for the Cashier module.
 *
 * Adapted to the existing backend response shapes:
 *
 *   GET  /api/menu
 *     → { categories: [...], items: [...] }
 *     (CashierPage.jsx expects: data.categories + data.items)
 *
 *   POST /api/orders
 *     → { id, order_number, status, total_amount, items, ... }
 *     (CashierPage.jsx expects: data.id + data.order_number)
 *
 *   GET  /api/orders?range=today
 *     → { orders: [...] }
 *     (TransactionHistory.jsx does: data.orders || [])
 *
 *   POST /api/payments
 *     → { payment, change, message }
 *
 * Each function wraps the response in { data: ... } to keep CashierPage.jsx
 * working without changes to its existing destructuring patterns.
 */

import { get, post, patch } from './apiClient';

// ─── Menu ──────────────────────────────────────────────────────────────────────
export const menuAPI = {
  /**
   * Returns { data: { categories: [...], items: [...] } }
   * Backend: GET /api/menu → { categories, items }
   */
  getAll: async () => {
    const res = await get('/api/menu');
    // Backend returns { categories, items } directly — wrap for CashierPage
    return { data: res };
  },
};

// ─── Orders ───────────────────────────────────────────────────────────────────
export const ordersAPI = {
  /**
   * Check out a counter order — creates the order AND records payment as 'paid'
   * in a single call. Nothing is written server-side until this fires.
   * payload: { items: [{ menu_item_id, quantity, notes? }], method, cash_given? }
   * Returns { data: { id, order_number, status, total_amount, items, payment, change } }
   */
  checkout: async ({ items, method, cash_given }) => {
    const res = await post('/api/orders', {
      order_type: 'counter',
      items,
      payment: { method, cash_given },
    });
    // Backend returns the order object directly
    return { data: res };
  },

  /**
   * Cashier's own transactions (today or this week).
   * Returns { data: [...orders] }  — TransactionHistory does: data.orders || data || []
   */
  getMyTransactions: async ({ range = 'today' } = {}) => {
    const res = await get(`/api/orders?range=${range}`);
    // Backend returns { orders: [...] }
    return { data: res.orders || [] };
  },

  /**
   * Update items of an existing confirmed order (customer added/removed something).
   * PATCH /api/orders/:id/items
   * items: [{ menu_item_id, quantity, notes? }]
   */
  updateItems: async (orderId, items) => {
    const res = await patch(`/api/orders/${orderId}/items`, { items });
    return { data: res };
  },

  /**
   * Get a single order by ID.
   */
  getById: async (id) => {
    const res = await get(`/api/orders/${id}`);
    return { data: res };
  },

  /**
   * Online-order console. Cashier's view of order_type='online' orders,
   * joined with the customer, latest payment, delivery row and items.
   * Returns { data: { orders: [...], total } }
   *   status — comma-separated filter(s), e.g. 'pending,confirmed'
   *   search — order number / customer name / mobile / GCash ref
   */
  getOnline: async ({ status, search, limit = 50, offset = 0 } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    if (limit) params.set('limit', limit);
    if (offset > 0) params.set('offset', offset);
    const qs = params.toString();
    const res = await get(`/api/orders/online${qs ? `?${qs}` : ''}`);
    return { data: { orders: res.orders || [], total: res.total || 0 } };
  },

  /**
   * Fulfill-and-dispatch an online order.
   *   GCash        → verifyPayment (marks payment paid + order confirmed)
   *   cash / COD   → PATCH status to 'confirmed'
   * Returns the backend response wrapped in { data }.
   */
  accept: async (order) => {
    if (order.payment_method === 'gcash') {
      return paymentsAPI.verify(order.id);
    }
    const res = await patch(`/api/orders/${order.id}/status`, { status: 'confirmed' });
    return { data: res };
  },

  /**
   * Move an online order along the state machine (e.g. to 'completed' for
   * handoff, or 'out_for_delivery' for a staffed delivery).
   */
  setStatus: async (orderId, status) => {
    const res = await patch(`/api/orders/${orderId}/status`, { status });
    return { data: res };
  },

  /**
   * Cancel an online order (unpaid only — see backend cancelOrder).
   */
  cancel: async (orderId, reason) => {
    const res = await post(`/api/orders/${orderId}/cancel`, { reason });
    return { data: res };
  },
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const paymentsAPI = {
  /**
   * Process payment for a counter order.
   * payload: { order_id, method: 'cash'|'gcash', amount, cash_given }
   * Returns { data: { payment, change, message } }
   *
   * GCash returns a 501 from the backend — PaymentModal catches this
   * via the catch block and shows an error message.
   */
  process: async ({ order_id, method, amount, cash_given }) => {
    const res = await post('/api/payments', {
      order_id,
      method: method || 'cash',
      amount,
      cash_given: method === 'cash' ? cash_given : undefined,
    });
    // Backend returns { payment, change, message }
    return { data: res };
  },

  /**
   * Approve a GCash receipt. Marks the payment paid and the order confirmed
   * (which is what pushes it into the kitchen queue).
   */
  verify: async (orderId) => {
    const res = await post(`/api/payments/${orderId}/verify`, {});
    return { data: res };
  },

  /**
   * Reject a GCash receipt. reason is required by the backend.
   */
  reject: async (orderId, reason) => {
    const res = await post(`/api/payments/${orderId}/reject`, { reason });
    return { data: res };
  },
};