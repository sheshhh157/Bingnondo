import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { SOCKET_ROOM_BY_ROLE, getSocket, onSocketCreated, getLastHandshakeToken } from '../services/socket';
import { getToken } from '../services/apiClient';

const SocketContext = createContext(null);
const SocketEventContext = createContext(null);

// The singleton lives in services/socket.js so every page shares one
// connection. This context only wires React state + event fan-out on top.
let globalSocket = null;

/** Room for whoever is signed in right now, or null when signed out. */
function currentRoom() {
  try {
    const stored = localStorage.getItem('bingnondo_user');
    if (!stored) return null;
    return SOCKET_ROOM_BY_ROLE[JSON.parse(stored)?.role] ?? null;
  } catch {
    // Malformed storage — treat it as signed out rather than throwing.
    return null;
  }
}

/** Room the backend token-checks. Only this one is auth-gated today. */
const MANAGER_ROOM = 'manager';

function reauthenticate(socket) {
  const token = getToken() ?? null;
  if (token && token === getLastHandshakeToken()) return false;
  // The socket's auth callback re-reads the live token on every connection
  // attempt, so forcing a reconnect re-runs the handshake with fresh
  // credentials. No-ops when the token already matches what was presented.
  socket.disconnect();
  socket.connect();
  return true;
}

/**
 * Re-join the room for the signed-in user.
 *
 * Room membership does not survive a reconnect or a page reload, and the
 * manager pages depend on room-scoped events (order:new, order:status,
 * inventory:update, menu_update) — so this runs on every `connect`. It is also
 * called after login, which is the only way a role change on the same tab
 * lands the socket in a different room.
 */
export function joinSocketRoom(socket = globalSocket) {
  const room = currentRoom();
  if (!room || !socket) return;

  // The `manager` room is granted from the handshake token, so an already-open
  // socket authenticated as nobody (or as a previous user) has to reconnect
  // before the join will be honoured.
  if (room === MANAGER_ROOM) {
    if (reauthenticate(socket)) return;
  }
  socket.emit('join', { room });
}

/**
 * Drop the manager room on sign-out.
 *
 * Without this, logging out in the same tab left the socket connected and still
 * in the `manager` room: the client discarded the tokens, but the server never
 * re-checked, so a signed-out tab kept receiving operational events and the next
 * sign-in as a non-manager would not have been moved out of the room.
 *
 * Manager-only by design — the cashier/staff/kitchen sockets are torn down by
 * `disconnectSocket()` in services/socket.js and are not touched here.
 */
export function leaveManagerRoom(socket = globalSocket) {
  if (!socket) return;
  socket.emit('leave', { room: MANAGER_ROOM });
}

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  // Direct subscribers. `lastEvent` above is a single slot, so two events
  // arriving before React commits collapse into one and the earlier payload is
  // lost for every consumer. Anything that must see *every* event (the data
  // pipeline in useLiveData) subscribes here instead, outside React state.
  const listenersRef = useRef(new Set());

  const subscribe = useCallback((listener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  useEffect(() => {
    let cleanup = null;

    // Attach React state wiring to whatever instance services/socket.js owns.
    // Called for the existing instance below and for every future one — a new
    // instance appears after logout (services singleton torn down) and login
    // (recreated), both handled here.
    const wire = (socket) => {
      if (!socket) return;
      socketRef.current = socket;
      globalSocket = socket;
      setConnected(socket.connected);

      const onConnect = () => {
        setConnected(true);
        // Rooms are derived server-side from the handshake token; this join
        // only covers provider-created reconnects before login in the tab.
        joinSocketRoom(socket);
      };
      const onDisconnect = () => setConnected(false);

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('connect_error', onDisconnect);

      const listeners = listenersRef.current;
      const capture = (name) => (payload) => {
        setLastEvent({ name, payload });
        for (const listener of listeners) listener(name, payload);
      };
      const captured = [
        'order:new', 'order:status', 'order:ready', 'inventory:update',
        'delivery:update', 'delivery:new', 'menu_update', 'menu_item_deleted',
      ];
      const handlers = captured.map((name) => [name, capture(name)]);
      for (const [name, fn] of handlers) socket.on(name, fn);

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('connect_error', onDisconnect);
        for (const [name, fn] of handlers) socket.off(name, fn);
      };
    };

    const offCreated = onSocketCreated((socket) => {
      if (cleanup) cleanup();
      cleanup = wire(socket);
    });

    const existing = getSocket();
    cleanup = wire(existing);
    // The provider may pre-date login; only open the handshake when a session
    // exists so logged-out tabs don't generate an 'unauthorized' retry loop.
    if (getToken()) existing.connect();

    // Drop the provider's room when the session dies mid-tab.
    const onAuthExpired = () => {
      getSocket()?.emit('leave', { room: MANAGER_ROOM });
    };
    window.addEventListener('auth:expired', onAuthExpired);

    return () => {
      offCreated();
      if (cleanup) cleanup();
      window.removeEventListener('auth:expired', onAuthExpired);
    };
  }, []);

  const emit = useCallback((event, payload) => {
    globalSocket?.emit(event, payload);
  }, []);

  const socketValue = useMemo(() => ({ connected, emit }), [connected, emit]);
  const eventValue = useMemo(() => ({ lastEvent, subscribe }), [lastEvent, subscribe]);

  return (
    <SocketContext.Provider value={socketValue}>
      <SocketEventContext.Provider value={eventValue}>
        {children}
      </SocketEventContext.Provider>
    </SocketContext.Provider>
  );
}

export const useSocketContext = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocketContext must be used within SocketProvider');
  return ctx;
};

export const useSocketEvent = (name) => {
  const { lastEvent } = useContext(SocketEventContext);
  const { connected } = useContext(SocketContext);
  const [payload, setPayload] = useState(null);
  const prevName = useRef(name);

  useEffect(() => {
    if (prevName.current !== name) {
      setPayload(null);
      prevName.current = name;
    }
    if (lastEvent && lastEvent.name === name) {
      setPayload(lastEvent.payload);
    }
  }, [lastEvent, name]);

  return { payload, connected };
};

export const useSocketEventContext = () => {
  const ctx = useContext(SocketEventContext);
  if (!ctx) throw new Error('useSocketEventContext must be used within SocketProvider');
  return ctx;
};