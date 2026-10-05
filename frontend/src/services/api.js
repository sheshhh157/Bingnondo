import apiClient from './apiClient';
// ─── MOCK DATA ────────────────────────────────────────────────────────────────
// NOTE: several mock APIs were removed here (menuAPI, ordersAPI, categoriesAPI,
// authAPI). They had no importers and were superseded by cashierApi.js /
// apiClient.js. `customerRestrictionsAPI` is also un-exported: CustomerRestrictions
// .jsx reaches it through the adminAPI alias further down.

// Relative timestamps for the delivery/chat mocks still in use.
const today = new Date();
const hrsAgo = (h) => new Date(today.getTime() - h * 60 * 60 * 1000).toISOString();

// ─── HELPER: simulate network delay ──────────────────────────────────────────
const delay = (ms = 300) => new Promise((res) => setTimeout(res, ms));

// ─── HTTP ─────────────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Token helpers — keys match AuthContext and socket.js
const tokenStorage = {
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

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
// Deliberately NOT mocked. A silent mock here once made the cashier's
// "Mark Paid" print a receipt while writing nothing to the database — no payment
// row, no kitchen_alerts row, no ESP32 buzzer — and it failed invisibly for
// days. Import `paymentsAPI` from './cashierApi' instead.
export const paymentsAPI = {
  process: async () => {
    throw new Error(
      'paymentsAPI.process is not mocked. Import paymentsAPI from services/cashierApi.'
    );
  },
};

// ─── INVENTORY (§4.1) ─────────────────────────────────────────────────────────
export const inventoryAPI = {
  /** GET /api/inventory — all items with is_low_stock flag */
  getAll: () => apiRequest('/inventory'),

  /** GET /api/menu/categories — the same categories the menu uses, so the
   *  inventory filter and the add-ingredient form share one vocabulary.
   *  An ingredient may hold several at once; see `category_ids`. */
  getCategories: () => apiRequest('/menu/categories'),

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

  /** PATCH /api/inventory/:id — edit name / unit / categories (never stock).
   *  category_ids replaces the whole set; omit it to leave tags untouched. */
  update: (id, payload) =>
    apiRequest(`/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  /** POST /api/inventory/:id/out-of-stock — force to 0 + cascade menu unavailability */
  outOfStock: (id) =>
    apiRequest(`/inventory/${id}/out-of-stock`, { method: 'POST' }),

  /** DELETE /api/inventory/:id — remove an ingredient (cascades recipe links + history) */
  remove: (id) => apiRequest(`/inventory/${id}`, { method: 'DELETE' }),
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

  // Per-option endpoints. The modal edits the whole list through create/update
  // above; these exist for changing one variant without resending the item.
  /** POST /api/menu/:id/options */
  addOption: (id, payload) =>
    apiRequest(`/menu/${id}/options`, { method: 'POST', body: JSON.stringify(payload) }),

  /** PUT /api/menu/:id/options/:optionId */
  updateOption: (id, optionId, payload) =>
    apiRequest(`/menu/${id}/options/${optionId}`, { method: 'PUT', body: JSON.stringify(payload) }),

  /** DELETE /api/menu/:id/options/:optionId — archives, never erases */
  removeOption: (id, optionId) =>
    apiRequest(`/menu/${id}/options/${optionId}`, { method: 'DELETE' }),
};

// ─── KITCHEN ──────────────────────────────────────────────────────────────────
export const kitchenAPI = {
  getOrders: () => apiClient.get('/api/kitchen/orders'),

  acknowledgeOrder: (orderId) =>
    apiClient.patch(`/api/kitchen/orders/${orderId}/acknowledge`),

  updateOrderStatus: (orderId, status) =>
    apiClient.patch(`/api/kitchen/orders/${orderId}/status`, { status }),

  getAlerts: () => apiClient.get('/api/kitchen/alerts'),

  getDevices: () => apiClient.get('/api/kitchen/devices'),

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

let MOCK_SETTINGS = {
  paymongo_key:    '',
  openai_key:      '',
  gemini_key:      '',
  business_hours:  {
    Monday:    { open:'07:00', close:'22:00', closed:false },
    Tuesday:   { open:'07:00', close:'22:00', closed:false },
    Wednesday: { open:'07:00', close:'22:00', closed:false },
    Thursday:  { open:'07:00', close:'22:00', closed:false },
    Friday:    { open:'07:00', close:'23:00', closed:false },
    Saturday:  { open:'08:00', close:'23:00', closed:false },
    Sunday:    { open:'08:00', close:'21:00', closed:false },
  },
  menu_categories: [
    'Rice Meals', 'Appetizers', 'Drinks (Caffeinated)', 'Drinks (Non-Caffeinated)',
    'Drinks (Student)', 'Student Meal', 'Student Platter',
  ],
};

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

// Not exported: CustomerRestrictions.jsx reaches these through the adminAPI alias below.
const customerRestrictionsAPI = {
  listCustomerRestrictions: async ({ page = 1, limit = 12, search, restriction_level } = {}) => {
    await delay(350);
    let result = [...MOCK_CUSTOMER_RESTRICTIONS];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.customer_name.toLowerCase().includes(q) ||
        c.customer_email.toLowerCase().includes(q)
      );
    }
    if (restriction_level) result = result.filter(c => c.restriction_level === restriction_level);
    return { data: paginate(result, page, limit) };
  },

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

// ─── DELIVERY API (§4.3) ──────────────────────────────────────────────────────
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
// ─── SUPPORT CHAT MOCK DATA (§4.4) ────────────────────────────────────────────
let MOCK_CHAT_THREADS = [
  {
    id: 1,
    customer_id: 101,
    customer_name: 'Maria Santos',
    customer_email: 'maria.santos@email.com',
    status: 'unlocked',
    last_message_text: 'Kamusta na yung order ko? Matagal na eh',
    last_message_at: hrsAgo(0.08),
    active_order_number: 'ORD-1003',
    active_orders: [
      { id: 1003, order_number: 'ORD-1003', status: 'out_for_delivery', items: [{ quantity: 1, name: 'Tapsilog', price: 120 }, { quantity: 2, name: 'Iced Tea', price: 45 }] },
    ],
  },
  {
    id: 2,
    customer_id: 102,
    customer_name: 'Jose Reyes',
    customer_email: 'jose.reyes@email.com',
    status: 'unlocked',
    last_message_text: 'Hi! May extra chili ba kayo?',
    last_message_at: hrsAgo(0.25),
    active_order_number: 'ORD-1004',
    active_orders: [
      { id: 1004, order_number: 'ORD-1004', status: 'preparing', items: [{ quantity: 1, name: 'Sinigang Set', price: 150 }, { quantity: 1, name: 'Extra Rice', price: 20 }] },
    ],
  },
  {
    id: 3,
    customer_id: 103,
    customer_name: 'Ana Cruz',
    customer_email: 'ana.cruz@email.com',
    status: 'unlocked',
    last_message_text: 'Okay lang siya, salamat!',
    last_message_at: hrsAgo(0.5),
    active_order_number: 'ORD-1005',
    active_orders: [
      { id: 1005, order_number: 'ORD-1005', status: 'assigned', items: [{ quantity: 2, name: 'Longsilog', price: 110 }] },
    ],
  },
  {
    id: 4,
    customer_id: 104,
    customer_name: 'Pedro Lim',
    customer_email: 'pedro.lim@email.com',
    status: 'unlocked',
    last_message_text: 'Pwede bang baguhin yung address?',
    last_message_at: hrsAgo(1),
    active_order_number: 'ORD-1006',
    active_orders: [
      { id: 1006, order_number: 'ORD-1006', status: 'confirmed', items: [{ quantity: 1, name: 'Fried Chicken', price: 135 }, { quantity: 1, name: 'Coke Regular', price: 40 }] },
    ],
  },
  {
    id: 5,
    customer_id: 105,
    customer_name: 'Rosa Villanueva',
    customer_email: 'rosa.v@email.com',
    status: 'locked',
    last_message_text: 'Okay, salamat po! Masarap talaga.',
    last_message_at: hrsAgo(2.5),
    active_order_number: null,
    active_orders: [],
  },
  {
    id: 6,
    customer_id: 106,
    customer_name: 'Tony Uy',
    customer_email: 'tony.uy@email.com',
    status: 'locked',
    last_message_text: 'Sige po, noted. Salamat!',
    last_message_at: hrsAgo(5),
    active_order_number: null,
    active_orders: [],
  },
];

let MOCK_CHAT_MESSAGES = {
  1: [
    { id: 1, chat_id: 1, sender_type: 'customer', sender_name: 'Maria Santos', message_text: 'Hello po! May order po ako.', related_order_number: 'ORD-1003', sent_at: hrsAgo(0.5) },
    { id: 2, chat_id: 1, sender_type: 'staff',    sender_name: 'Staff',        message_text: 'Hello Maria! Noted po ang order mo. Ilalabas na namin agad.', related_order_number: null, sent_at: hrsAgo(0.45) },
    { id: 3, chat_id: 1, sender_type: 'customer', sender_name: 'Maria Santos', message_text: 'Sige po, salamat! Gaano katagal?', related_order_number: null, sent_at: hrsAgo(0.3) },
    { id: 4, chat_id: 1, sender_type: 'staff',    sender_name: 'Staff',        message_text: 'Mga 20-30 minutes po, naka-assign na ang rider.', related_order_number: 'ORD-1003', sent_at: hrsAgo(0.25) },
    { id: 5, chat_id: 1, sender_type: 'customer', sender_name: 'Maria Santos', message_text: 'Kamusta na yung order ko? Matagal na eh', related_order_number: 'ORD-1003', sent_at: hrsAgo(0.08) },
  ],
  2: [
    { id: 6, chat_id: 2, sender_type: 'customer', sender_name: 'Jose Reyes', message_text: 'Hi! May extra chili ba kayo?', related_order_number: 'ORD-1004', sent_at: hrsAgo(0.25) },
  ],
  3: [
    { id: 7, chat_id: 3, sender_type: 'customer', sender_name: 'Ana Cruz', message_text: 'Pwede bang magpalit ng item?', related_order_number: 'ORD-1005', sent_at: hrsAgo(1) },
    { id: 8, chat_id: 3, sender_type: 'staff',    sender_name: 'Staff',      message_text: 'Hi Ana! Pasensya na po, naka-prepare na kasi. Hindi na ma-change.', related_order_number: 'ORD-1005', sent_at: hrsAgo(0.9) },
    { id: 9, chat_id: 3, sender_type: 'customer', sender_name: 'Ana Cruz', message_text: 'Okay lang siya, salamat!', related_order_number: null, sent_at: hrsAgo(0.5) },
  ],
  4: [
    { id: 10, chat_id: 4, sender_type: 'customer', sender_name: 'Pedro Lim', message_text: 'Pwede bang baguhin yung address?', related_order_number: 'ORD-1006', sent_at: hrsAgo(1) },
  ],
  5: [
    { id: 11, chat_id: 5, sender_type: 'customer', sender_name: 'Rosa Villanueva', message_text: 'Natanggap ko na yung order ko!', related_order_number: null, sent_at: hrsAgo(3) },
    { id: 12, chat_id: 5, sender_type: 'staff',    sender_name: 'Staff',            message_text: 'Salamat po Rosa! Ulit ulit po kayo.', related_order_number: null, sent_at: hrsAgo(2.8) },
    { id: 13, chat_id: 5, sender_type: 'customer', sender_name: 'Rosa Villanueva', message_text: 'Okay, salamat po! Masarap talaga.', related_order_number: null, sent_at: hrsAgo(2.5) },
  ],
  6: [
    { id: 14, chat_id: 6, sender_type: 'customer', sender_name: 'Tony Uy', message_text: 'Pwede bang i-cancel?', related_order_number: null, sent_at: hrsAgo(6) },
    { id: 15, chat_id: 6, sender_type: 'staff',    sender_name: 'Staff',     message_text: 'Hi Tony! Na-cancel na po. Pasensya sa abala.', related_order_number: null, sent_at: hrsAgo(5.5) },
    { id: 16, chat_id: 6, sender_type: 'customer', sender_name: 'Tony Uy', message_text: 'Sige po, noted. Salamat!', related_order_number: null, sent_at: hrsAgo(5) },
  ],
};

let msgCounter = 17;

// ─── SUPPORT CHAT API (§4.4) ──────────────────────────────────────────────────
export const supportChatAPI = {
  /** GET /api/support-chat/threads — all threads (staff view) */
  getThreads: async () => {
    await delay(400);
    return { data: { threads: [...MOCK_CHAT_THREADS] } };
  },

  /** GET /api/support-chat/:chatId/messages */
  getMessages: async (chatId) => {
    await delay(350);
    const messages = MOCK_CHAT_MESSAGES[chatId] || [];
    return { data: { messages: [...messages] } };
  },

  /** POST /api/support-chat/message */
  sendMessage: async (payload) => {
    await delay(300);
    const { chat_id, message_text, sender_type, related_order_id } = payload;

    const thread = MOCK_CHAT_THREADS.find((t) => t.id === chat_id);
    if (!thread) throw { response: { data: { message: 'Thread not found.' } } };
    if (thread.status === 'locked') throw { response: { data: { message: 'Thread is locked.' } } };

    const newMsg = {
      id: msgCounter++,
      chat_id,
      sender_type: sender_type || 'staff',
      sender_name: sender_type === 'customer' ? thread.customer_name : 'Staff',
      message_text,
      related_order_number: related_order_id
        ? thread.active_orders?.find((o) => o.id === related_order_id)?.order_number || null
        : null,
      sent_at: new Date().toISOString(),
    };

    if (!MOCK_CHAT_MESSAGES[chat_id]) MOCK_CHAT_MESSAGES[chat_id] = [];
    MOCK_CHAT_MESSAGES[chat_id] = [...MOCK_CHAT_MESSAGES[chat_id], newMsg];

    // Update thread preview
    thread.last_message_text = message_text;
    thread.last_message_at   = newMsg.sent_at;

    return { data: { message: newMsg } };
  },
};