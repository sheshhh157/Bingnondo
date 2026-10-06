import { useState, useEffect, useCallback, useRef } from 'react';
import { paymentVerificationAPI } from '../../services/api';
import { connectSocket, disconnectSocket } from '../../services/socket';
import '../../styles/PaymentVerificationPage.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatPeso(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

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
    <div className="pv-toast-stack" aria-live="polite" aria-label="Notifications">
      {toasts.map(t => (
        <div key={t.id} className={`pv-toast pv-toast--${t.type}`} role="status">
          <span className="pv-toast__icon" aria-hidden="true">
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

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    awaiting_verification: { label: 'Awaiting Verification', cls: 'pv-badge--pending' },
    rejected:              { label: 'Rejected',              cls: 'pv-badge--rejected' },
    paid:                  { label: 'Paid',                  cls: 'pv-badge--paid' },
  };
  const { label, cls } = map[status] || { label: status, cls: '' };
  return <span className={`pv-badge ${cls}`}>{label}</span>;
}

// ─── Receipt Image Lightbox ───────────────────────────────────────────────────
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
    <div className="pv-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Receipt for ${orderNumber}`}>
      <button className="pv-lightbox__close" onClick={onClose} aria-label="Close receipt">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div className="pv-lightbox__frame" onClick={e => e.stopPropagation()}>
        <div className="pv-lightbox__label">GCash Receipt — {orderNumber}</div>
        {src ? (
          <img src={src} alt={`GCash receipt for ${orderNumber}`} className="pv-lightbox__img" />
        ) : (
          <div className="pv-lightbox__placeholder">
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

// ─── Reject Modal ─────────────────────────────────────────────────────────────
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
    if (!reason.trim()) { setError('Please provide a rejection reason.'); return; }
    setLoading(true); setError('');
    try {
      await onConfirm(order.id, reason.trim());
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to reject. Try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="pv-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="reject-modal-title">
      <div className="pv-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pv-modal__header">
          <div className="pv-modal__title-row">
            <span className="pv-modal__icon pv-modal__icon--reject" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </span>
            <h2 className="pv-modal__title" id="reject-modal-title">Reject Receipt</h2>
          </div>
          <button className="pv-modal__close" onClick={onClose} aria-label="Close modal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Order context */}
        <div className="pv-modal__context">
          <span className="pv-modal__order-no">{order.order_number}</span>
          <span className="pv-modal__sep" aria-hidden="true">·</span>
          <span className="pv-modal__customer">{order.customer_name}</span>
          <span className="pv-modal__sep" aria-hidden="true">·</span>
          <span className="pv-modal__amount">{formatPeso(order.total_amount)}</span>
        </div>

        <div className="pv-modal__body">
          {/* Quick reason chips */}
          <p className="pv-modal__label">Quick reasons</p>
          <div className="pv-modal__chips">
            {QUICK_REASONS.map(r => (
              <button
                key={r}
                type="button"
                className={`pv-chip${reason === r ? ' pv-chip--active' : ''}`}
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Custom reason */}
          <label className="pv-modal__label" htmlFor="reject-reason">
            Rejection reason <span className="pv-modal__req" aria-hidden="true">*</span>
          </label>
          <textarea
            ref={textareaRef}
            id="reject-reason"
            className={`pv-modal__textarea${error ? ' pv-modal__textarea--error' : ''}`}
            placeholder="Describe why the receipt was rejected…"
            value={reason}
            onChange={e => { setReason(e.target.value); if (error) setError(''); }}
            rows={3}
            aria-describedby={error ? 'reject-error' : undefined}
            aria-required="true"
          />
          {error && <p className="pv-modal__error" id="reject-error" role="alert">{error}</p>}

          <p className="pv-modal__hint">
            The customer will be notified and asked to re-upload a valid receipt.
          </p>
        </div>

        <div className="pv-modal__footer">
          <button className="pv-btn pv-btn--ghost" onClick={onClose} disabled={loading} type="button">
            Cancel
          </button>
          <button
            className="pv-btn pv-btn--reject"
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            type="button"
            aria-busy={loading}
          >
            {loading ? (
              <span className="pv-btn__spinner" aria-hidden="true" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            )}
            {loading ? 'Rejecting…' : 'Reject Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Row (collapsible) ──────────────────────────────────────────────────
function OrderRow({ order, onVerify, onReject, onViewReceipt }) {
  const [expanded, setExpanded] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const rowId = `pv-row-${order.id}`;
  const detailId = `pv-detail-${order.id}`;

  const handleVerify = async () => {
    setVerifying(true);
    try { await onVerify(order.id); }
    finally { setVerifying(false); }
  };

  const isRejected = order.payment_status === 'rejected';

  return (
    <div className={`pv-row${expanded ? ' pv-row--open' : ''}${isRejected ? ' pv-row--rejected' : ''}`}>
      {/* ── Summary bar ── */}
      <button
        className="pv-row__bar"
        onClick={() => setExpanded(x => !x)}
        aria-expanded={expanded}
        aria-controls={detailId}
        id={rowId}
      >
        {/* Expand icon */}
        <span className={`pv-row__chevron${expanded ? ' pv-row__chevron--open' : ''}`} aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>

        {/* Order number */}
        <span className="pv-row__order-no">{order.order_number}</span>

        {/* Customer */}
        <span className="pv-row__customer">
          <span className="pv-row__avatar" aria-hidden="true">{order.customer_name?.[0]?.toUpperCase()}</span>
          <span className="pv-row__customer-name">{order.customer_name}</span>
        </span>

        {/* Ref number */}
        <span className="pv-row__ref-wrap">
          {order.gcash_ref_number ? (
            <span className="pv-row__ref">{order.gcash_ref_number}</span>
          ) : (
            <span className="pv-row__ref pv-row__ref--missing" title="OCR could not read the reference number">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              No ref — check image
            </span>
          )}
        </span>

        {/* Amount */}
        <span className="pv-row__amount">{formatPeso(order.total_amount)}</span>

        {/* Status + time */}
        <span className="pv-row__meta">
          <StatusBadge status={order.payment_status} />
          <span className="pv-row__time">{timeAgo(order.submitted_at)}</span>
        </span>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="pv-row__detail" id={detailId} role="region" aria-labelledby={rowId}>
          <div className="pv-detail">
            {/* Left: receipt + info */}
            <div className="pv-detail__left">
              {/* Receipt thumbnail */}
              <div className="pv-detail__receipt-wrap">
                <button
                  className="pv-detail__receipt-btn"
                  onClick={() => onViewReceipt(order)}
                  aria-label={`View full receipt for ${order.order_number}`}
                  type="button"
                >
                  {order.receipt_image_url ? (
                    <img
                      src={order.receipt_image_url}
                      alt={`GCash receipt for ${order.order_number}`}
                      className="pv-detail__receipt-img"
                      loading="lazy"
                    />
                  ) : (
                    <div className="pv-detail__receipt-placeholder" aria-hidden="true">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </div>
                  )}
                  <span className="pv-detail__receipt-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    View full receipt
                  </span>
                </button>
              </div>

              {/* GCash details */}
              <dl className="pv-detail__info">
                <div className="pv-detail__info-row">
                  <dt>GCash Ref</dt>
                  <dd className={order.gcash_ref_number ? '' : 'pv-detail__info--missing'}>
                    {order.gcash_ref_number || '— (OCR failed, check image)'}
                  </dd>
                </div>
                <div className="pv-detail__info-row">
                  <dt>Customer</dt>
                  <dd>{order.customer_name}</dd>
                </div>
                <div className="pv-detail__info-row">
                  <dt>Mobile</dt>
                  <dd>{order.customer_mobile || '—'}</dd>
                </div>
                <div className="pv-detail__info-row">
                  <dt>Submitted</dt>
                  <dd>{new Date(order.submitted_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd>
                </div>
                {isRejected && order.rejection_reason && (
                  <div className="pv-detail__info-row pv-detail__info-row--rejection">
                    <dt>Last Rejection</dt>
                    <dd>{order.rejection_reason}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Right: order items */}
            <div className="pv-detail__right">
              <p className="pv-detail__items-label">Order Items</p>
              <ul className="pv-detail__items" aria-label={`Items in ${order.order_number}`}>
                {(order.items || []).map((item, i) => (
                  <li key={i} className="pv-detail__item">
                    <span className="pv-detail__item-qty">{item.quantity}×</span>
                    <span className="pv-detail__item-name">{item.name}</span>
                    <span className="pv-detail__item-price">{formatPeso(item.unit_price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="pv-detail__total">
                <span>Total</span>
                <span>{formatPeso(order.total_amount)}</span>
              </div>

              {/* Actions */}
              <div className="pv-detail__actions">
                <button
                  className="pv-btn pv-btn--ghost pv-btn--sm"
                  onClick={() => onReject(order)}
                  type="button"
                  aria-label={`Reject receipt for ${order.order_number}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Reject
                </button>
                <button
                  className="pv-btn pv-btn--verify pv-btn--sm"
                  onClick={handleVerify}
                  disabled={verifying}
                  type="button"
                  aria-label={`Verify payment for ${order.order_number}`}
                  aria-busy={verifying}
                >
                  {verifying ? (
                    <span className="pv-btn__spinner" aria-hidden="true" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                  {verifying ? 'Verifying…' : 'Verify Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ filter }) {
  return (
    <div className="pv-empty">
      <div className="pv-empty__icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
      </div>
      <p className="pv-empty__title">
        {filter === 'rejected' ? 'No rejected receipts' : 'Queue is clear'}
      </p>
      <p className="pv-empty__sub">
        {filter === 'rejected'
          ? 'No receipts have been rejected recently.'
          : 'No pending GCash receipts waiting for verification.'}
      </p>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="pv-skeleton" aria-hidden="true">
      <div className="pv-skeleton__col pv-skeleton__col--sm" />
      <div className="pv-skeleton__col pv-skeleton__col--md" />
      <div className="pv-skeleton__col pv-skeleton__col--lg" />
      <div className="pv-skeleton__col pv-skeleton__col--sm" />
      <div className="pv-skeleton__col pv-skeleton__col--md" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PaymentVerificationPage() {
  const [orders, setOrders]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('all');     // 'all' | 'awaiting' | 'rejected'
  const [search, setSearch]           = useState('');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [lightboxOrder, setLightboxOrder] = useState(null);
  const [liveIndicator, setLiveIndicator] = useState(false);
  const { toasts, show: showToast }   = useToast();
  const liveTimerRef = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPending = useCallback(async () => {
    try {
      const res = await paymentVerificationAPI.getPending();
      setOrders(res.data?.payments || []);
    } catch {
      showToast('Could not load payment queue.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  // ── Socket: real-time payment queue updates ───────────────────────────────
  useEffect(() => {
    // connectSocket connects the shared socket (if not already connected)
    // and joins the 'staff' room. Safe to call multiple times.
    const socket = connectSocket('staff');

    const flashLive = (label) => {
      clearTimeout(liveTimerRef.current);
      setLiveIndicator(true);
      liveTimerRef.current = setTimeout(() => setLiveIndicator(false), 2500);
      if (label) showToast(label, 'info');
    };

    // On reconnect, re-join the staff room (socket forgets rooms on disconnect)
    const onConnect = () => {
      socket.emit('join', { room: 'staff' });
    };

    // payment:pending — customer uploaded (or re-uploaded) a GCash receipt
    const onPaymentPending = (data) => {
      setOrders(prev => {
        const exists = prev.find(o => o.id === data.order_id);
        if (exists) {
          return prev.map(o =>
            o.id === data.order_id
              ? { ...o, ...data, payment_status: 'awaiting_verification', rejection_reason: null }
              : o
          );
        }
        return [{ ...data, id: data.order_id }, ...prev];
      });
      flashLive(`New receipt — ${data.order_number || `Order #${data.order_id}`}`);
    };

    // payment:verified — a staff member verified a receipt (incl. ourselves)
    const onPaymentVerified = ({ orderId }) => {
      setOrders(prev => prev.filter(o => o.id !== orderId));
    };

    // payment:rejected — a staff member rejected a receipt (incl. ourselves)
    const onPaymentRejected = ({ orderId, reason }) => {
      setOrders(prev => prev.map(o =>
        o.id === orderId
          ? { ...o, payment_status: 'rejected', rejection_reason: reason }
          : o
      ));
    };

    socket.on('connect',          onConnect);
    socket.on('payment:pending',  onPaymentPending);
    socket.on('payment:verified', onPaymentVerified);
    socket.on('payment:rejected', onPaymentRejected);

    return () => {
      socket.off('connect',          onConnect);
      socket.off('payment:pending',  onPaymentPending);
      socket.off('payment:verified', onPaymentVerified);
      socket.off('payment:rejected', onPaymentRejected);
      clearTimeout(liveTimerRef.current);
      // Do NOT disconnect — socket is shared across the whole staff app.
      // Disconnection only happens on logout (AuthContext/disconnectSocket).
    };
  }, [showToast]);

  // ── Verify ────────────────────────────────────────────────────────────────
  const handleVerify = useCallback(async (orderId) => {
    try {
      await paymentVerificationAPI.verify(orderId);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      showToast('Payment verified — order sent to kitchen.', 'success');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Verification failed.', 'error');
      throw err;
    }
  }, [showToast]);

  // ── Reject ────────────────────────────────────────────────────────────────
  const handleRejectConfirm = useCallback(async (orderId, reason) => {
    await paymentVerificationAPI.reject(orderId, reason);
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, payment_status: 'rejected', rejection_reason: reason } : o
    ));
    showToast('Receipt rejected — customer notified to re-upload.', 'info');
  }, [showToast]);

  // ── Filter + Search ───────────────────────────────────────────────────────
  const filtered = orders.filter(o => {
    if (filter === 'awaiting' && o.payment_status !== 'awaiting_verification') return false;
    if (filter === 'rejected'  && o.payment_status !== 'rejected')              return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.order_number?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.gcash_ref_number?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all:      orders.length,
    awaiting: orders.filter(o => o.payment_status === 'awaiting_verification').length,
    rejected: orders.filter(o => o.payment_status === 'rejected').length,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="pv-page">
      <ToastStack toasts={toasts} />

      {/* ── Header ── */}
      <header className="pv-header">
        <div className="pv-header__left">
          <div className="pv-header__title-row">
            <h1 className="pv-header__title">Payment Verification</h1>
            {liveIndicator && (
              <span className="pv-live" aria-live="polite" aria-label="New receipt received">
                <span className="pv-live__dot" aria-hidden="true" />
                New receipt
              </span>
            )}
          </div>
          <p className="pv-header__sub">
            Review GCash receipts before orders reach the kitchen
          </p>
        </div>

        {/* Count summary chips */}
        <div className="pv-header__counts" aria-label="Queue summary">
          {counts.awaiting > 0 && (
            <span className="pv-count pv-count--awaiting">
              <span className="pv-count__dot" aria-hidden="true" />
              {counts.awaiting} awaiting
            </span>
          )}
          {counts.rejected > 0 && (
            <span className="pv-count pv-count--rejected">
              {counts.rejected} rejected
            </span>
          )}
          {counts.awaiting === 0 && counts.rejected === 0 && (
            <span className="pv-count pv-count--clear">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Queue clear
            </span>
          )}
        </div>
      </header>

      {/* ── Toolbar ── */}
      <div className="pv-toolbar">
        {/* Search */}
        <div className="pv-search">
          <span className="pv-search__icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            type="search"
            className="pv-search__input"
            placeholder="Search order, customer, or GCash ref…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search payment queue"
          />
          {search && (
            <button className="pv-search__clear" onClick={() => setSearch('')} aria-label="Clear search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="pv-filters" role="tablist" aria-label="Filter payment queue">
          {[
            { key: 'all',      label: 'All',      count: counts.all },
            { key: 'awaiting', label: 'Awaiting', count: counts.awaiting },
            { key: 'rejected', label: 'Rejected', count: counts.rejected },
          ].map(tab => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={filter === tab.key}
              className={`pv-filter-tab${filter === tab.key ? ' pv-filter-tab--active' : ''}`}
              onClick={() => setFilter(tab.key)}
              type="button"
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`pv-filter-tab__count${filter === tab.key ? ' pv-filter-tab__count--active' : ''}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          className="pv-btn pv-btn--icon"
          onClick={fetchPending}
          aria-label="Refresh queue"
          title="Refresh"
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {/* ── Table header (desktop) ── */}
      <div className="pv-table-head" aria-hidden="true">
        <span className="pv-table-head__col pv-table-head__col--icon" />
        <span className="pv-table-head__col pv-table-head__col--order">Order</span>
        <span className="pv-table-head__col pv-table-head__col--customer">Customer</span>
        <span className="pv-table-head__col pv-table-head__col--ref">GCash Ref</span>
        <span className="pv-table-head__col pv-table-head__col--amount">Amount</span>
        <span className="pv-table-head__col pv-table-head__col--status">Status</span>
      </div>

      {/* ── Order list ── */}
      <div className="pv-list" role="list" aria-label="Payment verification queue">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <SkeletonRow key={i} />)
        ) : filtered.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          filtered.map(order => (
            <div key={order.id} role="listitem">
              <OrderRow
                order={order}
                onVerify={handleVerify}
                onReject={setRejectTarget}
                onViewReceipt={setLightboxOrder}
              />
            </div>
          ))
        )}
      </div>

      {/* ── Gate rule notice ── */}
      <aside className="pv-notice" aria-label="Important note">
        <span className="pv-notice__icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </span>
        GCash orders only reach the kitchen after you verify the receipt here. COD orders skip this queue and go straight to kitchen.
      </aside>

      {/* ── Modals ── */}
      {rejectTarget && (
        <RejectModal
          order={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onConfirm={handleRejectConfirm}
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