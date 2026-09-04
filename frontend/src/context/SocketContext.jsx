import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);
const SocketEventContext = createContext(null);

// Module-level singleton to survive React StrictMode double-mount and HMR
let globalSocket = null;
let globalSocketInitPromise = null;

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);

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
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      socketRef.current = socket;
      globalSocket = socket;

      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', () => setConnected(false));

      const capture = (name) => (payload) => setLastEvent({ name, payload });
      socket.on('order:new', capture('order:new'));
      socket.on('order:status', capture('order:status'));
      socket.on('order:ready', capture('order:ready'));
      socket.on('inventory:update', capture('inventory:update'));
      socket.on('delivery:update', capture('delivery:update'));
      socket.on('delivery:new', capture('delivery:new'));

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
  const eventValue = useMemo(() => ({ lastEvent }), [lastEvent]);

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

  return { payload, connected: true };
};

export const useSocketEventContext = () => {
  const ctx = useContext(SocketEventContext);
  if (!ctx) throw new Error('useSocketEventContext must be used within SocketProvider');
  return ctx;
};