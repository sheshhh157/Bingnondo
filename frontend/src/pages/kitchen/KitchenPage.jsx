import { useState, useEffect, useReducer, useCallback } from 'react';
import { kitchenAPI } from '../../services/api';
import { getSocket, KITCHEN_EVENTS } from '../../services/socket';
import KitchenHeader from './components/KitchenHeader';
import OrderColumn from './components/OrderColumn';
import OrderCard from './components/OrderCard';
import ConnectionStatus from './components/ConnectionStatus';
import '../../styles/KitchenPage.css';

// ─── Reducers ────────────────────────────────────────────────────────────────
function ordersReducer(state, action) {
  switch (action.type) {
    case 'LOAD': return action.payload;
    case 'ADD': {
      const exists = state.some((o) => o.id === action.payload.id);
      return exists ? state : [action.payload, ...state];
    }
    case 'UPDATE_STATUS':
      return state
        .map((o) => o.id === action.id ? { ...o, status: action.status } : o)
        // Keep order visible while it's still active; drop once ready/cancelled/completed
        .filter((o) => ['pending', 'confirmed', 'preparing'].includes(o.status));
    default: return state;
  }
}

// ─── Sound ───────────────────────────────────────────────────────────────────
function playAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // Web Audio is best-effort: a blocked/unsupported context must not break the queue.
  }
}

const LOAD_RETRY_MS = 5000;

function describeLoadError(err) {
  const apiMessage = err?.response?.data?.message;
  const status = err?.status ?? err?.response?.status;
  if (apiMessage) return `${apiMessage} — retrying automatically…`;
  if (status) return `Couldn't load orders (HTTP ${status}) — retrying automatically…`;
  const message = err?.message || '';
  if (err instanceof TypeError && /fetch|network|load failed/i.test(message)) {
    return "Couldn't reach the server — retrying automatically…";
  }
  return `${message || "Couldn't load orders."} — retrying automatically…`;
}

