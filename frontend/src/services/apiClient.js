/**
 * apiClient.js — Real HTTP client for the Bingnondo backend.
 *
 * Shared login:
 *   POST /api/auth/login handles both Staff and Rider.
 *   Backend checks staff_accounts first, then riders.
 *   Response: { accessToken, refreshToken, user: { type: 'staff'|'rider', role?, ... } }
 *
 * Handles:
 *   - Automatic Bearer JWT attachment
 *   - Silent token refresh on 401 (one retry per request)
 *   - auth:expired event dispatch so AuthContext can redirect to /login
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const TOKEN_KEY   = 'bingnondo_access_token';
const REFRESH_KEY = 'bingnondo_refresh_token';

export function getToken()        { return localStorage.getItem(TOKEN_KEY); }
export function getRefreshToken() { return localStorage.getItem(REFRESH_KEY); }
export function setTokens(access, refresh) {
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

let isRefreshing = false;
let refreshQueue = [];

function processQueue(token, error = null) {
  refreshQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
  refreshQueue = [];
}

async function silentRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token.');

  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) throw new Error('Refresh failed.');
  const body = await res.json();
  setTokens(body.accessToken, body.refreshToken);
  return body.accessToken;
}

async function request(method, path, body = null, retry = true) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body !== null) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, options);

  if (res.status === 401 && retry) {
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      }).then(() => request(method, path, body, false));
    }

    isRefreshing = true;
    try {
      await silentRefresh();
      processQueue(true);
      return request(method, path, body, false);
    } catch (err) {
      processQueue(null, err);
      clearTokens();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw err;
    } finally {
      isRefreshing = false;
    }
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.message || `Request failed: ${res.status}`);
    err.status = res.status;
    err.response = { data, status: res.status };
    throw err;
  }

  return data;
}

export const get   = (path)       => request('GET',    path);
export const post  = (path, body) => request('POST',   path, body);
export const put   = (path, body) => request('PUT',    path, body);
export const patch = (path, body) => request('PATCH',  path, body);
export const del   = (path)       => request('DELETE', path);

/**
 * authClient — called by AuthContext.
 *
 * login() uses the shared endpoint POST /api/auth/login.
 * Backend resolves whether the credentials belong to a staff member
 * or a rider and returns the appropriate JWT type in user.type.
 *
 * Response shape: { accessToken, refreshToken, user, message }
 *   user.type: 'staff' | 'rider'
 *   user.role: 'cashier' | 'kitchen_staff' | 'staff' | 'owner' | 'admin' (staff only, undefined for rider)
 */
export const authClient = {
  login: async (credentials) => {
    // Use request() with retry=false so a 401 (wrong credentials) is treated
    // as a plain error — NOT as an expired token that triggers auth:expired + reload.
    const res = await request('POST', '/api/auth/login', credentials, false);
    // res = { accessToken, refreshToken, user, message }
    setTokens(res.accessToken, res.refreshToken);
    return res;
  },
  logout: async () => {
    try { await post('/api/auth/logout', {}); } catch { /* ignore */ }
    clearTokens();
  },
  me: () => get('/api/auth/me'),
};

export default { get, post, put, patch, del, authClient };