import { io } from 'socket.io-client';

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

export const getSocket = () => {
  if (!socket) {
    const token = localStorage.getItem('bingnondo_access_token');
    socket = io(BASE_URL, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: false,
    });
  }
  return socket;
};

export const connectSocket = (room) => {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
    if (room) {
      s.once('connect', () => s.emit('join', { room }));
    }
  }
  return s;
};

export const disconnectSocket = () => {
  if (socket?.connected) {
    socket.disconnect();
    socket = null;
  }
};

export default getSocket;
// ─── Kitchen-specific socket event names ──────────────────────────────────────
export const KITCHEN_EVENTS = {
  NEW_ORDER:          'new_order',
  ORDER_STATUS_UPDATE:'order_status_update',
  KITCHEN_ALERT:      'kitchen_alert',
};