import { useState, useEffect, useCallback, useRef } from 'react';
import { ordersAPI, paymentsAPI } from '../../services/cashierApi';
import { connectSocket } from '../../services/socket';
import { currency } from '../../utils/format';
import Pagination from '../../components/Pagination';
import '../../styles/OnlineOrdersPage.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const METHOD_LABEL = {
  cash: 'Cash',
  gcash: 'GCash',
  cash_on_delivery: 'Cash on Delivery',
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const show = useCallback((message, type = 'success') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="oo-toast-stack" aria-live="polite" aria-label="Notifications">
      {toasts.map(t => (
        <div key={t.id} className={`oo-toast oo-toast--${t.type}`} role="status">
          <span className="oo-toast__icon" aria-hidden="true">
            {t.type === 'success' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : t.type === 'error' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            )}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────
function OrderStatusBadge({ status }) {
  const map = {
    pending:         { label: 'New',          cls: 'oo-badge--pending' },
    confirmed:       { label: 'Confirmed',    cls: 'oo-badge--confirmed' },
    preparing:       { label: 'Preparing',    cls: 'oo-badge--preparing' },
    ready:           { label: 'Ready',        cls: 'oo-badge--ready' },
    out_for_delivery:{ label: 'Out for delivery', cls: 'oo-badge--delivery' },
    completed:       { label: 'Completed',    cls: 'oo-badge--completed' },
    cancelled:       { label: 'Cancelled',    cls: 'oo-badge--cancelled' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'oo-badge--pending' };
  return <span className={`oo-badge ${cls}`}>{label}</span>;
}

function PaymentBadge({ method, status, amount }) {
  const label = METHOD_LABEL[method] || (method ? method : 'Unpaid');
  const tone = status === 'paid' ? 'oo-pay--paid' : status === 'rejected' ? 'oo-pay--rejected' : 'oo-pay--pending';
  return (
    <span className={`oo-pay ${tone}`}>
      <span className="oo-pay__label">{label}</span>
      <span className="oo-pay__sep" aria-hidden="true">·</span>
      <span className="oo-pay__status">
        {status === 'paid' ? 'Paid' : status === 'rejected' ? 'Rejected' : 'Pending'}
      </span>
      {amount != null && <span className="oo-pay__amount">{currency(amount)}</span>}
    </span>
  );
}

function DeliveryBadge({ preference, status }) {
  if (!preference) {
    return <span className="oo-delivery oo-delivery--pickup">For pickup</span>;
  }
  const map = {
    pending_assignment: { label: 'Pending assignment', cls: 'oo-delivery--pending' },
    assigned:           { label: 'Assigned to rider',  cls: 'oo-delivery--assigned' },
    out_for_delivery:   { label: 'Out for delivery',   cls: 'oo-delivery--out' },
    delivered:          { label: 'Delivered',          cls: 'oo-delivery--done' },
    cancelled:          { label: 'Delivery cancelled', cls: 'oo-delivery--cancel' },
  };
  const { label, cls } = (status && map[status]) || { label: preference === 'lalamove' ? 'Lalamove' : 'Own delivery', cls: 'oo-delivery--pending' };
  return (
    <span className={`oo-delivery ${cls}`}>
      <span className="oo-delivery__type">{preference === 'lalamove' ? 'Lalamove' : 'Own delivery'}</span>
      <span className="oo-delivery__status">{label}</span>
    </span>
  );
}

// ─── Receipt lightbox ─────────────────────────────────────────────────────────
function ReceiptLightbox({ src, orderNumber, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="oo-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Receipt for ${orderNumber}`}>
      <button className="oo-lightbox__close" onClick={onClose} aria-label="Close receipt">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div className="oo-lightbox__frame" onClick={e => e.stopPropagation()}>
        <div className="oo-lightbox__label">GCash Receipt — {orderNumber}</div>
        {src ? (
          <img src={src} alt={`GCash receipt for ${orderNumber}`} className="oo-lightbox__img" />
        ) : (
          <div className="oo-lightbox__placeholder">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Receipt image not available</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reject receipt modal ─────────────────────────────────────────────────────
function RejectModal({ order, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

  const QUICK_REASONS = [
    'Blurry screenshot',
    'Wrong amount',
    'Expired receipt',
    'Incorrect reference number',
    'Receipt belongs to another transaction',
  ];

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    textareaRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleSubmit = async () => {
    if (!reason.trim()) { setError('Please provide a reason.'); return; }
    setLoading(true); setError('');
    try {
      await onConfirm(order.id, reason.trim());
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to reject. Try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="oo-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="oo-reject-title">
      <div className="oo-modal" onClick={e => e.stopPropagation()}>
        <div className="oo-modal__header">
          <div className="oo-modal__title-row">
            <span className="oo-modal__icon oo-modal__icon--reject" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </span>
            <h2 className="oo-modal__title" id="oo-reject-title">Reject Receipt</h2>
          </div>
          <button className="oo-modal__close" onClick={onClose} aria-label="Close modal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="oo-modal__context">
          <span className="oo-modal__order-no">{order.order_number}</span>
          <span className="oo-modal__sep" aria-hidden="true">·</span>
          <span className="oo-modal__customer">{order.customer_name}</span>
          <span className="oo-modal__sep" aria-hidden="true">·</span>
          <span className="oo-modal__amount">{currency(order.total_amount)}</span>
        </div>

        <div className="oo-modal__body">
          <p className="oo-modal__label">Quick reasons</p>
          <div className="oo-modal__chips">
            {QUICK_REASONS.map(r => (
              <button
                key={r}
                type="button"
                className={`oo-chip${reason === r ? ' oo-chip--active' : ''}`}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>

          <label className="oo-modal__label" htmlFor="oo-reject-reason">
            Reason <span className="oo-modal__req" aria-hidden="true">*</span>
          </label>
          <textarea
            ref={textareaRef}
            id="oo-reject-reason"
            className={`oo-modal__textarea${error ? ' oo-modal__textarea--error' : ''}`}
            placeholder="Describe why the receipt was rejected…"
            value={reason}
            onChange={e => { setReason(e.target.value); if (error) setError(''); }}
            rows={3}
            aria-describedby={error ? 'oo-reject-error' : undefined}
            aria-required="true"
          />
          {error && <p className="oo-modal__error" id="oo-reject-error" role="alert">{error}</p>}
          <p className="oo-modal__hint">The customer is notified and asked to re-upload a valid receipt.</p>
        </div>

        <div className="oo-modal__footer">
          <button className="oo-btn oo-btn--ghost" onClick={onClose} disabled={loading} type="button">Cancel</button>
          <button
            className="oo-btn oo-btn--reject"
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            type="button"
            aria-busy={loading}
          >
            {loading ? <span className="oo-btn__spinner" aria-hidden="true" /> : null}
            {loading ? 'Rejecting…' : 'Reject Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cancel order modal ───────────────────────────────────────────────────────
function CancelModal({ order, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleConfirm = async () => {
    setLoading(true); setError('');
    try {
      await onConfirm(order.id);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to cancel the order.');
    } finally { setLoading(false); }
  };

  return (
    <div className="oo-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="oo-cancel-title">
      <div className="oo-modal" onClick={e => e.stopPropagation()}>
        <div className="oo-modal__header">
          <div className="oo-modal__title-row">
            <span className="oo-modal__icon oo-modal__icon--reject" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </span>
            <h2 className="oo-modal__title" id="oo-cancel-title">Cancel Order</h2>
          </div>
          <button className="oo-modal__close" onClick={onClose} aria-label="Close modal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="oo-modal__body">
          <p className="oo-modal__text">
            Cancel <strong>{order.order_number}</strong> for <strong>{order.customer_name}</strong>?
            The order is not yet paid, so no refund is needed.
          </p>
          {error && <p className="oo-modal__error" role="alert">{error}</p>}
        </div>

        <div className="oo-modal__footer">
          <button className="oo-btn oo-btn--ghost" onClick={onClose} disabled={loading} type="button">Keep order</button>
          <button
            className="oo-btn oo-btn--reject"
            onClick={handleConfirm}
            disabled={loading}
            type="button"
            aria-busy={loading}
          >
            {loading ? <span className="oo-btn__spinner" aria-hidden="true" /> : null}
            {loading ? 'Cancelling…' : 'Cancel Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order row (collapsible) ──────────────────────────────────────────────────
function OrderRow({ order, onAccept, onReject, onCancel, onComplete, onViewReceipt }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const rowId = `oo-row-${order.id}`;
  const detailId = `oo-detail-${order.id}`;

  const isGcashUnpaid = order.payment_method === 'gcash' && order.payment_status !== 'paid';
  const isNew = order.status === 'pending';
  const inKitchen = ['confirmed', 'preparing'].includes(order.status);
  const dispatchable = ['ready', 'out_for_delivery'].includes(order.status);
  const isClosed = ['completed', 'cancelled'].includes(order.status);
  const unpaid = order.payment_status === 'pending' || order.payment_status === 'awaiting_verification' ||
                 order.payment_status === 'rejected' || !order.payment_status;

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); }
    finally { setBusy(false); }
  };

  return (
    <div className={`oo-row${expanded ? ' oo-row--open' : ''}${order.status === 'cancelled' ? ' oo-row--cancelled' : ''}`}>
      {/* ── Summary bar ── */}
      <button
        className="oo-row__bar"
        onClick={() => setExpanded(x => !x)}
        aria-expanded={expanded}
        aria-controls={detailId}
        id={rowId}
      >
        <span className={`oo-row__chevron${expanded ? ' oo-row__chevron--open' : ''}`} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>

        <span className="oo-row__order-no">{order.order_number}</span>

        <span className="oo-row__customer">
          <span className="oo-row__avatar" aria-hidden="true">{order.customer_name?.[0]?.toUpperCase()}</span>
          <span className="oo-row__customer-name">{order.customer_name || 'Guest'}</span>
        </span>

        <span className="oo-row__method">
          <PaymentBadge method={order.payment_method} status={order.payment_status} />
        </span>

        <span className="oo-row__amount">{currency(order.total_amount)}</span>

        <span className="oo-row__meta">
          <OrderStatusBadge status={order.status} />
          <span className="oo-row__time">{timeAgo(order.created_at)}</span>
        </span>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="oo-row__detail" id={detailId} role="region" aria-labelledby={rowId}>
          <div className="oo-detail">
            {/* Left: customer + delivery */}
            <section className="oo-detail__col" aria-label="Customer and delivery">
              <h3 className="oo-detail__heading">Customer &amp; Delivery</h3>
              <dl className="oo-detail__list">
                <div className="oo-detail__row">
                  <dt>Customer</dt>
                  <dd>{order.customer_name || 'Guest'}</dd>
                </div>
                {order.customer_mobile && (
                  <div className="oo-detail__row">
                    <dt>Mobile</dt>
                    <dd>{order.customer_mobile}</dd>
                  </div>
                )}
                {order.customer_address && (
                  <div className="oo-detail__row">
                    <dt>Address</dt>
                    <dd>{order.customer_address}</dd>
                  </div>
                )}
                <div className="oo-detail__row">
                  <dt>Ordered</dt>
                  <dd>{formatTime(order.created_at)}</dd>
                </div>
              </dl>

              <div className="oo-detail__delivery">
                <DeliveryBadge preference={order.delivery_preference} status={order.delivery_status} />
                {order.delivery_preference && order.delivery_status && (
                  <ul className="oo-detail__delivery-meta">
                    {order.delivery_status === 'pending_assignment' && (
                      <li>Awaiting a rider — contact support chat to arrange.</li>
                    )}
                    {order.rider_name && <li>Rider: {order.rider_name}{order.rider_contact ? ` · ${order.rider_contact}` : ''}</li>}
                    {order.assigned_at && <li>Assigned {formatTime(order.assigned_at)}</li>}
                    {order.delivered_at && <li>Delivered {formatTime(order.delivered_at)}</li>}
                  </ul>
                )}
              </div>
            </section>

            {/* Middle: payment */}
            <section className="oo-detail__col" aria-label="Payment">
              <h3 className="oo-detail__heading">Payment</h3>
              <dl className="oo-detail__list">
                <div className="oo-detail__row">
                  <dt>Method</dt>
                  <dd>{METHOD_LABEL[order.payment_method] || 'Not yet paid'}</dd>
                </div>
                <div className="oo-detail__row">
                  <dt>Status</dt>
                  <dd>
                    <PaymentBadge method={order.payment_method} status={order.payment_status} />
                  </dd>
                </div>
                {order.paid_at && (
                  <div className="oo-detail__row">
                    <dt>Paid</dt>
                    <dd>{formatTime(order.paid_at)}</dd>
                  </div>
                )}
                {order.gcash_ref_number && (
                  <div className="oo-detail__row">
                    <dt>GCash Ref</dt>
                    <dd>{order.gcash_ref_number}</dd>
                  </div>
                )}
                {order.rejection_reason && (
                  <div className="oo-detail__row oo-detail__row--rejection">
                    <dt>Last Rejection</dt>
                    <dd>{order.rejection_reason}</dd>
                  </div>
                )}
              </dl>

              {order.payment_method === 'gcash' && order.receipt_image_url && (
                <button
                  className="oo-detail__receipt"
                  onClick={() => onViewReceipt(order)}
                  aria-label={`View full receipt for ${order.order_number}`}
                  type="button"
                >
                  <img
                    src={order.receipt_image_url}
                    alt=""
                    className="oo-detail__receipt-img"
                    loading="lazy"
                  />
                  <span className="oo-detail__receipt-label">View full receipt</span>
                </button>
              )}
            </section>

            {/* Right: items + actions */}
            <section className="oo-detail__col oo-detail__col--items" aria-label="Items and actions">
              <h3 className="oo-detail__heading">Items</h3>
              <ul className="oo-detail__items" aria-label={`Items in ${order.order_number}`}>
                {(order.items || []).map((item, i) => (
                  <li key={i} className="oo-detail__item">
                    <span className="oo-detail__item-qty">{item.quantity}×</span>
                    <span className="oo-detail__item-name">{item.name}</span>
                    <span className="oo-detail__item-price">{currency(item.unit_price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              {order.special_request && (
                <p className="oo-detail__note"><strong>Note:</strong> {order.special_request}</p>
              )}
              <div className="oo-detail__total">
                <span>Total</span>
                <span>{currency(order.total_amount)}</span>
              </div>

              {/* ── Actions ── */}
              <div className="oo-detail__actions">
                {isNew && isGcashUnpaid && (
                  <>
                    <button
                      className="oo-btn oo-btn--danger oo-btn--sm"
                      onClick={() => onReject(order)}
                      disabled={busy}
                      type="button"
                      aria-label={`Reject receipt for ${order.order_number}`}
                    >
                      Reject receipt
                    </button>
                    <button
                      className="oo-btn oo-btn--primary oo-btn--sm"
                      onClick={() => run(() => onAccept(order))}
                      disabled={busy}
                      type="button"
                      aria-label={`Accept and verify payment for ${order.order_number}`}
                      aria-busy={busy}
                    >
                      {busy ? 'Accepting…' : 'Accept & Verify'}
                    </button>
                  </>
                )}

                {isNew && !isGcashUnpaid && (
                  <>
                    {unpaid && (
                      <button
                        className="oo-btn oo-btn--ghost oo-btn--sm"
                        onClick={() => onCancel(order)}
                        disabled={busy}
                        type="button"
                        aria-label={`Cancel ${order.order_number}`}
                      >
                        Cancel order
                      </button>
                    )}
                    <button
                      className="oo-btn oo-btn--primary oo-btn--sm"
                      onClick={() => run(() => onAccept(order))}
                      disabled={busy}
                      type="button"
                      aria-label={`Accept and send ${order.order_number} to kitchen`}
                      aria-busy={busy}
                    >
                      {busy ? 'Sending…' : 'Accept & Send to Kitchen'}
                    </button>
                  </>
                )}

                {inKitchen && (
                  <span className="oo-detail__note">
                    This order is in the kitchen queue — status updates live.
                  </span>
                )}

                {dispatchable && (
                  <button
                    className="oo-btn oo-btn--primary oo-btn--sm"
                    onClick={() => run(() => onComplete(order))}
                    disabled={busy}
                    type="button"
                    aria-label={`Verify handoff and complete ${order.order_number}`}
                    aria-busy={busy}
                  >
                    {busy ? 'Completing…' : 'Verify Handoff & Complete'}
                  </button>
                )}

                {isClosed && (
                  <span className="oo-detail__note oo-detail__note--muted">
                    {order.status === 'completed' ? 'Order completed.' : 'Order cancelled.'}
                  </span>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ tabIndex }) {
  const copy = {
    incoming: ['No incoming orders', 'New online orders will appear here for review.'],
    verify: ['No receipts to verify', 'GCash receipts awaiting verification will appear here.'],
    in_kitchen: ['Kitchen is caught up', 'No orders are being prepared right now.'],
    ready: ['Nothing ready yet', 'Orders awaiting pickup or delivery handoff will appear here.'],
    closed: ['No closed orders', 'Completed and cancelled orders will appear here.'],
    all: ['No online orders', 'Online orders placed by customers will appear here.'],
  }[tabIndex] || ['No online orders', 'Online orders placed by customers will appear here.'];

  return (
    <div className="oo-empty">
      <div className="oo-empty__icon" aria-hidden="true">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
          <path d="M3 6h18"/>
          <path d="M16 10a4 4 0 0 1-8 0"/>
        </svg>
      </div>
      <p className="oo-empty__title">{copy[0]}</p>
      <p className="oo-empty__sub">{copy[1]}</p>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="oo-skeleton" aria-hidden="true">
      <div className="oo-skeleton__col oo-skeleton__col--sm" />
      <div className="oo-skeleton__col oo-skeleton__col--md" />
      <div className="oo-skeleton__col oo-skeleton__col--lg" />
      <div className="oo-skeleton__col oo-skeleton__col--sm" />
      <div className="oo-skeleton__col oo-skeleton__col--md" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all',        label: 'All',        statuses: null },
  { key: 'incoming',   label: 'Incoming',   statuses: ['pending'] },
  { key: 'verify',     label: 'Needs verification',
    predicate: (o) =>
      o.payment_method === 'gcash' &&
      ['pending', 'awaiting_verification', 'rejected'].includes(o.payment_status) &&
      !['completed', 'cancelled'].includes(o.status) },
  { key: 'in_kitchen', label: 'In Kitchen', statuses: ['confirmed', 'preparing'] },
  { key: 'ready',      label: 'Ready',      statuses: ['ready', 'out_for_delivery'] },
  { key: 'closed',     label: 'Closed',     statuses: ['completed', 'cancelled'] },
];

function matchesTab(order, tab) {
  if (tab.predicate) return tab.predicate(order);
  if (tab.statuses)  return tab.statuses.includes(order.status);
  return true;
}

const OO_PAGE_SIZE = 10;

export default function OnlineOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('incoming');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [lightboxOrder, setLightboxOrder] = useState(null);
  const [live, setLive] = useState(false);
  const { toasts, show: showToast } = useToast();
  const liveTimerRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    try {
      const res = await ordersAPI.getOnline({ limit: 200 });
      setOrders(res.data?.orders || []);
    } catch {
      showToast('Could not load online orders.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Fetch once on mount; the setState calls inside fetchOrders happen after the
  // request resolves, but the rule treats the call as a synchronous update.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Socket: live updates ───────────────────────────────────────────────────
  useEffect(() => {
    // Join the staff room so payment/order/delivery events reach us.
    const socket = connectSocket('staff');

    const flashLive = (label) => {
      clearTimeout(liveTimerRef.current);
      setLive(true);
      liveTimerRef.current = setTimeout(() => setLive(false), 2500);
      if (label) showToast(label, 'info');
    };

    const patchOrder = (orderId, patch) => {
      setOrders(prev => {
        const exists = prev.some(o => o.id === orderId);
        if (!exists) return prev;
        return prev.map(o => (o.id === orderId ? { ...o, ...patch } : o));
      });
    };

    const onConnect = () => { socket.emit('join', { room: 'staff' }); };

    // order:status — kitchen moved the order forward
    const onOrderStatus = ({ orderId, status }) => {
      patchOrder(orderId, { status });
      if (status === 'ready') {
        flashLive(`Order ready — dispatch #${orderId}`);
      }
    };

    // order:ready — kitchen confirms readiness with handoff point
    const onOrderReady = ({ orderId, orderNumber }) => {
      patchOrder(orderId, { status: 'ready' });
      flashLive(`${orderNumber || `Order #${orderId}`} is ready`);
    };

    // payment:verified — receipt approved (incl. our own accept)
    const onPaymentVerified = ({ orderId }) => {
      patchOrder(orderId, { payment_status: 'paid', status: 'confirmed' });
    };

    // payment:rejected — receipt rejected (incl. our own reject)
    const onPaymentRejected = ({ orderId, reason }) => {
      patchOrder(orderId, { payment_status: 'rejected', rejection_reason: reason });
    };

    // delivery:update — rider moved the delivery forward
    const onDeliveryUpdate = ({ order_id, delivery_status, order_status }) => {
      const row = { delivery_status, status: order_status };
      if (delivery_status === 'delivered') row.delivered_at = new Date().toISOString();
      patchOrder(order_id, row);
    };

    socket.on('connect',          onConnect);
    socket.on('order:status',     onOrderStatus);
    socket.on('order:ready',      onOrderReady);
    socket.on('payment:verified', onPaymentVerified);
    socket.on('payment:rejected', onPaymentRejected);
    socket.on('delivery:update',  onDeliveryUpdate);

    return () => {
      socket.off('connect',          onConnect);
      socket.off('order:status',     onOrderStatus);
      socket.off('order:ready',      onOrderReady);
      socket.off('payment:verified', onPaymentVerified);
      socket.off('payment:rejected', onPaymentRejected);
      socket.off('delivery:update',  onDeliveryUpdate);
      clearTimeout(liveTimerRef.current);
    };
  }, [showToast]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleAccept = useCallback(async (order) => {
    try {
      await ordersAPI.accept(order);
      setOrders(prev => prev.map(o => {
        if (o.id !== order.id) return o;
        return order.payment_method === 'gcash'
          ? { ...o, status: 'confirmed', payment_status: 'paid' }
          : { ...o, status: 'confirmed' };
      }));
      showToast(
        order.payment_method === 'gcash'
          ? 'Payment verified — order sent to kitchen.'
          : 'Order accepted — sent to kitchen.',
        'success'
      );
    } catch (err) {
      showToast(err?.response?.data?.message || 'Could not accept the order.', 'error');
    }
  }, [showToast]);

  const handleRejectConfirm = useCallback(async (orderId, reason) => {
    await paymentsAPI.reject(orderId, reason);
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, payment_status: 'rejected', rejection_reason: reason } : o
    ));
    showToast('Receipt rejected — customer notified to re-upload.', 'info');
  }, [showToast]);

  const handleCancel = useCallback(async (orderId) => {
    await ordersAPI.cancel(orderId);
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, status: 'cancelled' } : o
    ));
    showToast('Order cancelled.', 'info');
  }, [showToast]);

  const handleComplete = useCallback(async (order) => {
    try {
      await ordersAPI.setStatus(order.id, 'completed');
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: 'completed' } : o
      ));
      showToast('Handoff verified — order completed.', 'success');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Could not complete the order.', 'error');
    }
  }, [showToast]);

  // ── Filter + search ───────────────────────────────────────────────────────
  const activeTab = TABS.find(t => t.key === tab) || TABS[0];
  const counts = {};
  TABS.forEach(t => {
    counts[t.key] = orders.filter(o => matchesTab(o, t)).length;
  });

  const q = search.trim().toLowerCase();
  const filtered = orders.filter(o => {
    if (!matchesTab(o, activeTab)) return false;
    if (!q) return true;
    return (
      o.order_number?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.customer_mobile?.toLowerCase().includes(q) ||
      o.gcash_ref_number?.toLowerCase().includes(q)
    );
  });

  // Client-side pagination of the filtered list.
  const totalPages = Math.max(1, Math.ceil(filtered.length / OO_PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageStart  = (safePage - 1) * OO_PAGE_SIZE;
  const pagedOrders = filtered.slice(pageStart, pageStart + OO_PAGE_SIZE);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="oo-page">
      <ToastStack toasts={toasts} />

      {/* ── Section bar ── */}
      <header className="oo-header">
        <div className="oo-header__left">
          <h1 className="oo-header__title">Online Orders</h1>
          {live && (
            <span className="oo-live" aria-live="polite" aria-label="Order update received">
              <span className="oo-live__dot" aria-hidden="true" />
              Live update
            </span>
          )}
        </div>
        <div className="oo-header__stats" aria-label="Order summary">
          <span className="oo-stat oo-stat--incoming">
            <span className="oo-stat__num">{counts.incoming}</span>
            <span className="oo-stat__label">Incoming</span>
          </span>
          <span className="oo-stat oo-stat--ready">
            <span className="oo-stat__num">{counts.ready}</span>
            <span className="oo-stat__label">Ready</span>
          </span>
        </div>
      </header>

      {/* ── Toolbar ── */}
      <div className="oo-toolbar">
        <div className="oo-search">
          <span className="oo-search__icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            type="search"
            className="oo-search__input"
            placeholder="Search order, customer, or GCash ref…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search online orders"
          />
          {search && (
            <button className="oo-search__clear" onClick={() => setSearch('')} aria-label="Clear search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <div className="oo-tabs" role="tablist" aria-label="Filter online orders">
          {TABS.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`oo-tab${tab === t.key ? ' oo-tab--active' : ''}`}
              onClick={() => { setTab(t.key); setPage(1); }}
              type="button"
            >
              {t.label}
              <span className={`oo-tab__count${tab === t.key ? ' oo-tab__count--active' : ''}`}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Table header (desktop) ── */}
      <div className="oo-table-head" aria-hidden="true">
        <span className="oo-table-head__col oo-table-head__col--icon" />
        <span className="oo-table-head__col oo-table-head__col--order">Order</span>
        <span className="oo-table-head__col oo-table-head__col--customer">Customer</span>
        <span className="oo-table-head__col oo-table-head__col--method">Payment</span>
        <span className="oo-table-head__col oo-table-head__col--amount">Amount</span>
        <span className="oo-table-head__col oo-table-head__col--status">Status</span>
      </div>

      {/* ── List ── */}
      <div className="oo-list" role="list" aria-label="Online orders">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <SkeletonRow key={i} />)
        ) : filtered.length === 0 ? (
          <EmptyState tabIndex={tab} />
        ) : (
          pagedOrders.map(order => (
            <div key={order.id} role="listitem">
              <OrderRow
                order={order}
                onAccept={handleAccept}
                onReject={setRejectTarget}
                onCancel={setCancelTarget}
                onComplete={handleComplete}
                onViewReceipt={setLightboxOrder}
              />
            </div>
          ))
        )}
      </div>

      {/* ── Pagination ── */}
      {!loading && (
        <Pagination
          label="Online orders pagination"
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          from={filtered.length === 0 ? 0 : pageStart + 1}
          to={Math.min(pageStart + OO_PAGE_SIZE, filtered.length)}
          onPage={setPage}
        />
      )}

      {/* ── Workflow note ── */}
      <aside className="oo-notice" aria-label="Workflow note">
        <span className="oo-notice__icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </span>
        GCash orders only enter the kitchen after the receipt is verified. COD and
        cash orders go to the kitchen as soon as they are accepted.
      </aside>

      {/* ── Modals ── */}
      {rejectTarget && (
        <RejectModal
          order={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={handleRejectConfirm}
        />
      )}
      {cancelTarget && (
        <CancelModal
          order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancel}
        />
      )}
      {lightboxOrder && (
        <ReceiptLightbox
          src={lightboxOrder.receipt_image_url}
          orderNumber={lightboxOrder.order_number}
          onClose={() => setLightboxOrder(null)}
        />
      )}
    </div>
  );
}