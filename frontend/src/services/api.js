import apiClient from './apiClient';
// ─── MOCK DATA ────────────────────────────────────────────────────────────────
// Pansamantala lang ito habang wala pang backend.
// Palitan mo ito ng tunay na API calls pag ready na ang backend.

const MOCK_CATEGORIES = [
  { id: 1, name: 'Silog Meals' },
  { id: 2, name: 'Rice Meals' },
  { id: 3, name: 'Merienda' },
  { id: 4, name: 'Drinks' },
  { id: 5, name: 'Add-ons' },
];

let MOCK_MENU_ITEMS = [
  // Silog Meals
  { id: 1,  category_id: 1, name: 'Tapsilog',      description: 'Beef tapa, sinangag, itlog',      price: 120, is_available: true,  image_url: null },
  { id: 2,  category_id: 1, name: 'Longsilog',     description: 'Longganisa, sinangag, itlog',     price: 110, is_available: true,  image_url: null },
  { id: 3,  category_id: 1, name: 'Tocilog',       description: 'Tocino, sinangag, itlog',         price: 110, is_available: true,  image_url: null },
  { id: 4,  category_id: 1, name: 'Bangsilog',     description: 'Bangus, sinangag, itlog',         price: 130, is_available: true,  image_url: null },
  { id: 5,  category_id: 1, name: 'Spamsilog',     description: 'Spam, sinangag, itlog',           price: 140, is_available: false, image_url: null },
  { id: 6,  category_id: 1, name: 'Cornsilog',     description: 'Corned beef, sinangag, itlog',    price: 115, is_available: true,  image_url: null },

  // Rice Meals
  { id: 7,  category_id: 2, name: 'Adobo Rice',    description: 'Chicken adobo with steamed rice', price: 105, is_available: true,  image_url: null },
  { id: 8,  category_id: 2, name: 'Sinigang Set',  description: 'Pork sinigang with rice',         price: 150, is_available: true,  image_url: null },
  { id: 9,  category_id: 2, name: 'Fried Chicken', description: 'Crispy fried chicken with rice',  price: 135, is_available: true,  image_url: null },
  { id: 10, category_id: 2, name: 'Bistek Rice',   description: 'Beef bistek with steamed rice',   price: 145, is_available: false, image_url: null },

  // Merienda
  { id: 11, category_id: 3, name: 'Pancit Bihon',      description: 'Stir-fried rice noodles',         price: 75,  is_available: true,  image_url: null },
  { id: 12, category_id: 3, name: 'Lumpiang Shanghai',  description: '5 pcs with sweet chili sauce',    price: 65,  is_available: true,  image_url: null },
  { id: 13, category_id: 3, name: 'Goto',               description: 'Rice congee with beef tripe',     price: 85,  is_available: true,  image_url: null },
  { id: 14, category_id: 3, name: 'Arroz Caldo',        description: 'Chicken congee with ginger',      price: 80,  is_available: true,  image_url: null },

  // Drinks
  { id: 15, category_id: 4, name: 'Coke Regular',    description: '12oz bottle',       price: 40,  is_available: true,  image_url: null },
  { id: 16, category_id: 4, name: 'Coke Zero',       description: '12oz bottle',       price: 40,  is_available: true,  image_url: null },
  { id: 17, category_id: 4, name: 'Iced Tea',        description: 'House blend, 16oz', price: 45,  is_available: true,  image_url: null },
  { id: 18, category_id: 4, name: 'Bottled Water',   description: '500ml',             price: 25,  is_available: true,  image_url: null },
  { id: 19, category_id: 4, name: 'Pineapple Juice', description: 'Fresh, 16oz',       price: 55,  is_available: true,  image_url: null },
  { id: 20, category_id: 4, name: 'Hot Coffee',      description: 'Brewed coffee',     price: 60,  is_available: true,  image_url: null },

  // Add-ons
  { id: 21, category_id: 5, name: 'Extra Rice',  description: '', price: 20, is_available: true, image_url: null },
  { id: 22, category_id: 5, name: 'Extra Egg',   description: '', price: 20, is_available: true, image_url: null },
  { id: 23, category_id: 5, name: 'Extra Sauce', description: '', price: 10, is_available: true, image_url: null },
];

let menuItemCounter = 24;

