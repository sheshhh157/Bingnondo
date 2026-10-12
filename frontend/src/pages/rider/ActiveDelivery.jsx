import { useState, useEffect, useCallback } from 'react';
import { getCurrentDelivery, updateDeliveryStatus } from '../../services/riderApi';
import '../../styles/ActiveDelivery.css';

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}
function IconPhone() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}
function IconPackage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────
const STATUS_LABEL = {
  assigned:         'Assigned',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
};
function StatusBadge({ status }) {
  return (
    <span className={`ad-badge ad-badge--${status}`} role="status">
      {STATUS_LABEL[status] || status}
    </span>
  );
}

// ── Confirm modal ──────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel, loading }) {
  return (
    <div className="ad-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm action">
      <div className="ad-modal">
        <p className="ad-modal__message">{message}</p>
        <div className="ad-modal__actions">
          <button className="ad-btn ad-btn--ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="ad-btn ad-btn--primary" onClick={onConfirm} disabled={loading} aria-busy={loading}>
            {loading ? <span className="ad-spinner" aria-label="Processing" /> : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── No delivery state ──────────────────────────────────────────────────────────
function NoDelivery({ onRefresh, refreshing }) {
  return (
    <div className="ad-empty">
      <div className="ad-empty__icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
          <rect x="9" y="11" width="14" height="10" rx="1"/>
          <circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        </svg>
      </div>
      <h2 className="ad-empty__title">No active delivery</h2>
      <p className="ad-empty__sub">
        You have no delivery assigned right now. Check back when staff assigns one.
      </p>
      <button className="ad-btn ad-btn--outline" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}>
        {refreshing ? <span className="ad-spinner" aria-label="Refreshing" /> : <IconRefresh />}
        Refresh
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ActiveDelivery() {
  const [delivery, setDelivery]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [confirm, setConfirm]     = useState(null);  // { status, message }
  const [actionLoading, setAL]    = useState(false);
  const [successMsg, setSuccess]  = useState('');

  const fetchDelivery = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getCurrentDelivery();
      setDelivery(res.delivery || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load delivery. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDelivery(); }, [fetchDelivery]);

  const handleStatusClick = (nextStatus) => {
    const messages = {
      out_for_delivery: 'Mark this order as Out for Delivery? The customer will be notified.',
      delivered:        'Mark this order as Delivered? This will complete the order.',
    };
    setConfirm({ status: nextStatus, message: messages[nextStatus] });
  };

  const handleConfirm = async () => {
    if (!confirm || !delivery) return;
    setAL(true);
    try {
      const res = await updateDeliveryStatus(delivery.id, confirm.status);
      setDelivery(res.delivery || { ...delivery, status: confirm.status });
      setSuccess(
        confirm.status === 'delivered'
          ? 'Order marked as delivered. Great job!'
          : 'Status updated — customer has been notified.'
      );
      if (confirm.status === 'delivered') {
        setTimeout(() => setDelivery(null), 2800);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed. Please try again.');
    } finally {
      setAL(false);
      setConfirm(null);
      setTimeout(() => setSuccess(''), 3500);
    }
  };

  const formatCurrency = (n) =>
    `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  const formatTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  if (loading) {
    return (
      <div className="ad-loading" role="status" aria-live="polite">
        <span className="ad-spinner ad-spinner--lg" aria-label="Loading delivery" />
        <p>Loading your delivery…</p>
      </div>
    );
  }

  return (
    <div className="ad-root">
      <header className="ad-header">
        <div>
          <h1 className="ad-header__title">Active Delivery</h1>
          <p className="ad-header__sub">Your current assigned order</p>
        </div>
        <button
          className="ad-btn ad-btn--icon"
          onClick={fetchDelivery}
          aria-label="Refresh delivery"
          title="Refresh"
        >
          <IconRefresh />
        </button>
      </header>

      {error && (
        <div className="ad-alert ad-alert--error" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {successMsg && (
        <div className="ad-alert ad-alert--success" role="status" aria-live="polite">
          <IconCheck />
          {successMsg}
        </div>
      )}

      {!delivery ? (
        <NoDelivery onRefresh={fetchDelivery} refreshing={loading} />
      ) : (
        <div className="ad-card">
          {/* ── Header row ── */}
          <div className="ad-card__head">
            <div className="ad-card__order-info">
              <span className="ad-card__order-num">{delivery.order_number}</span>
              <span className="ad-card__assigned-at">
                Assigned {formatTime(delivery.assigned_at)}
              </span>
            </div>
            <StatusBadge status={delivery.status} />
          </div>

          {/* ── Customer info ── */}
          <div className="ad-card__section">
            <h2 className="ad-card__section-label">Customer</h2>
            <div className="ad-card__info-grid">
              <div className="ad-info-row">
                <span className="ad-info-row__icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <span className="ad-info-row__value">{delivery.customer_name}</span>
              </div>
              {delivery.customer_contact && (
                <div className="ad-info-row">
                  <span className="ad-info-row__icon" aria-hidden="true"><IconPhone /></span>
                  <a
                    href={`tel:${delivery.customer_contact}`}
                    className="ad-info-row__link"
                  >
                    {delivery.customer_contact}
                  </a>
                </div>
              )}
              <div className="ad-info-row ad-info-row--address">
                <span className="ad-info-row__icon" aria-hidden="true"><IconPin /></span>
                <span className="ad-info-row__value">{delivery.delivery_address}</span>
              </div>
            </div>
          </div>

          {/* ── Items ── */}
          <div className="ad-card__section">
            <h2 className="ad-card__section-label">
              <IconPackage />
              Order Items
            </h2>
            <ul className="ad-items" aria-label="Order items">
              {(delivery.items || []).map((item, i) => (
                <li key={i} className="ad-item">
                  <span className="ad-item__qty">{item.quantity}×</span>
                  <span className="ad-item__name">{item.name}</span>
                  <span className="ad-item__price">{formatCurrency(item.unit_price * item.quantity)}</span>
                </li>
              ))}
            </ul>

            {delivery.special_request && (
              <div className="ad-special-note">
                <span className="ad-special-note__label">Note:</span>
                {delivery.special_request}
              </div>
            )}

            <div className="ad-total">
              <span>Total</span>
              <span className="ad-total__amount">{formatCurrency(delivery.total_amount)}</span>
            </div>
          </div>

          {/* ── Action buttons ── */}
          {delivery.status === 'assigned' && (
            <div className="ad-card__actions">
              <button
                className="ad-btn ad-btn--primary ad-btn--full"
                onClick={() => handleStatusClick('out_for_delivery')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
                Pick Up — Start Delivery
              </button>
            </div>
          )}

          {delivery.status === 'out_for_delivery' && (
            <div className="ad-card__actions">
              <button
                className="ad-btn ad-btn--success ad-btn--full"
                onClick={() => handleStatusClick('delivered')}
              >
                <IconCheck />
                Mark as Delivered
              </button>
            </div>
          )}

          {delivery.status === 'delivered' && (
            <div className="ad-card__actions">
              <div className="ad-delivered-note">
                <IconCheck />
                Order successfully delivered.
              </div>
            </div>
          )}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
}