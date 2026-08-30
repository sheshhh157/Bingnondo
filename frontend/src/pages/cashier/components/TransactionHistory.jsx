import { useState, useEffect } from 'react';
import { ordersAPI } from '../../../services/api';
import '../../../styles/TransactionHistory.css';

const STATUS_LABEL = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_CLASS = {
  pending: 'th-status--pending',
  confirmed: 'th-status--confirmed',
  preparing: 'th-status--preparing',
  ready: 'th-status--ready',
  completed: 'th-status--completed',
  cancelled: 'th-status--cancelled',
};

const fmt = (n) => `₱${Number(n).toFixed(2)}`;

export default function TransactionHistory() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('today'); // 'today' | 'week'
  const [expanded, setExpanded] = useState(null);

  const fetchOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await ordersAPI.getMyTransactions();
      const list = Array.isArray(data) ? data : data.orders || [];
      setOrders(list);
    } catch {
      setError('Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  // Client-side filter
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());

  const filtered = orders.filter((o) => {
    const d = new Date(o.created_at);
    return filter === 'today' ? d >= startOfDay : d >= startOfWeek;
  });

  const todayTotal = filtered.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return (
    <div className="th-root">
      {/* Toolbar */}
      <div className="th-toolbar">
        <div className="th-toolbar__left">
          <h2 className="th-title">My Transactions</h2>
          {!loading && !error && (
            <span className="th-count">{filtered.length} order{filtered.length !== 1 ? 's' : ''} · {fmt(todayTotal)}</span>
          )}
        </div>
        <div className="th-toolbar__filters" role="group" aria-label="Filter by period">
          {['today', 'week'].map((f) => (
            <button
              key={f}
              className={`th-filter-btn${filter === f ? ' th-filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
            >
              {f === 'today' ? 'Today' : 'This Week'}
            </button>
          ))}
        </div>
        <button className="th-refresh-btn" onClick={fetchOrders} aria-label="Refresh transactions">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="th-content">
        {loading ? (
          <TransactionSkeleton />
        ) : error ? (
          <div className="th-state th-state--error">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>{error}</p>
            <button className="th-retry" onClick={fetchOrders}>Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="th-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>No transactions {filter === 'today' ? 'today' : 'this week'} yet.</p>
          </div>
        ) : (
          <div className="th-table-wrap">
            <table className="th-table" aria-label="Transaction history">
              <thead>
                <tr>
                  <th scope="col">Order #</th>
                  <th scope="col">Items</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Total</th>
                  <th scope="col">Status</th>
                  <th scope="col">Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <>
                    <tr
                      key={order.id}
                      className={`th-row${expanded === order.id ? ' th-row--expanded' : ''}`}
                      onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                      aria-expanded={expanded === order.id}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(expanded === order.id ? null : order.id); }}
                    >
                      <td className="th-cell--order">
                        <span className="th-order-num">#{order.order_number || order.id}</span>
                      </td>
                      <td className="th-cell--items">
                        {(order.items || []).slice(0, 2).map((i) => i.name || i.menu_item?.name).filter(Boolean).join(', ')}
                        {(order.items || []).length > 2 && <span className="th-more"> +{order.items.length - 2}</span>}
                        {(!order.items || order.items.length === 0) && <span className="th-muted">—</span>}
                      </td>
                      <td className="th-cell--pay">
                        <span className={`th-pay-badge th-pay-badge--${order.payment_method || 'cash'}`}>
                          {order.payment_method === 'gcash' ? 'GCash' : 'Cash'}
                        </span>
                      </td>
                      <td className="th-cell--total">{fmt(order.total_amount || 0)}</td>
                      <td>
                        <span className={`th-status ${STATUS_CLASS[order.status] || ''}`}>
                          {STATUS_LABEL[order.status] || order.status}
                        </span>
                      </td>
                      <td className="th-cell--time">
                        {new Date(order.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {expanded === order.id && (
                      <tr key={`${order.id}-exp`} className="th-expanded-row">
                        <td colSpan={6}>
                          <div className="th-expanded">
                            {(order.items || []).map((item, idx) => (
                              <div key={idx} className="th-expanded__line">
                                <span>{item.name || item.menu_item?.name} ×{item.quantity}</span>
                                <span>{fmt((item.unit_price || item.price || 0) * item.quantity)}</span>
                              </div>
                            ))}
                            {order.notes && (
                              <p className="th-expanded__note">Note: {order.notes}</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionSkeleton() {
  return (
    <div className="th-table-wrap" aria-busy="true" aria-label="Loading transactions">
      <table className="th-table">
        <thead>
          <tr>
            <th>Order #</th><th>Items</th><th>Payment</th><th>Total</th><th>Status</th><th>Time</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} className="th-row">
              {Array.from({ length: 6 }).map((__, j) => (
                <td key={j}><div className="th-skel" /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}