// Mock transaction history — mga lumang orders para sa TransactionHistory tab
const today = new Date();
const hrsAgo = (h) => new Date(today.getTime() - h * 60 * 60 * 1000).toISOString();

let MOCK_ORDERS = [
  {
    id: 1001, order_number: 'ORD-1001', status: 'completed', payment_method: 'cash',
    total_amount: 240, created_at: hrsAgo(1),
    items: [
      { name: 'Tapsilog', quantity: 1, unit_price: 120 },
      { name: 'Iced Tea', quantity: 1, unit_price: 45 },
      { name: 'Extra Rice', quantity: 1, unit_price: 20 },
      { name: 'Coke Regular', quantity: 1, unit_price: 40 },
    ],
  },
  {
    id: 1002, order_number: 'ORD-1002', status: 'completed', payment_method: 'gcash',
    total_amount: 175, created_at: hrsAgo(2),
    items: [
      { name: 'Longsilog', quantity: 1, unit_price: 110 },
      { name: 'Bottled Water', quantity: 1, unit_price: 25 },
      { name: 'Extra Egg', quantity: 1, unit_price: 20 },
    ],
  },
  {
    id: 1003, order_number: 'ORD-1003', status: 'preparing', payment_method: 'cash',
    total_amount: 285, created_at: hrsAgo(0.25),
    items: [
      { name: 'Sinigang Set', quantity: 1, unit_price: 150 },
      { name: 'Iced Tea', quantity: 1, unit_price: 45 },
      { name: 'Lumpiang Shanghai', quantity: 1, unit_price: 65 },
    ],
  },
  {
    id: 1004, order_number: 'ORD-1004', status: 'completed', payment_method: 'cash',
    total_amount: 130, created_at: hrsAgo(3),
    items: [
      { name: 'Goto', quantity: 1, unit_price: 85 },
      { name: 'Extra Rice', quantity: 1, unit_price: 20 },
      { name: 'Hot Coffee', quantity: 1, unit_price: 60 },
    ],
  },
  {
    id: 1005, order_number: 'ORD-1005', status: 'cancelled', payment_method: 'cash',
    total_amount: 110, created_at: hrsAgo(4),
    items: [
      { name: 'Tocilog', quantity: 1, unit_price: 110 },
    ],
  },
];

let orderCounter = 1006;

// Mock inventory
let MOCK_INVENTORY = [
  { id: 1,  name: 'Beef Tapa',       unit: 'g',   current_stock: 2400, reorder_level: 500  },
  { id: 2,  name: 'Longganisa',      unit: 'pcs', current_stock: 80,   reorder_level: 20   },
  { id: 3,  name: 'Tocino',          unit: 'g',   current_stock: 1800, reorder_level: 400  },
  { id: 4,  name: 'Bangus',          unit: 'pcs', current_stock: 12,   reorder_level: 10   },
  { id: 5,  name: 'Spam',            unit: 'can', current_stock: 4,    reorder_level: 6    },
  { id: 6,  name: 'Corned Beef',     unit: 'can', current_stock: 18,   reorder_level: 6    },
  { id: 7,  name: 'Chicken',         unit: 'g',   current_stock: 3200, reorder_level: 800  },
  { id: 8,  name: 'Pork',            unit: 'g',   current_stock: 0,    reorder_level: 600  },
  { id: 9,  name: 'Eggs',            unit: 'pcs', current_stock: 55,   reorder_level: 24   },
  { id: 10, name: 'Jasmine Rice',    unit: 'kg',  current_stock: 22,   reorder_level: 5    },
  { id: 11, name: 'Garlic',          unit: 'g',   current_stock: 350,  reorder_level: 150  },
  { id: 12, name: 'Cooking Oil',     unit: 'ml',  current_stock: 1200, reorder_level: 500  },
  { id: 13, name: 'Soy Sauce',       unit: 'ml',  current_stock: 800,  reorder_level: 300  },
  { id: 14, name: 'Calamansi',       unit: 'pcs', current_stock: 30,   reorder_level: 20   },
  { id: 15, name: 'Tamarind',        unit: 'g',   current_stock: 0,    reorder_level: 100  },
  { id: 16, name: 'Rice Noodles',    unit: 'g',   current_stock: 900,  reorder_level: 250  },
  { id: 17, name: 'Spring Roll Wrap',unit: 'pcs', current_stock: 60,   reorder_level: 30   },
  { id: 18, name: 'Ground Pork',     unit: 'g',   current_stock: 1100, reorder_level: 300  },
  { id: 19, name: 'Ginger',          unit: 'g',   current_stock: 180,  reorder_level: 80   },
  { id: 20, name: 'Brewed Coffee',   unit: 'g',   current_stock: 450,  reorder_level: 100  },
];