// ─── First-load skeleton ─────────────────────────────────────────────────────
function KitchenSkeleton() {
  return (
    <div className="kp-display kp-skeleton">
      <span className="kp-sr-only" role="status" aria-live="polite">Loading kitchen queue…</span>

      <section className="kp-banner" aria-hidden="true">
        <div className="kp-banner__header">
          <span className="kp-skel kp-skel--line" />
        </div>
        <div className="kp-banner__cards">
          <div className="kp-skel kp-skel--card" />
          <div className="kp-skel kp-skel--card" />
          <div className="kp-skel kp-skel--card" />
        </div>
      </section>

      <div className="kp-split" aria-hidden="true">
        <div className="kp-skel kp-skel--column" />
        <div className="kp-divider" />
        <div className="kp-skel kp-skel--column" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function KitchenPage() {
  const [orders, dispatchOrders] = useReducer(ordersReducer, []);
  const [connected, setConnected] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [ackAllLoading, setAckAllLoading] = useState(false);
  const [ackAllError, setAckAllError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function tryLoad() {
      try {
        const ordersRes = await kitchenAPI.getOrders();
        const ordersData = ordersRes?.data ?? ordersRes ?? [];
        if (cancelled) return;
        dispatchOrders({ type: 'LOAD', payload: Array.isArray(ordersData) ? ordersData : [] });
        setError(null);
        setPageLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(describeLoadError(err));
        setPageLoading(false);
        timer = setTimeout(tryLoad, LOAD_RETRY_MS);
      }
    }

    tryLoad();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [reloadKey]);

  // Socket.io
  useEffect(() => {
    const socket = getSocket();
    let hadConnected = socket.connected;

    socket.on('connect', () => {
      setConnected(true);
      setReconnecting(false);
      if (hadConnected) setReloadKey((k) => k + 1);
      hadConnected = true;
    });
    socket.on('disconnect',       () => setConnected(false));
    socket.on('reconnecting',     () => setReconnecting(true));
    socket.on('reconnect_failed', () => setReconnecting(false));

    // New order arrives — backend only emits this for GCash orders
    // after staff verifies the receipt (payment verified → confirmed).
    socket.on(KITCHEN_EVENTS.NEW_ORDER, (order) => {
      dispatchOrders({ type: 'ADD', payload: order });
      playAlert();
    });

    socket.on(KITCHEN_EVENTS.ORDER_STATUS_UPDATE, ({ orderId, status }) => {
      dispatchOrders({ type: 'UPDATE_STATUS', id: orderId, status });
    });

    return () => {
      socket.off('connect'); socket.off('disconnect');
      socket.off('reconnecting'); socket.off('reconnect_failed');
      socket.off(KITCHEN_EVENTS.NEW_ORDER);
      socket.off(KITCHEN_EVENTS.ORDER_STATUS_UPDATE);
    };
  }, []);

  const handleStatusChange = useCallback((orderId, newStatus) => {
    dispatchOrders({ type: 'UPDATE_STATUS', id: orderId, status: newStatus });
  }, []);

  // ─── Split orders into lanes ──────────────────────────────────────────────
  // Pending: all unacknowledged orders — needs kitchen attention first.
  // GCash orders only reach here after staff verifies the receipt
  // (backend filters them out of getKitchenOrders until payment = 'paid').
  const pendingOrders  = orders.filter((o) => o.status === 'pending');

  // Counter: acknowledged counter orders in progress
  const counterOrders  = orders.filter(
    (o) => o.order_channel !== 'mobile_app' && o.status !== 'pending'
  );

  // Online: acknowledged online orders in progress
  const onlineOrders   = orders.filter(
    (o) => o.order_channel === 'mobile_app' && o.status !== 'pending'
  );

  async function handleAcknowledgeAll() {
    const ids = pendingOrders.map((o) => o.id);
    setAckAllLoading(true);
    setAckAllError(null);
    const results = await Promise.allSettled(ids.map((id) => kitchenAPI.acknowledgeOrder(id)));
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        dispatchOrders({ type: 'UPDATE_STATUS', id: ids[i], status: r.value?.status ?? 'confirmed' });
      }
    });
    if (results.some((r) => r.status === 'rejected')) {
      setAckAllError('Some orders could not be acknowledged. Try again.');
    }
    setAckAllLoading(false);
  }

  return (
    <div className="kp-root">
      <ConnectionStatus connected={connected} reconnecting={reconnecting} />

      <KitchenHeader
        counterCount={counterOrders.length}
        onlineCount={onlineOrders.length}
      />

      <main className="kp-main" id="main-content">
        {pageLoading ? (
          <KitchenSkeleton />
        ) : error ? (
          <div className="kp-state kp-state--error" role="alert">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
              <path d="M16 9v8M16 21h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <p>{error}</p>
            <button className="kp-btn kp-btn--outline" onClick={() => setReloadKey((k) => k + 1)}>
              Retry
            </button>
          </div>
        ) : (
          <div className="kp-display">

            {/* TOP — New Orders banner (pending, all channels) */}
            <section className="kp-banner" aria-label="New Orders">
              <div className="kp-banner__header">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1.5a5 5 0 015 5V9l1 2H2L3 9V6.5a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M6.5 12.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  {pendingOrders.length > 0 && (
                    <circle cx="12" cy="3" r="2.5" fill="currentColor"/>
                  )}
                </svg>
                <span className="kp-banner__label">New Orders</span>
                {pendingOrders.length > 0 && (
                  <span className="kp-banner__count" aria-label={`${pendingOrders.length} new orders`}>
                    {pendingOrders.length}
                  </span>
                )}
                {pendingOrders.length > 0 && (
                  <button
                    className="kp-btn kp-btn--acknowledge"
                    onClick={handleAcknowledgeAll}
                    disabled={ackAllLoading}
                    aria-label={`Acknowledge ${pendingOrders.length} new order${pendingOrders.length > 1 ? 's' : ''}`}
                  >
                    {ackAllLoading
                      ? <span className="kp-spin-sm" aria-hidden="true" />
                      : pendingOrders.length > 1 ? 'Acknowledge All' : 'Acknowledge'}
                  </button>
                )}
              </div>

              {ackAllError && (
                <p className="kp-banner__error" role="alert">{ackAllError}</p>
              )}

              {pendingOrders.length === 0 ? (
                <p className="kp-banner__empty">No new orders</p>
              ) : (
                <div className="kp-banner__cards">
                  {pendingOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      lane="pending"
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* BOTTOM — Counter | Online two-column split */}
            <div className="kp-split">

              {/* LEFT — Counter */}
              <OrderColumn
                lane="counter"
                label="Counter Orders"
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <rect x="1" y="5" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M4 5V4a4 4 0 018 0v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M6 10h4M8 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                }
                orders={counterOrders}
                onStatusChange={handleStatusChange}
              />

              <div className="kp-divider" aria-hidden="true" />

              {/* RIGHT — Online */}
              <OrderColumn
                lane="online"
                label="Online Orders"
                icon={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                    <ellipse cx="8" cy="8" rx="2.5" ry="6.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M1.5 8h13M2 5h12M2 11h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                }
                orders={onlineOrders}
                onStatusChange={handleStatusChange}
              />

            </div>
          </div>
        )}
      </main>

      <div className="kp-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {`${pendingOrders.length} new, ${counterOrders.length} counter, ${onlineOrders.length} online orders in queue`}
      </div>
    </div>
  );
}