import { useState, useEffect, useReducer, useCallback } from 'react';
import { kitchenAPI } from '../../services/api';
import { getSocket, KITCHEN_EVENTS } from '../../services/socket';
import KitchenHeader from './components/KitchenHeader';
import OrderColumn from './components/OrderColumn';
import AlertPanel from './components/AlertPanel';
import ConnectionStatus from './components/ConnectionStatus';
import './KitchenPage.css';

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
        .filter((o) => ['confirmed', 'preparing'].includes(o.status));
    default: return state;
  }
}

function alertsReducer(state, action) {
  switch (action.type) {
    case 'LOAD': return action.payload;
    case 'ADD': {
      const exists = state.some((a) => a.id === action.payload.id);
      return exists ? state : [action.payload, ...state];
    }
    case 'ACKNOWLEDGE':
      return state.map((a) =>
        a.id === action.id ? { ...a, acknowledged_at: new Date().toISOString() } : a
      );
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
  } catch (_) {}
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function KitchenPage() {
  const [orders, dispatchOrders] = useReducer(ordersReducer, []);
  const [alerts, dispatchAlerts] = useReducer(alertsReducer, []);
  const [connected, setConnected] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [{ data: ordersData }, { data: alertsData }] = await Promise.all([
          kitchenAPI.getOrders(),
          kitchenAPI.getAlerts(),
        ]);
        if (!cancelled) {
          dispatchOrders({ type: 'LOAD', payload: ordersData });
          dispatchAlerts({ type: 'LOAD', payload: alertsData });
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
    socket.on('connect',         () => { setConnected(true); setReconnecting(false); });
    socket.on('disconnect',       () => setConnected(false));
    socket.on('reconnecting',     () => setReconnecting(true));
    socket.on('reconnect_failed', () => setReconnecting(false));
    socket.on(KITCHEN_EVENTS.NEW_ORDER, (order) => {
      dispatchOrders({ type: 'ADD', payload: order });
      playAlert();
    });
    socket.on(KITCHEN_EVENTS.KITCHEN_ALERT, (alert) => {
      dispatchAlerts({ type: 'ADD', payload: alert });
    });
    socket.on(KITCHEN_EVENTS.ORDER_STATUS_UPDATE, ({ orderId, status }) => {
      dispatchOrders({ type: 'UPDATE_STATUS', id: orderId, status });
    });
    return () => {
      socket.off('connect'); socket.off('disconnect');
      socket.off('reconnecting'); socket.off('reconnect_failed');
      socket.off(KITCHEN_EVENTS.NEW_ORDER);
      socket.off(KITCHEN_EVENTS.KITCHEN_ALERT);
      socket.off(KITCHEN_EVENTS.ORDER_STATUS_UPDATE);
    };
  }, []);

  const handleStatusChange = useCallback((orderId, newStatus) => {
    dispatchOrders({ type: 'UPDATE_STATUS', id: orderId, status: newStatus });
  }, []);

  const handleAcknowledge = useCallback((alertId) => {
    dispatchAlerts({ type: 'ACKNOWLEDGE', id: alertId });
  }, []);

  // Split orders by channel
  const counterOrders = orders.filter((o) => o.order_channel !== 'mobile_app');
  const onlineOrders  = orders.filter((o) => o.order_channel === 'mobile_app');

  return (
    <div className="kp-root">
      <ConnectionStatus connected={connected} reconnecting={reconnecting} />

      <KitchenHeader
        counterCount={counterOrders.length}
        onlineCount={onlineOrders.length}
      />

      <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} />

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

            {/* Divider */}
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
        )}
      </main>

      <div className="kp-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {`${counterOrders.length} counter, ${onlineOrders.length} online orders in queue`}
      </div>
    </div>
  );
}