// ─── HELPER: simulate network delay ──────────────────────────────────────────
const delay = (ms = 300) => new Promise((res) => setTimeout(res, ms));

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Token helpers — keys match AuthContext and socket.js
export const tokenStorage = {
  getAccess:   () => localStorage.getItem('bingnondo_access_token'),
  getRefresh:  () => localStorage.getItem('bingnondo_refresh_token'),
  setTokens:   (access, refresh) => {
    localStorage.setItem('bingnondo_access_token', access);
    localStorage.setItem('bingnondo_refresh_token', refresh);
  },
  clearTokens: () => localStorage.clear(),
  saveUser:    (user) => localStorage.setItem('bingnondo_user', JSON.stringify(user)),
  getUser:     () => { try { return JSON.parse(localStorage.getItem('bingnondo_user')); } catch { return null; } },
};

// Core fetch wrapper with auto-refresh on 401
let _isRefreshing = false;
let _refreshQueue = [];

async function apiRequest(endpoint, options = {}, retry = true) {
  const accessToken = tokenStorage.getAccess();
  const headers = {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const refreshToken = tokenStorage.getRefresh();
    if (!refreshToken) { tokenStorage.clearTokens(); window.location.href = '/login'; return; }

    if (_isRefreshing) {
      return new Promise((resolve, reject) => { _refreshQueue.push({ resolve, reject, endpoint, options }); });
    }
    _isRefreshing = true;
    try {
      const rRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!rRes.ok) throw new Error('Refresh failed');
      const { accessToken: newAccess, refreshToken: newRefresh } = await rRes.json();
      tokenStorage.setTokens(newAccess, newRefresh);
      _refreshQueue.forEach(({ resolve, reject, endpoint: ep, options: opts }) => {
        apiRequest(ep, opts, false).then(resolve).catch(reject);
      });
      _refreshQueue = [];
      return apiRequest(endpoint, options, false);
    } catch {
      tokenStorage.clearTokens();
      _refreshQueue.forEach(({ reject }) => reject(new Error('Session expired')));
      _refreshQueue = [];
      window.location.href = '/login';
    } finally {
      _isRefreshing = false;
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Match the error shape the existing pages expect: err.response.data.message
    const error = new Error(data.message || 'Something went wrong.');
    error.response = { data, status: res.status };
    throw error;
  }
  // Wrap in { data } to match the shape the existing pages expect
  return { data };
}

