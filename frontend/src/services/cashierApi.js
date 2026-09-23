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

import { get, post } from './apiClient';

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
   * Create a counter order.
   * payload: { items: [{ menu_item_id, quantity, notes? }], special_request? }
   * Returns { data: { id, order_number, status, total_amount, items, ... } }
   */
  create: async (payload) => {
    const res = await post('/api/orders', {
      order_type: 'counter',
      items: payload.items,
      special_request: payload.special_request || null,
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
   * Get a single order by ID.
   */
  getById: async (id) => {
    const res = await get(`/api/orders/${id}`);
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
};