import { useState, useEffect, useReducer, useCallback } from 'react';
import { kitchenAPI } from '../../services/api';
import { getSocket, KITCHEN_EVENTS } from '../../services/socket';
import KitchenHeader from './components/KitchenHeader';
import OrderColumn from './components/OrderColumn';
import OrderCard from './components/OrderCard';
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
    // Web Audio is unavailable or blocked until a user gesture — the buzzer is
    // a nicety, so a failure here must not break the caller.
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function KitchenPage() {
  const [orders, dispatchOrders] = useReducer(ordersReducer, []);
  const [connected, setConnected] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);
  // Buzzer liveness from GET /api/kitchen/devices. `null` = no response yet —
  // do not flash the banner during the first load or when the request itself
  // errors (that failure is covered by ConnectionStatus instead).
  const [buzzerOffline, setBuzzerOffline] = useState(false);
  const [devicesLoaded, setDevicesLoaded] = useState(false);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ordersRes = await kitchenAPI.getOrders();
        const ordersData = ordersRes?.data ?? ordersRes ?? [];
        if (!cancelled) {
          dispatchOrders({ type: 'LOAD', payload: Array.isArray(ordersData) ? ordersData : [] });
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || 'Failed to load orders.');
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Socket.io
  useEffect(() => {
    const socket = getSocket();
    let firstConnect = true;

    const refetchAll = async () => {
      try {
        const ordersRes = await kitchenAPI.getOrders();
        const ordersData = ordersRes?.data ?? ordersRes ?? [];
        dispatchOrders({ type: 'LOAD', payload: Array.isArray(ordersData) ? ordersData : [] });
await kitchenAPI.getAlerts?.().catch(() => null);
      } catch { /* ignore */ }
    };

    const onReconnecting    = () => setReconnecting(true);
    const onReconnectedEvent = () => {
      setConnected(true);
      setReconnecting(false);
      refetchAll();
    };
    socket.on('connect',         () => {
      setConnected(true);
      setReconnecting(false);
      if (!firstConnect) refetchAll();
      firstConnect = false;
    });
    socket.on('disconnect',       (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') setReconnecting(true);
    });
    socket.on('reconnecting',     onReconnecting);
    socket.on('reconnect_failed', () => setReconnecting(false));
    // socket.js drives the refresh+reconnect cycle after a server kick;
    // reflect its state in the page's indicator.
    window.addEventListener('socket:reconnecting', onReconnecting);
    window.addEventListener('socket:reconnected', onReconnectedEvent);

    // A new order arrives as 'pending' and the card appears in New Orders.
    // Deliberately silent: the buzzer and the beep are paid-only triggers, so
    // Confirm Order must not ring anything.
    socket.on(KITCHEN_EVENTS.NEW_ORDER, (order) => {
      dispatchOrders({ type: 'ADD', payload: order });
    });

    // The only sound trigger: a payment landed. The ESP32 is buzzing and the
    // order card is waiting to be acknowledged. There is no separate alert
    // banner any more (the order card's Acknowledge button is the single
    // control), so this event is only a cue.
    socket.on(KITCHEN_EVENTS.KITCHEN_ALERT, () => { playAlert(); });

    socket.on(KITCHEN_EVENTS.ORDER_STATUS_UPDATE, ({ orderId, status }) => {
      dispatchOrders({ type: 'UPDATE_STATUS', id: orderId, status });
    });

    return () => {
      socket.off('connect'); socket.off('disconnect');
      socket.off('reconnecting'); socket.off('reconnect_failed');
      socket.off(KITCHEN_EVENTS.NEW_ORDER);
      socket.off(KITCHEN_EVENTS.KITCHEN_ALERT);
      socket.off(KITCHEN_EVENTS.ORDER_STATUS_UPDATE);
      window.removeEventListener('socket:reconnecting', onReconnecting);
      window.removeEventListener('socket:reconnected', onReconnectedEvent);
    };
  }, []);

  // Poll the ESP32 registry so a dead buzzer can't silently block ringing.
  // `devicesLoaded` gates the banner off before the first response arrives.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await kitchenAPI.getDevices();
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        const anyOnline = list.some((d) => d.online === true);
        setDevicesLoaded(true);
        setBuzzerOffline(!anyOnline);
      } catch {
        // Request failure is not "buzzer offline" — the connection banner
        // already covers that. Leave the buzzer banner hidden.
        if (cancelled) return;
        setBuzzerOffline(false);
      }
    };
    load();
    const t = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const handleStatusChange = useCallback((orderId, newStatus) => {
    dispatchOrders({ type: 'UPDATE_STATUS', id: orderId, status: newStatus });
  }, []);

  // ─── Split orders into lanes ──────────────────────────────────────────────
  // Pending: all unacknowledged orders regardless of channel — needs kitchen attention first
  const pendingOrders  = orders.filter((o) => o.status === 'pending');

  // Counter: acknowledged counter orders in progress
  const counterOrders  = orders.filter(
    (o) => o.order_channel !== 'mobile_app' && o.status !== 'pending'
  );

  // Online: acknowledged online orders in progress
  const onlineOrders   = orders.filter(
    (o) => o.order_channel === 'mobile_app' && o.status !== 'pending'
  );

  return (
    <div className="kp-root">
      <KitchenHeader
        counterCount={counterOrders.length}
        onlineCount={onlineOrders.length}
        connected={connected}
        reconnecting={reconnecting}
      />

      {devicesLoaded && buzzerOffline && (
        <div className="kp-connection kp-connection--offline" role="alert" aria-live="assertive">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <line x1="1" y1="1" x2="12" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M2 5A6 6 0 0112 9M1 3a9.5 9.5 0 0110 7M4.5 7.5A3 3 0 018 10.5"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Kitchen buzzer is offline. New orders will not ring. Watch the screen.
        </div>
      )}

      <main className="kp-main" id="main-content">
        {pageLoading ? (
          <div className="kp-state" role="status" aria-live="polite">
            <div className="kp-loader" aria-hidden="true">
              <div /><div /><div />
            </div>
            <span>Loading kitchen queue…</span>
          </div>
        ) : error ? (
          <div className="kp-state kp-state--error" role="alert">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
              <path d="M16 9v8M16 21h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <p>{error}</p>
            <button className="kp-btn kp-btn--outline" onClick={() => window.location.reload()}>
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
              </div>

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