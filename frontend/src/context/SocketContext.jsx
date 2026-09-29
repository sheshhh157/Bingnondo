import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_ROOM_BY_ROLE } from '../services/socket';
import { getToken } from '../services/apiClient';

const SocketContext = createContext(null);
const SocketEventContext = createContext(null);

// Module-level singleton to survive React StrictMode double-mount and HMR
let globalSocket = null;
let globalSocketInitPromise = null;

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

/**
 * The token this socket last presented on a connection attempt.
 *
 * The `manager` room is derived server-side from the handshake token, and that
 * token is only read when a connection is established. `SocketProvider` mounts
 * app-wide, so on a same-tab login the socket is *already connected* from the
 * pre-login anonymous session — `auth: cb => ...` never runs again, and the
 * manager room join is refused. Tracking the last-used token lets
 * `joinSocketRoom` notice the mismatch and force a reconnect, which re-runs the
 * handshake with the new credentials.
 */
let lastHandshakeToken = null;

/**
 * Point the socket at the current token and force a fresh connection so the
 * server re-evaluates the handshake. No-ops when nothing changed.
 *
 * Scoped to the `manager` room on purpose: cashier/staff/kitchen join
 * unauthenticated and are unaffected.
 */
function reauthenticate(socket) {
  const token = getToken() ?? null;
  if (token && token === lastHandshakeToken) return false;
  lastHandshakeToken = token;
  if (token) {
    // `socket.auth` as an object is only read on the next connection attempt,
    // which is exactly the one we're about to force.
    socket.auth = { token };
  } else {
    delete socket.auth;
  }
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
  lastHandshakeToken = null;
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
    // Reuse existing socket if already initialized
    if (globalSocket) {
      socketRef.current = globalSocket;
      setConnected(globalSocket.connected);
      return;
    }

    // If initialization is in progress, wait for it
    if (globalSocketInitPromise) {
      globalSocketInitPromise.then((socket) => {
        socketRef.current = socket;
        globalSocket = socket;
        setConnected(socket.connected);
      });
      return;
    }

    // First initialization
    globalSocketInitPromise = (async () => {
      const socket = io(window.location.origin, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        // The backend derives the `manager` room from this token, so it has to
        // be the live one on every connection attempt — not the value captured
        // at construction. `apiClient` silently rotates the access token while
        // the tab is open, and a reconnect re-runs this callback.
        auth: (cb) => {
          const token = getToken() ?? null;
          lastHandshakeToken = token;
          cb(token ? { token } : {});
        },
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      socketRef.current = socket;
      globalSocket = socket;

      socket.on('connect', () => {
        setConnected(true);
        // The backend auto-joins the `manager` room from the handshake token, so
        // this emit is belt-and-braces. It is kept because the room is lost on
        // every reconnect and a refresh never goes through login().
        //
        // `joinSocketRoom` may instead force a reconnect when the handshake
        // token is stale (same-tab sign-in). Re-entering here is safe: by then
        // `lastHandshakeToken` matches, so `reauthenticate` declines.
        joinSocketRoom(socket);
      });
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', () => setConnected(false));

      // An access token that expires mid-session is unrecoverable — the refresh
      // token is gone too, so `apiClient` will sign the user out. Drop the
      // room now instead of streaming events to a dead session; the app's
      // redirect follows immediately after.
      const onAuthExpired = () => {
        lastHandshakeToken = null;
        socket.emit('leave', { room: MANAGER_ROOM });
      };
      window.addEventListener('auth:expired', onAuthExpired);

      const listeners = listenersRef.current;
      const capture = (name) => (payload) => {
        setLastEvent({ name, payload });
        for (const listener of listeners) listener(name, payload);
      };
      socket.on('order:new', capture('order:new'));
      socket.on('order:status', capture('order:status'));
      socket.on('order:ready', capture('order:ready'));
      socket.on('inventory:update', capture('inventory:update'));
      socket.on('delivery:update', capture('delivery:update'));
      socket.on('delivery:new', capture('delivery:new'));
      socket.on('menu_update', capture('menu_update'));
      socket.on('menu_item_deleted', capture('menu_item_deleted'));

      return socket;
    })();

    return () => {
      // Don't disconnect on unmount - keep singleton alive
      socketRef.current = null;
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