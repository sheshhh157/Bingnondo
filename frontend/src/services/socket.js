import { io } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ─── Role → socket room ───────────────────────────────────────────────────────
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

/**
 * connectSocket(room)
 * ───────────────────
 * Connects the shared socket and joins a room.
 * Safe to call multiple times — idempotent:
 *   - If already connected → emits 'join' immediately
 *   - If connecting       → queues 'join' on the next 'connect' event
 *   - If disconnected     → connects, then joins
 */
export const connectSocket = (room) => {
  const s = getSocket();

  const joinRoom = () => {
    if (room) s.emit('join', { room });
  };

  if (s.connected) {
    // Already connected — join right away
    joinRoom();
  } else {
    // Not connected yet — join as soon as it connects
    // Use 'once' so we don't double-join on reconnects
    s.once('connect', joinRoom);
    if (!s.active) {
      // Only call connect() if not already in the middle of connecting
      s.connect();
    }
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
  NEW_ORDER:           'new_order',
  ORDER_STATUS_UPDATE: 'order_status_update',
  KITCHEN_ALERT:       'kitchen_alert',
};