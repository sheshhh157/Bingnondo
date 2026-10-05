import { io } from 'socket.io-client';
import { refreshAccessToken, clearTokens, getToken } from './apiClient';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ─── Role → socket room ───────────────────────────────────────────────────────
// Mirrors the rooms documented in backend/src/sockets/index.js. Kept here (not
// inline in AuthContext) so the socket provider can re-derive the room from
// storage on every connect — including after a page refresh, which never goes
// through the login flow.
export const SOCKET_ROOM_BY_ROLE = {
  cashier:       'cashier',
  kitchen_staff: 'kitchen',
  staff:         'staff',
  owner:         'manager',
  admin:         'manager',
  manager:       'manager',
};

let socket = null;
const createdCbs = new Set();
let lastHandshakeToken = null;
export const getLastHandshakeToken = () => lastHandshakeToken;

/** Notified whenever services/socket.js creates a fresh instance (first
 * connect, or after disconnectSocket() + the next call to getSocket()). */
export const onSocketCreated = (cb) => {
  createdCbs.add(cb);
  return () => createdCbs.delete(cb);
};

/** Resolves true once the socket fires 'connect', false on either a
 *  connect_error or a 5s timeout. One-shot per try. */
function attemptConnect(socket) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok, detached) => {
      if (settled) return;
      settled = true;
      detached();
      resolve(ok);
    };
    const detach = () => {
      socket.off('connect', onConn);
      socket.off('connect_error', onErr);
    };
    const onConn = () => settle(true, detach);
    const onErr = () => settle(false, detach);
    socket.once('connect', onConn);
    socket.once('connect_error', onErr);
    socket.connect();
    setTimeout(() => onErr(), 5000);
  });
}

export const getSocket = () => {
  if (!socket) {
    socket = io(BASE_URL, {
      // The token is re-read on every (re)connect — apiClient rotates the
      // access token while the tab is open, and the server derives rooms from
      // it on each handshake.
      auth: (cb) => {
        lastHandshakeToken = getToken() ?? localStorage.getItem('bingnondo_access_token');
        cb({ token: lastHandshakeToken });
      },
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // A handshake rejection with 'unauthorized' means the access token lapsed:
    // refresh once and retry. If the refresh fails the session is dead — tell
    // the app to sign out rather than hammering the server. refreshAccessToken
    // dedupes with any in-flight refresh the HTTP layer is already running.
    socket.on('connect_error', async (err) => {
      if (err?.message !== 'unauthorized') return;
      try {
        await refreshAccessToken();
        socket.connect();
      } catch {
        clearTokens();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    });

    // The server disconnects us when the access token expires mid-session
    // ('io server disconnect'). Socket.IO does NOT reconnect for this reason,
    // so we do it: refresh, reconnect, and on repeated failure back off
    // 1s -> 2s -> 5s steady. Counter resets on a successful connect.
    let reconnectAttempts = 0;
    let reconnectTimer = null;

    socket.on('disconnect', async (reason) => {
      if (reason !== 'io server disconnect') return;
      window.dispatchEvent(new CustomEvent('socket:reconnecting'));
      for (;;) {
        try {
          await refreshAccessToken();
        } catch {
          // Refresh failed: the session is gone. Give up, clear, and let the
          // app sign out.
          clearTokens();
          window.dispatchEvent(new CustomEvent('auth:expired'));
          return;
        }
        const ok = await attemptConnect(socket);
        if (ok) {
          reconnectAttempts = 0;
          return; // the 'connect' listener already reports socket:reconnected
        }
        window.dispatchEvent(new CustomEvent('socket:reconnecting'));
        reconnectAttempts += 1;
        const delay = reconnectAttempts <= 1 ? 1000 : reconnectAttempts === 2 ? 2000 : 5000;
        await new Promise((r) => { reconnectTimer = setTimeout(r, delay); });
      }
    });

    socket.on('connect', () => {
      reconnectAttempts = 0;
      window.dispatchEvent(new CustomEvent('socket:reconnected'));
    });

    createdCbs.forEach((cb) => cb(socket));
  }
  return socket;
};

export const connectSocket = (room) => {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
    // Server auto-joins the caller's rooms from the token; this is kept so a
    // stale-tab path re-asserts the same room explicitly. A room outside the
    // caller's allowed list is ignored server-side.
    if (room) s.once('connect', () => s.emit('join', { room }));
  }
  return s;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default getSocket;
// ─── Kitchen-specific socket event names ──────────────────────────────────────
export const KITCHEN_EVENTS = {
  NEW_ORDER:          'new_order',
  ORDER_STATUS_UPDATE:'order:status',
  KITCHEN_ALERT:      'kitchen_alert',
  KITCHEN_ALERT_ACK:  'kitchen_alert:ack',
};
