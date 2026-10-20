import apiClient from './apiClient';

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const BASE_URL = `${import.meta.env.VITE_API_URL || ''}/api`;

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

  /** PUT /api/inventory/:id — edit ingredient details + stock
   *  (name, unit, current_stock, reorder_level, category_ids[]) */
  update: (id, payload) =>
    apiRequest(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

  /** POST /api/inventory/:id/out-of-stock */
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

// ─── KITCHEN ──────────────────────────────────────────────────────────────────
export const kitchenAPI = {
  getOrders: () => apiClient.get('/api/kitchen/orders'),

  acknowledgeOrder: (orderId) =>
    apiClient.patch(`/api/kitchen/orders/${orderId}/acknowledge`),

  updateOrderStatus: (orderId, status) =>
    apiClient.patch(`/api/kitchen/orders/${orderId}/status`, { status }),
};

// ─── ADMIN API ────────────────────────────────────────────────────────────────
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

  updateStaffAccount: (id, data) =>
    apiRequest(`/admin/staff-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        full_name: data.full_name,
        email:     data.email,
        role:      data.role,
      }),
    }),

  deleteStaffAccount: (id) =>
    apiRequest(`/admin/staff-accounts/${id}`, {
      method: 'DELETE',
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

  updateCategory: (id, name) =>
    apiRequest(`/admin/system-settings/menu-categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteCategory: (id) =>
    apiRequest(`/admin/system-settings/menu-categories/${id}`, {
      method: 'DELETE',
    }),

  setCategoryVariants: (id, groupIds) =>
    apiRequest(`/admin/system-settings/menu-categories/${id}/variants`, {
      method: 'PUT',
      body: JSON.stringify({ group_ids: groupIds }),
    }),

  // ── Item Variants (reusable variant groups) ─────────────────────────────────
  listVariantGroups: () =>
    apiRequest('/admin/system-settings/variants'),

createVariantGroup: (name, maxOptions) =>
  apiRequest('/admin/system-settings/variants', {
    method: 'POST',
    body: JSON.stringify({ name, max_options: maxOptions }),
  }),

updateVariantGroup: (id, name, maxOptions) =>
  apiRequest(`/admin/system-settings/variants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, max_options: maxOptions }),
  }),

  deleteVariantGroup: (id) =>
    apiRequest(`/admin/system-settings/variants/${id}`, {
      method: 'DELETE',
    }),

  // ── Notifications ───────────────────────────────────────────────────────────
  getNotifications: (params = {}) => {
    const q = new URLSearchParams();
    if (params.limit)      q.set('limit', params.limit);
    if (params.categories) q.set('categories', params.categories);
    const qs = q.toString();
    return apiRequest(`/admin/notifications${qs ? `?${qs}` : ''}`);
  },

  markNotificationsSeen: () =>
    apiRequest('/admin/notifications/seen', { method: 'POST' }),

  getNotificationSettings: () =>
    apiRequest('/admin/system-settings/notifications'),

  saveNotificationSettings: (categories) =>
    apiRequest('/admin/system-settings/notifications', {
      method: 'PUT',
      body: JSON.stringify({ categories }),
    }),

  // ── Customer Restrictions ────────────────────────────────────────────────────
  listCustomerRestrictions: (params = {}) => {
    const q = new URLSearchParams();
    if (params.page)              q.set('page',              params.page);
    if (params.limit)             q.set('limit',             params.limit);
    if (params.search)            q.set('search',            params.search);
    if (params.restriction_level) q.set('restriction_level', params.restriction_level);
    if (params.account_status)    q.set('account_status',    params.account_status);
    if (params.flagged)           q.set('flagged',           '1');
    const qs = q.toString();
    return apiRequest(`/admin/customer-restrictions${qs ? `?${qs}` : ''}`);
  },

  getCustomerViolations: (customerId) =>
    apiRequest(`/admin/customer-restrictions/${customerId}/violations`),

  overrideCustomerRestriction: (customerId, { restriction_level, reason }) =>
    apiRequest(`/admin/customer-restrictions/${customerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ restriction_level, reason }),
    }),

  updateCustomerAccountStatus: (customerId, { status, reason }) =>
    apiRequest(`/admin/customer-restrictions/${customerId}/account-status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }),

};

// ─── RIDER MANAGEMENT API (§6.5 — Admin) ─────────────────────────────────────
export const adminRidersAPI = {
  /** GET /api/admin/riders — list all riders
   *  Accepts either a status string (legacy) or a params object { page, limit, search, status }
   */
  getAll: (params) => {
    const query = new URLSearchParams();
    if (params && typeof params === 'object') {
      if (params.page)   query.set('page',   params.page);
      if (params.limit)  query.set('limit',  params.limit);
      if (params.search) query.set('search', params.search);
      if (params.status) query.set('status', params.status);
    } else if (params) {
      query.set('status', params);
    }
    const qs = query.toString();
    return apiClient.get(`/api/admin/riders${qs ? `?${qs}` : ''}`);
  },

  /** GET /api/admin/riders/:id — single rider */
  getById: (id) => apiClient.get(`/api/admin/riders/${id}`),

  /** POST /api/admin/riders — create new rider
   *  The form collects a "temporary password" under `temp_password`; the
   *  backend expects `password`, so it is mapped here (same as the staff
   *  wrapper). Without this the password is dropped and the account is
   *  created with a NULL hash that can never sign in.
   */
  create: (payload) => apiClient.post('/api/admin/riders', {
    full_name:     payload.full_name,
    mobile_number: payload.mobile_number,
    email:         payload.email,
    plate_number:  payload.plate_number,
    vehicle_type:  payload.vehicle_type,
    notes:         payload.notes,
    password:      payload.temp_password,
  }),

  /** PUT /api/admin/riders/:id — update rider info
   *  Only the editable columns are sent; `temp_password` is not part of the
   *  update contract (use resetPassword instead) and is dropped here.
   */
  update: (id, payload) => apiClient.put(`/api/admin/riders/${id}`, {
    full_name:     payload.full_name,
    mobile_number: payload.mobile_number,
    email:         payload.email,
    plate_number:  payload.plate_number,
    vehicle_type:  payload.vehicle_type,
    notes:         payload.notes,
  }),

  /** PATCH /api/admin/riders/:id/status — activate or deactivate */
  updateStatus: (id, status) =>
    apiClient.patch(`/api/admin/riders/${id}/status`, { status }),

  /** POST /api/admin/riders/:id/reset-password — admin resets password */
  resetPassword: (id, password) =>
    apiClient.post(`/api/admin/riders/${id}/reset-password`, { password }),

  /** DELETE /api/admin/riders/:id — permanently remove a rider */
  remove: (id) => apiClient.del(`/api/admin/riders/${id}`),
};

// ─── ADMIN DELIVERIES API ─────────────────────────────────────────────────────
export const adminDeliveriesAPI = {
  /** GET /api/admin/deliveries — read-only delivery list
   *  params: { page, limit, search, status }
   */
  getAll: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page)   query.set('page',   params.page);
    if (params.limit)  query.set('limit',  params.limit);
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    const qs = query.toString();
    return apiClient.get(`/api/admin/deliveries${qs ? `?${qs}` : ''}`);
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
