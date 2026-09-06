// ─── SHARED HTTP CLIENT ────────────────────────────────────────────────────
// Points the cashier / kitchen / staff roles at the Express backend (port
// 5000 via the Vite /api proxy) so all roles share one live data store.
// If the backend is unreachable the returned promise rejects with an
// OfflineError so callers can fall back to local mock data (offline demo).
// Responses are expected to use the { data: <payload> } envelope, which the
// server wraps to match the existing mock shape ({ data: payload }).

import axios from 'axios';

const http = axios.create({
  baseURL: '/api',
  timeout: 4000,
});

let backendUp = true;
let lastProbeAt = 0;
// While the backend is down, retry every few seconds so a recovered server
// is picked back up instead of serving mock data forever.
const PROBE_INTERVAL_MS = 15000;

export class OfflineError extends Error {
  constructor() {
    super('Backend is offline.');
    this.name = 'OfflineError';
  }
}

function isNetworkError(err) {
  return !err?.response || err?.code === 'ECONNABORTED' || err?.message?.includes('Network Error');
}

export function isOfflineError(err) {
  return err?.name === 'OfflineError' || isNetworkError(err);
}

function canUseBackend() {
  if (backendUp) return true;
  return Date.now() - lastProbeAt >= PROBE_INTERVAL_MS;
}

async function request(method, path, body) {
  if (!canUseBackend()) throw new OfflineError();
  try {
    const res = await http.request({ method, url: path, data: body });
    backendUp = true;
    return res.data;
  } catch (err) {
    // Old/stale backend that doesn't know these routes yet — treat as offline
    if (err.response?.status === 404 && err.response?.data?.message === 'Endpoint not found.') {
      backendUp = false;
      lastProbeAt = Date.now();
      throw new OfflineError();
    }
    if (isNetworkError(err)) {
      backendUp = false;
      lastProbeAt = Date.now();
      throw new OfflineError();
    }
    throw err;
  }
}

/**
 * Try the network path; on OfflineError fall back to the supplied mock fn.
 * Non-network errors (4xx/5xx) are propagated so the UI can show them.
 */
export async function orMock(networkFn, mockFn) {
  try {
    return await networkFn();
  } catch (err) {
    if (isOfflineError(err)) return mockFn();
    throw err;
  }
}

export const httpGet = (path) => request('get', path);
export const httpPost = (path, body) => request('post', path, body);
export const httpPatch = (path, body) => request('patch', path, body);
export const httpDelete = (path) => request('delete', path);

export default { httpGet, httpPost, httpPatch, httpDelete, orMock, isOfflineError };