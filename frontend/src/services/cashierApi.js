/**
 * cashierApi.js — Real API calls for the Cashier module.
 *
 * Adapted to the existing backend response shapes:
 *
 *   GET  /api/menu
 *     → { categories: [...], items: [...] }
 *     (CashierPage.jsx expects: data.categories + data.items)
 *
 *   POST /api/orders/quote
 *     → { quote_token, total, items, expires_in }
 *     (CashierPage.jsx prices the cart here; nothing is written)
 *
 *   POST /api/payments/checkout
 *     → { order: { id, order_number, status, ... }, payment, change, message }
 *     (settles the quote — the order and its payment are created together)
 *
 *   GET  /api/orders?range=today
 *     → { orders: [...] }
 *     (TransactionHistory.jsx does: data.orders || [])
 *
 * The counter till used to POST an order and then a separate payment, which left
 * an order row behind whenever a customer walked away before paying. Those two
 * calls are now quote + checkout; the bare POST /api/orders and POST /api/payments
 * wrappers were removed with them.
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
   * Price a cart without creating anything.
   *
   * First half of the two-phase counter flow. Returns a signed quote carrying
   * the server-authoritative total; `checkout` turns it into a paid order. If
   * the customer walks away at the payment step nothing was ever written, so
   * there is no abandoned row left to clean up.
   */
  quote: async ({ items, special_request } = {}) => {
    const res = await post('/api/orders/quote', { items, special_request });
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
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const paymentsAPI = {
  /**
   * Settle a quote: creates the order and its payment in ONE transaction.
   *
   * payload: { quote_token, items, method, cash_given, special_request? }
   * Returns { data: { order: { order_number, ... }, payment, change, message } }
   *
   * `order.order_number` is the real, permanent number — it only exists once the
   * row is inserted, which is why the payment modal can't display one before
   * this call. The receipt renders it from here.
   *
   * The backend re-prices and compares against the quote's signed claims, so a
   * price or contents change returns 409 and the cashier re-quotes.
   */
  // Mounted under the payments router, so the path is /api/payments/checkout.
  checkout: async ({ quote_token, items, method, cash_given, special_request } = {}) => {
    const res = await post('/api/payments/checkout', {
      quote_token,
      items,
      method: method || 'cash',
      cash_given: method === 'cash' ? cash_given : undefined,
      special_request,
    });
    return { data: res };
  },

  };