export const authAPI = {
  staffLogin: async ({ email, password }) => {
    const res = await apiRequest('/auth/staff/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    // Store tokens on successful login
    tokenStorage.setTokens(res.data.accessToken, res.data.refreshToken);
    tokenStorage.saveUser(res.data.user);
    return res;
  },

  forgotPassword: (email) =>
    apiRequest('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),

  resetPassword: (data) =>
    apiRequest('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),

  me: () => apiRequest('/auth/me'),

  logout: async () => {
    try { await apiRequest('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    tokenStorage.clearTokens();
    return { data: { message: 'Logged out.' } };
  },
};

// ─── MENU (cashier read) ──────────────────────────────────────────────────────
export const menuAPI = {
  getAll: async () => {
    await delay(400);
    return { data: { categories: MOCK_CATEGORIES, items: MOCK_MENU_ITEMS } };
  },
};

// ─── ORDERS ───────────────────────────────────────────────────────────────────
export const ordersAPI = {
  create: async (payload) => {
    await delay(500);
    const newOrder = {
      id: orderCounter,
      order_number: `ORD-${orderCounter}`,
      status: 'confirmed',
      payment_method: null,
      total_amount: payload.items.reduce((sum, i) => {
        const menuItem = MOCK_MENU_ITEMS.find((m) => m.id === i.menu_item_id);
        return sum + (menuItem?.price || 0) * i.quantity;
      }, 0),
      created_at: new Date().toISOString(),
      items: payload.items.map((i) => {
        const menuItem = MOCK_MENU_ITEMS.find((m) => m.id === i.menu_item_id);
        return { name: menuItem?.name || 'Unknown', quantity: i.quantity, unit_price: menuItem?.price || 0 };
      }),
    };
    MOCK_ORDERS = [newOrder, ...MOCK_ORDERS];
    orderCounter++;
    return { data: newOrder };
  },

  updateItems: async (orderId, items) => {
    await delay(350);
    const order = MOCK_ORDERS.find((o) => o.id === orderId);
    if (!order) throw { response: { data: { message: 'Order not found.' } } };
    order.items = items.map((i) => {
      const menuItem = MOCK_MENU_ITEMS.find((m) => m.id === i.menu_item_id);
      return { name: menuItem?.name || 'Unknown', quantity: i.quantity, unit_price: menuItem?.price || 0 };
    });
    order.total_amount = order.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    return { data: order };
  },

  getMyTransactions: async () => {
    await delay(400);
    return { data: MOCK_ORDERS };
  },

  getAll: async () => {
    await delay(400);
    return { data: MOCK_ORDERS };
  },

  getById: async (id) => {
    await delay(200);
    const order = MOCK_ORDERS.find((o) => o.id === Number(id));
    if (!order) throw { response: { status: 404, data: { message: 'Order not found.' } } };
    return { data: order };
  },
};

// ─── PAYMENT VERIFICATION MOCK DATA (§4.0) ────────────────────────────────────
// Staff-side: review GCash receipts before orders hit the kitchen.

let MOCK_PENDING_PAYMENTS = [
  {
    id: 2001,
    order_id: 2001,
    order_number: 'ORD-2001',
    customer_id: 201,
    customer_name: 'Liza Ramos',
    customer_mobile: '+63 917 555 0101',
    total_amount: 265,
    payment_status: 'awaiting_verification',
    gcash_ref_number: '9876543210',
    receipt_image_url: null,
    submitted_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    rejection_reason: null,
    items: [
      { name: 'Tapsilog',   quantity: 1, unit_price: 120 },
      { name: 'Iced Tea',   quantity: 2, unit_price: 45  },
      { name: 'Extra Rice', quantity: 1, unit_price: 20  },
    ],
  },
  {
    id: 2002,
    order_id: 2002,
    order_number: 'ORD-2002',
    customer_id: 202,
    customer_name: 'Dante Cruz',
    customer_mobile: '+63 918 555 0202',
    total_amount: 150,
    payment_status: 'awaiting_verification',
    gcash_ref_number: null,  // OCR failed
    receipt_image_url: null,
    submitted_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    rejection_reason: null,
    items: [
      { name: 'Sinigang Set', quantity: 1, unit_price: 150 },
    ],
  },
  {
    id: 2003,
    order_id: 2003,
    order_number: 'ORD-2003',
    customer_id: 203,
    customer_name: 'Grace Mendoza',
    customer_mobile: '+63 919 555 0303',
    total_amount: 320,
    payment_status: 'rejected',
    gcash_ref_number: '1234567890',
    receipt_image_url: null,
    submitted_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    rejection_reason: 'Blurry screenshot',
    items: [
      { name: 'Bangsilog',    quantity: 1, unit_price: 130 },
      { name: 'Longsilog',    quantity: 1, unit_price: 110 },
      { name: 'Coke Regular', quantity: 1, unit_price: 40  },
      { name: 'Extra Egg',    quantity: 2, unit_price: 20  },
    ],
  },
  {
    id: 2004,
    order_id: 2004,
    order_number: 'ORD-2004',
    customer_id: 204,
    customer_name: 'Mark Tan',
    customer_mobile: '+63 920 555 0404',
    total_amount: 75,
    payment_status: 'awaiting_verification',
    gcash_ref_number: '5566778899',
    receipt_image_url: null,
    submitted_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    rejection_reason: null,
    items: [
      { name: 'Pancit Bihon', quantity: 1, unit_price: 75 },
    ],
  },
];

// ─── PAYMENT VERIFICATION API (§4.0) ─────────────────────────────────────────
// Backend is ready — using real API endpoints.
const PV_USE_REAL_API = true;

export const paymentVerificationAPI = {
  /**
   * GET /api/payments/pending
   * Returns all orders with payment_status in ('awaiting_verification', 'rejected')
   * that staff must act on before they can proceed to the kitchen.
   */
  getPending: async () => {
    if (PV_USE_REAL_API) {
      return apiRequest('/payments/pending');
    }
    await delay(450);
    return { data: { payments: [...MOCK_PENDING_PAYMENTS] } };
  },

  /**
   * POST /api/payments/:orderId/verify
   * Staff confirms the GCash receipt is valid.
   * Backend: sets payment.status = 'paid', order.status = 'confirmed',
   *          emits Socket.io `new_order` → Kitchen Display.
   */
  verify: async (orderId) => {
    if (PV_USE_REAL_API) {
      return apiRequest(`/payments/${orderId}/verify`, { method: 'POST' });
    }
    await delay(500);
    const idx = MOCK_PENDING_PAYMENTS.findIndex(p => p.id === orderId);
    if (idx === -1) {
      const err = new Error('Payment record not found.');
      err.response = { data: { message: 'Payment record not found.' }, status: 404 };
      throw err;
    }
    MOCK_PENDING_PAYMENTS.splice(idx, 1);
    return { data: { success: true, message: 'Payment verified. Order sent to kitchen.' } };
  },

  /**
   * POST /api/payments/:orderId/reject
   * Staff rejects the receipt — customer is notified to re-upload.
   * Body: { reason: string }
   */
  reject: async (orderId, reason) => {
    if (PV_USE_REAL_API) {
      return apiRequest(`/payments/${orderId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    }
    await delay(400);
    const payment = MOCK_PENDING_PAYMENTS.find(p => p.id === orderId);
    if (!payment) {
      const err = new Error('Payment record not found.');
      err.response = { data: { message: 'Payment record not found.' }, status: 404 };
      throw err;
    }
    payment.payment_status   = 'rejected';
    payment.rejection_reason = reason;
    return { data: { success: true, message: 'Receipt rejected. Customer notified.' } };
  },
};

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
export const paymentsAPI = {
  process: async ({ order_id, method }) => {
    await delay(600);
    const order = MOCK_ORDERS.find((o) => o.id === Number(order_id));
    if (order) {
      order.status = 'completed';
      order.payment_method = method || 'cash';
    }
    return { data: { success: true, message: 'Payment processed.' } };
  },
};

// ─── INVENTORY (§4.1) ─────────────────────────────────────────────────────────
export const inventoryAPI = {
  /** GET /api/inventory — all items with is_low_stock flag */
  getAll: () => apiRequest('/inventory'),

  /** POST /api/inventory/:id/transaction — restock / adjustment / deduction */
  transaction: (id, payload) =>
    apiRequest(`/inventory/${id}/transaction`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** GET /api/inventory/:id/transactions — movement history */
  getTransactions: (id) => apiRequest(`/inventory/${id}/transactions`),

  /** POST /api/inventory — create a new ingredient */
  create: (payload) =>
    apiRequest('/inventory', { method: 'POST', body: JSON.stringify(payload) }),

  /** POST /api/inventory/:id/out-of-stock — force to 0 + cascade menu unavailability */
  outOfStock: (id) =>
    apiRequest(`/inventory/${id}/out-of-stock`, { method: 'POST' }),
};

// ─── STAFF MENU (§4.2) — full CRUD, separate from cashier read-only ───────────
export const staffMenuAPI = {
  /** GET /api/menu/staff — enriched with category_name + ingredients[] */
  getAll: () => apiRequest('/menu/staff'),

  /** POST /api/menu — create item + optional ingredient links */
  create: (payload) =>
    apiRequest('/menu', { method: 'POST', body: JSON.stringify(payload) }),

  /** PUT /api/menu/:id — full update; replaces ingredient list if provided */
  update: (id, payload) =>
    apiRequest(`/menu/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  /** PATCH /api/menu/:id/availability — manual toggle, independent of stock */
  setAvailability: (id, is_available) =>
    apiRequest(`/menu/${id}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ is_available }),
    }),

  /** DELETE /api/menu/:id */
  remove: (id) => apiRequest(`/menu/${id}`, { method: 'DELETE' }),
};

// ─── CATEGORIES (§4.2) ────────────────────────────────────────────────────────
export const categoriesAPI = {
  /** GET /api/menu/categories */
  getAll: () => apiRequest('/menu/categories'),

  /** POST /api/menu/categories — Body: { name } */
  create: (name) =>
    apiRequest('/menu/categories', { method: 'POST', body: JSON.stringify({ name }) }),

  /** DELETE /api/menu/categories/:id */
  remove: (id) => apiRequest(`/menu/categories/${id}`, { method: 'DELETE' }),
};

// ─── UPLOAD API ───────────────────────────────────────────────────────────────
// Uses a raw fetch (no Content-Type override) so the browser sets the
// multipart/form-data boundary automatically.
async function uploadRequest(endpoint, formData) {
  const accessToken = tokenStorage.getAccess();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Upload failed.');
    err.response = { status: res.status, data };
    throw err;
  }
  return { data };
}

export const uploadAPI = {
  /**
   * Upload a menu item photo to Cloudinary.
   * @param {File} file  — the image File object from the input
   * @returns {{ data: { url: string, public_id: string } }}
   */
  uploadMenuImage: (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return uploadRequest('/upload/menu-image', fd);
  },

  /**
   * Delete a menu item photo from Cloudinary.
   * @param {string} public_id  — e.g. 'bingnondo/menu/abc123'
   */
  deleteMenuImage: (public_id) =>
    apiRequest('/upload/menu-image', {
      method: 'DELETE',
      body: JSON.stringify({ public_id }),
    }),
};

export default { authAPI, menuAPI, ordersAPI, paymentsAPI, inventoryAPI, staffMenuAPI, categoriesAPI, uploadAPI };
// ─── KITCHEN ──────────────────────────────────────────────────────────────────
export const kitchenAPI = {
  getOrders: () => apiClient.get('/api/kitchen/orders'),

  acknowledgeOrder: (orderId) =>
    apiClient.patch(`/api/kitchen/orders/${orderId}/acknowledge`),

  updateOrderStatus: (orderId, status) =>
    apiClient.patch(`/api/kitchen/orders/${orderId}/status`, { status }),

  getAlerts: () => apiClient.get('/api/kitchen/alerts'),

  acknowledgeAlert: (alertId) =>
    apiClient.post(`/api/kitchen/alerts/${alertId}/acknowledge`),
};

// ─── ADMIN API ─────────────────────────────────────────────────────────────────
// Mock data — replace with real API calls when backend is ready.

let MOCK_STAFF_ACCOUNTS = [
  { id: 101, full_name: 'Maria Santos',   email: 'maria@bingnondo.com',  role: 'cashier',       status: 'active',   created_at: new Date(Date.now()-86400000*10).toISOString() },
  { id: 102, full_name: 'Juan Dela Cruz', email: 'juan@bingnondo.com',   role: 'kitchen_staff', status: 'active',   created_at: new Date(Date.now()-86400000*20).toISOString() },
  { id: 103, full_name: 'Ana Reyes',      email: 'ana@bingnondo.com',    role: 'staff',         status: 'inactive', created_at: new Date(Date.now()-86400000*30).toISOString() },
  { id: 104, full_name: 'Pedro Bautista', email: 'pedro@bingnondo.com',  role: 'cashier',       status: 'active',   created_at: new Date(Date.now()-86400000*5).toISOString()  },
  { id: 105, full_name: 'Rosa Mendoza',   email: 'rosa@bingnondo.com',   role: 'owner',         status: 'active',   created_at: new Date(Date.now()-86400000*60).toISOString() },
];
let staffAccountCounter = 200;

// MOCK_SETTINGS removed — business_hours and menu_categories now use real API endpoints.

let MOCK_DEVICES = [
  { id: 1, device_code: 'ESP32-KITCHEN-01', location_label: 'Main Kitchen', is_online: true  },
  { id: 2, device_code: 'ESP32-TABLE-01',   location_label: 'Table Counter', is_online: false },
];
let deviceCounter = 10;

let MOCK_AUDIT_LOG = [
  { id: 1, actor_id:1, actor_name:'System Admin', actor_role:'admin', action:'create',         target_type:'staff_account', target_id:101, details:{ role:'cashier' },              created_at: new Date(Date.now()-86400000*10).toISOString() },
  { id: 2, actor_id:1, actor_name:'System Admin', actor_role:'admin', action:'register_device',target_type:'esp32_device',  target_id:1,   details:{ label:'Main Kitchen' },        created_at: new Date(Date.now()-86400000*8).toISOString()  },
  { id: 3, actor_id:1, actor_name:'System Admin', actor_role:'admin', action:'update_settings',target_type:'settings',       target_id:null, details:{ field:'business_hours' },   created_at: new Date(Date.now()-86400000*5).toISOString()  },
  { id: 4, actor_id:1, actor_name:'System Admin', actor_role:'admin', action:'deactivate',     target_type:'staff_account', target_id:103, details:{ reason:'resignation' },        created_at: new Date(Date.now()-86400000*2).toISOString()  },
  { id: 5, actor_id:1, actor_name:'System Admin', actor_role:'admin', action:'reset_password', target_type:'staff_account', target_id:104, details:{},                              created_at: new Date(Date.now()-3600000).toISOString()     },
];
let auditCounter = 100;

function addAuditEntry(action, targetType, targetId, details={}) {
  MOCK_AUDIT_LOG.unshift({
    id: ++auditCounter, actor_id:1, actor_name:'System Admin', actor_role:'admin',
    action, target_type:targetType, target_id:targetId, details,
    created_at: new Date().toISOString(),
  });
}

function paginate(arr, page=1, limit=10) {
  const start = (page-1)*limit;
  return { data: arr.slice(start, start+limit), totalPages: Math.max(1, Math.ceil(arr.length/limit)), total: arr.length };
}


// ─── SWITCH DASHBOARD API ─────────────────────────────────────────────────────
// These hit the real backend — no mock needed.
export const switchAPI = {
  /** GET /api/auth/staff/switch-options — dashboards this staff can switch to */
  getOptions: () => apiRequest('/auth/staff/switch-options'),

  /** POST /api/auth/staff/switch-dashboard — perform the switch */
  switch: (body) =>
    apiRequest('/auth/staff/switch-dashboard', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** POST /api/auth/staff/switch-pin/update — staff updates own PIN */
  updatePin: (body) =>
    apiRequest('/auth/staff/switch-pin/update', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ─── ADMIN API (real backend — replaces mock) ─────────────────────────────────
export const adminAPI = {
  // ── Staff Accounts ──────────────────────────────────────────────────────────
  listStaffAccounts: (params = {}) => {
    const q = new URLSearchParams();
    if (params.page)   q.set('page',   params.page);
    if (params.limit)  q.set('limit',  params.limit);
    if (params.search) q.set('search', params.search);
    if (params.role)   q.set('role',   params.role);
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    return apiRequest(`/admin/staff-accounts${qs ? `?${qs}` : ''}`);
  },

  getStaffAccount: (id) =>
    apiRequest(`/admin/staff-accounts/${id}`),

  createStaffAccount: (data) =>
    apiRequest('/admin/staff-accounts', {
      method: 'POST',
      body: JSON.stringify({
        full_name: data.full_name,
        email:     data.email,
        password:  data.temp_password,   // backend expects 'password'
        role:      data.role,
      }),
    }),

  updateStaffStatus: (id, status) =>
    apiRequest(`/admin/staff-accounts/${id}/status`, {
      method: 'PATCH',
      // Frontend passes 'inactive', backend expects 'deactivated'
      body: JSON.stringify({ status: status === 'inactive' ? 'deactivated' : status }),
    }),

  resetStaffPassword: (id, new_password) =>
    apiRequest(`/admin/staff-accounts/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ new_password }),
    }),

  // ── Dashboard Access ────────────────────────────────────────────────────────
  getDashboardAccess: (id) =>
    apiRequest(`/admin/staff-accounts/${id}/dashboard-access`),

  setDashboardAccess: (id, dashboards) =>
    apiRequest(`/admin/staff-accounts/${id}/dashboard-access`, {
      method: 'PUT',
      body: JSON.stringify({ dashboards }),
    }),

  // ── Switch PIN (admin sets for staff) ───────────────────────────────────────
  setStaffSwitchPin: (id, pin) =>
    apiRequest(`/admin/staff-accounts/${id}/switch-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  removeStaffSwitchPin: (id) =>
    apiRequest(`/admin/staff-accounts/${id}/switch-pin`, { method: 'DELETE' }),

  // ── Switch Config ───────────────────────────────────────────────────────────
  getSwitchConfig: () =>
    apiRequest('/admin/switch-config'),

  setPerStaffSwitchConfig: (staffId, requires_pin) =>
    apiRequest(`/admin/switch-config/per-staff/${staffId}`, {
      method: 'PUT',
      body: JSON.stringify({ requires_pin }),
    }),

  setPerDashboardSwitchConfig: (dashboard, requires_pin) =>
    apiRequest(`/admin/switch-config/per-dashboard/${dashboard}`, {
      method: 'PUT',
      body: JSON.stringify({ requires_pin }),
    }),

  // ── Audit Log ───────────────────────────────────────────────────────────────
  getAuditLog: (params = {}) => {
    const q = new URLSearchParams();
    if (params.page)       q.set('page',        params.page);
    if (params.limit)      q.set('limit',        params.limit);
    if (params.actor_id)   q.set('actor_id',     params.actor_id);
    if (params.action)     q.set('action',        params.action);
    if (params.from)       q.set('from',          params.from);
    if (params.to)         q.set('to',            params.to);
    const qs = q.toString();
    return apiRequest(`/admin/audit-log${qs ? `?${qs}` : ''}`);
  },

  // ── Business Hours ──────────────────────────────────────────────────────────
  getBusinessHours: () =>
    apiRequest('/admin/system-settings/business-hours'),

  saveBusinessHours: (hours) =>
    apiRequest('/admin/system-settings/business-hours', {
      method: 'PUT',
      body: JSON.stringify({ hours }),
    }),

  // ── Menu Categories ─────────────────────────────────────────────────────────
  listCategories: () =>
    apiRequest('/admin/system-settings/menu-categories'),

  createCategory: (name) =>
    apiRequest('/admin/system-settings/menu-categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  deleteCategory: (id) =>
    apiRequest(`/admin/system-settings/menu-categories/${id}`, {
      method: 'DELETE',
    }),

  // ── ESP32 Devices ───────────────────────────────────────────────────────────
  listDevices: () =>
    apiRequest('/admin/system-settings/esp32-devices'),

  registerDevice: (data) =>
    apiRequest('/admin/system-settings/esp32-devices', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeDevice: (id) =>
    apiRequest(`/admin/system-settings/esp32-devices/${id}`, {
      method: 'DELETE',
    }),
};

export const deliveryAPI = {
  /** GET /api/deliveries — all deliveries for staff view */
  getAll: async () => {
    await delay(400);
    return { data: { deliveries: [...MOCK_DELIVERIES] } };
  },

  /** POST /api/deliveries/:id/assign — assign rider or book Lalamove */
  assign: async (id, payload) => {
    await delay(500);
    const delivery = MOCK_DELIVERIES.find((d) => d.id === id);
    if (!delivery) throw { response: { data: { message: 'Delivery not found.' } } };

    delivery.status = 'assigned';
    delivery.delivery_preference = payload.delivery_preference;

    if (payload.delivery_preference === 'lalamove') {
      // Simulate Lalamove booking ID
      delivery.lalamove_booking_id = `LLM-${Date.now().toString().slice(-8)}`;
    } else {
      delivery.rider_name    = payload.rider_name;
      delivery.rider_contact = payload.rider_contact;
    }

    return { data: { ...delivery } };
  },

  /** PATCH /api/deliveries/:id/status — update delivery status */
  updateStatus: async (id, status) => {
    await delay(350);
    const delivery = MOCK_DELIVERIES.find((d) => d.id === id);
    if (!delivery) throw { response: { data: { message: 'Delivery not found.' } } };
    delivery.status = status;
    return { data: { ...delivery } };
  },
};

// ─── SUPPORT CHAT API (§4.5) ──────────────────────────────────────────────────
export const supportChatAPI = {
  /** GET /api/support-chat/threads — all threads (staff view) */
  getThreads: (params = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.customer_id) query.set('customer_id', params.customer_id);
    const qs = query.toString();
    return apiClient.get(`/api/support-chat/threads${qs ? `?${qs}` : ''}`);
  },

  /** GET /api/support-chat/threads/:chatId/messages */
  getMessages: (chatId) =>
    apiClient.get(`/api/support-chat/threads/${chatId}/messages`),

  /** POST /api/support-chat/reply — staff sends a reply */
  sendMessage: (payload) =>
    apiClient.post('/api/support-chat/reply', {
      chat_id:          payload.chat_id,
      content:          payload.message_text,   // backend uses `content`
      related_order_id: payload.related_order_id || null,
    }),
};