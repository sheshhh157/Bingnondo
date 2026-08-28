import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Attach JWT token on every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('bingnondo_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle token expiry — attempt refresh, else redirect to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('bingnondo_refresh_token');
        const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken });
        localStorage.setItem('bingnondo_access_token', data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authAPI = {
  staffLogin: (credentials) => api.post('/api/auth/staff/login', credentials),
  logout: () => api.post('/api/auth/logout'),
};

// ─── Menu ────────────────────────────────────────────────────────────────────
export const menuAPI = {
  getAll: () => api.get('/api/menu'),
};

// ─── Orders ──────────────────────────────────────────────────────────────────
export const ordersAPI = {
  create: (payload) => api.post('/api/orders', payload),
  getAll: (params) => api.get('/api/orders', { params }),
  getById: (id) => api.get(`/api/orders/${id}`),
  getMyTransactions: () => api.get('/api/orders', { params: { cashier_id: 'me' } }),
};

// ─── Payments ────────────────────────────────────────────────────────────────
export const paymentsAPI = {
  process: (payload) => api.post('/api/payments', payload),
};

export default api;