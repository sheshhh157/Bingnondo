/**
 * apiClient.js — Real HTTP client adapted to the Bingnondo backend.
 *
 * Key differences vs the generic version:
 *  - Auth responses are NOT wrapped in { data: ... }
 *    Backend returns: { accessToken, refreshToken, user, message }
 *  - JWT payload uses { sub, type, role } — not { id, email, role }
 *  - All other endpoints return their own shapes (see per-module comments)
 *
 * Handles:
 *  - Automatic Bearer JWT attachment
 *  - Silent token refresh on 401 (one retry per request)
 *  - auth:expired event dispatch so AuthContext can redirect to /login
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
  // Response shape: { accessToken, refreshToken }
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

  // 401 → try silent token refresh once
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

export const get   = (path)         => request('GET',    path);
export const post  = (path, body)   => request('POST',   path, body);
export const put   = (path, body)   => request('PUT',    path, body);
export const patch = (path, body)   => request('PATCH',  path, body);
export const del   = (path)         => request('DELETE', path);

/**
 * authClient — called by AuthContext.
 *
 * staffLogin returns the raw response shape from the backend:
 *   { accessToken, refreshToken, user, message }
 * (no { data: ... } wrapper — different from mock api.js)
 */
export const authClient = {
  staffLogin: async (credentials) => {
    const res = await post('/api/auth/staff/login', credentials);
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