import { useState, useEffect, useReducer, useCallback } from 'react';
import { kitchenAPI } from '../../services/api';
import { getSocket, KITCHEN_EVENTS } from '../../services/socket';
import KitchenHeader from './components/KitchenHeader';
import OrderCard from './components/OrderCard';
import AlertPanel from './components/AlertPanel';
import ConnectionStatus from './components/ConnectionStatus';
import EmptyQueue from './components/EmptyQueue';
import './KitchenPage.css';

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

export default function KitchenPage() {
  const [orders, dispatchOrders] = useReducer(ordersReducer, []);
  const [alerts, dispatchAlerts] = useReducer(alertsReducer, []);
  const [filter, setFilter] = useState('all');
  const [connected, setConnected] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    const socket = getSocket();
    socket.on('connect',          () => { setConnected(true); setReconnecting(false); });
    socket.on('disconnect',        () => setConnected(false));
    socket.on('reconnecting',      () => setReconnecting(true));
    socket.on('reconnect_failed',  () => setReconnecting(false));
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

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);
  const counts = {
    all:       orders.length,
    confirmed: orders.filter((o) => o.status === 'confirmed').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
  };

  return (
    <div className="kp-root">
      <ConnectionStatus connected={connected} reconnecting={reconnecting} />
      <KitchenHeader counts={counts} filter={filter} onFilterChange={setFilter} />
      <AlertPanel alerts={alerts} onAcknowledge={handleAcknowledge} />

      <main className="kp-main" id="main-content">
        {pageLoading ? (
          <div className="kp-state" role="status">
            <div className="kp-spinner" aria-hidden="true" />
            <p>Loading kitchen queue…</p>
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
        ) : filtered.length === 0 ? (
          <EmptyQueue filter={filter} />
        ) : (
          <section
            className="kp-grid"
            aria-label={`${filtered.length} order${filtered.length !== 1 ? 's' : ''} in queue`}
          >
            {filtered.map((order) => (
              <OrderCard key={order.id} order={order} onStatusChange={handleStatusChange} />
            ))}
          </section>
        )}
      </main>

      <div className="kp-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {counts.all > 0 ? `${counts.all} orders in queue` : 'Queue is empty'}
      </div>
    </div>
  );
}