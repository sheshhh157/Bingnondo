import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import {
  dispatchCurrentBatch,
  getCurrentBatch,
  getCurrentDelivery,
  updateDeliveryStatus,
} from '../../services/riderApi';
import { useSocketEventContext } from '../../context/SocketContext';
import { itemLabel } from '../../utils/format';
import '../../styles/ActiveDelivery.css';
import '../../styles/DeliveryMap.css';

const DeliveryMap = lazy(() => import('./DeliveryMap'));

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
function IconClock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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

function formatCurrency(n) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatCountdown(ms) {
  if (ms == null || ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ── Confirm modal ──────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel, loading }) {
  return (
    <div className="ad-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm action">
      <div className="ad-modal">
        <p className="ad-modal__message">{message}</p>
        <div className="ad-modal__actions">
          <button className="ad-btn ad-btn--ghost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="ad-btn ad-btn--primary" onClick={onConfirm} disabled={loading} aria-busy={loading}>
            {loading ? <span className="ad-spinner" aria-label="Processing" /> : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Batch waiting screen ───────────────────────────────────────────────────────
function BatchWaitingScreen({ batch, onDispatch, loading }) {
  const [countdown, setCountdown] = useState(batch.timer_remaining_ms ?? 0);

  useEffect(() => {
    if (!batch.timer_remaining_ms) return;
    const interval = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [batch.timer_remaining_ms]);

  const stopCount  = batch.stops?.length ?? 0;
  const maxStops   = batch.max_orders ?? 10;

  return (
    <div className="ad-waiting-screen">
      <div className="ad-waiting-screen__icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>

      <h2 className="ad-waiting-screen__title">Collecting Orders</h2>
      <p className="ad-waiting-screen__sub">
        Waiting for more orders before dispatching your batch.
        Slide to dispatch when ready. The batch also dispatches automatically at {maxStops} orders or when the timer runs out.
      </p>

      {/* Timer ring */}
      <div className="ad-batch-timer" role="timer" aria-live="polite" aria-label={`Time remaining: ${formatCountdown(countdown)}`}>
        <div className="ad-batch-timer__ring">
          <svg viewBox="0 0 44 44" width="88" height="88" aria-hidden="true">
            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--rl-border)" strokeWidth="3"/>
            <circle
              cx="22" cy="22" r="18" fill="none"
              stroke="var(--rl-primary, #EA580C)" strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 18}`}
              strokeDashoffset={`${2 * Math.PI * 18 * (1 - countdown / (20 * 60 * 1000))}`}
              strokeLinecap="round"
              transform="rotate(-90 22 22)"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <span className="ad-batch-timer__label">{formatCountdown(countdown)}</span>
        </div>
        <p className="ad-batch-timer__hint">Time until auto-dispatch</p>
      </div>

      <p className="ad-waiting-screen__count">
        <strong>{stopCount}</strong> of {maxStops} orders collected
      </p>
      <SlideAction
        onConfirm={onDispatch}
        loading={loading}
        label="Slide to Dispatch Orders →"
        loadingLabel="Dispatching…"
        ariaLabel="Slide to dispatch collected orders"
      />

      {/* Order slots */}
      <div className="ad-batch-slots">
        {Array.from({ length: maxStops }).map((_, i) => {
          const stop = batch.stops?.[i];
          return (
            <div key={i} className={`ad-batch-slot${stop ? ' ad-batch-slot--filled' : ''}`}>
              {stop ? (
                <>
                  <span className="ad-batch-slot__num">{i + 1}</span>
                  <span className="ad-batch-slot__name">{stop.customer_name}</span>
                  <span className="ad-batch-slot__order">{stop.order_number}</span>
                </>
              ) : (
                <>
                  <span className="ad-batch-slot__num ad-batch-slot__num--empty">{i + 1}</span>
                  <span className="ad-batch-slot__empty">Waiting…</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Reusable slide action ──────────────────────────────────────────────────────
function SlideAction({ onConfirm, loading, label, loadingLabel, ariaLabel }) {
  const trackRef   = useRef(null);
  const thumbRef   = useRef(null);
  const dragRef    = useRef({ dragging: false, startX: 0, currentX: 0 });
  const [pct, setPct]         = useState(0);   // 0–100 progress
  const [fired, setFired]     = useState(false);
  const THRESHOLD = 85; // % to trigger

  const getTrackWidth = () =>
    (trackRef.current?.clientWidth ?? 260) - (thumbRef.current?.clientWidth ?? 52);

  const startDrag = (clientX) => {
    if (fired || loading) return;
    dragRef.current = { dragging: true, startX: clientX, currentX: clientX };
  };

  const triggerAction = () => {
    setFired(true);
    setPct(100);
    const result = onConfirm();
    if (result && typeof result.then === 'function') {
      result.then((succeeded) => {
        if (succeeded === false) {
          setFired(false);
          setPct(0);
        }
      });
    } else if (result === false) {
      setFired(false);
      setPct(0);
    }
  };

  const moveDrag = (clientX) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.currentX = clientX;
    const dx  = clientX - dragRef.current.startX;
    const max = getTrackWidth();
    const p   = Math.max(0, Math.min(100, (dx / max) * 100));
    setPct(p);
    if (p >= THRESHOLD) {
      dragRef.current.dragging = false;
      triggerAction();
    }
  };

  const endDrag = () => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    if (pct < THRESHOLD) setPct(0); // snap back
  };

  // Touch handlers
  const onTouchStart = (e) => startDrag(e.touches[0].clientX);
  const onTouchMove  = (e) => { e.preventDefault(); moveDrag(e.touches[0].clientX); };
  const onTouchEnd   = () => endDrag();

  // Mouse handlers (desktop testing)
  const onMouseDown = (e) => { e.preventDefault(); startDrag(e.clientX); };
  const onMouseMove = (e) => { if (dragRef.current.dragging) moveDrag(e.clientX); };
  const onMouseUp   = () => endDrag();

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',  onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',  onMouseUp);
    };
  });

  return (
    <div
      ref={trackRef}
      className={`ad-slide-track${fired || loading ? ' ad-slide-track--done' : ''}`}
      aria-label={ariaLabel}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !fired && !loading) {
          event.preventDefault();
          triggerAction();
        }
      }}
    >
      {/* Background fill */}
      <div className="ad-slide-fill" style={{ width: `${pct}%` }} />

      {/* Label */}
      <span className="ad-slide-label" style={{ opacity: fired || loading ? 0 : 1 - pct / 60 }}>
        {loading ? loadingLabel : label}
      </span>

      {/* Thumb */}
      <div
        ref={thumbRef}
        className="ad-slide-thumb"
        style={{ transform: `translateX(calc(${pct / 100} * (100cqw - 100%)))` }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {fired || loading
          ? <span className="ad-spinner ad-spinner--sm" />
          : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          )
        }
      </div>
    </div>
  );
}

// ── Full-view modal ────────────────────────────────────────────────────────────
// MAP = buong screen.
// Floating overlays on top of the map:
//   TOP BAR   — back button + address + mobile number
//   BOTTOM    — items summary pill (tap to expand) + action button
//   ITEMS MODAL — semi-transparent sheet when items pill is tapped
function StopFullView({ stop, onClose, onStatusClick, actionLoading }) {
  const [showItems, setShowItems] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const isDelivered      = stop.delivery_status === 'delivered';
  const isOutForDelivery = stop.delivery_status === 'out_for_delivery';
  const itemCount        = stop.items?.length ?? 0;

  return (
    <div className="ad-fullview-overlay" role="dialog" aria-modal="true" aria-label="Stop details">

      {/* ── MAP — buong screen ── */}
      <div className="ad-fullview-map-bg">
        <Suspense fallback={
          <div className="ad-loading" style={{ height: '100%' }}>
            <span className="ad-spinner" /><p style={{ fontSize: '0.8rem' }}>Loading map…</p>
          </div>
        }>
          <DeliveryMap
            delivery={{
              destination_latitude:  stop.destination_latitude,
              destination_longitude: stop.destination_longitude,
            }}
            isActive={isOutForDelivery}
            fullView
          />
        </Suspense>
      </div>

      {/* ── TOP BAR — back + address + mobile ── */}
      <div className="ad-fv-topbar">
        <button className="ad-fv-topbar__back" onClick={onClose} aria-label="Close full view">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="ad-fv-topbar__info">
          <div className="ad-fv-topbar__name">
            {stop.customer_name}
            <span className="ad-fv-topbar__order-num">{stop.order_number}</span>
          </div>
          <div className="ad-fv-topbar__address">
            <IconPin /> {stop.delivery_address}
          </div>
          {stop.customer_contact && (
            <a href={`tel:${stop.customer_contact}`} className="ad-fv-topbar__phone">
              <IconPhone /> {stop.customer_contact}
            </a>
          )}
        </div>
      </div>

      {/* ── BOTTOM OVERLAY — items pill + action ── */}
      <div className="ad-fv-bottom">
        {/* Items summary pill */}
        <button
          className="ad-fv-items-pill"
          onClick={() => setShowItems(true)}
          aria-label="View order items"
        >
          <IconPackage />
          <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          <span className="ad-fv-items-pill__dot" />
          <span className="ad-fv-items-pill__total">{formatCurrency(stop.total_amount)}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {/* Action */}
        <div className="ad-fv-action">
          {isDelivered ? (
            <div className="ad-delivered-note">
              <IconCheck /> Delivered at {formatTime(stop.delivered_at)}
            </div>
          ) : isOutForDelivery ? (
            <SlideAction
              onConfirm={() => onStatusClick(stop.delivery_id, 'delivered')}
              loading={actionLoading}
              label="Slide to Mark as Delivered →"
              loadingLabel="Marking…"
              ariaLabel="Slide to mark as delivered"
            />
          ) : (
            <button
              className="ad-btn ad-btn--primary ad-btn--full"
              onClick={() => onStatusClick(stop.delivery_id, 'out_for_delivery')}
              disabled={actionLoading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 8 16 12 12 16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              Pick Up — Start Delivery
            </button>
          )}
        </div>
      </div>

      {/* ── ITEMS MODAL — appears on top when pill tapped ── */}
      {showItems && (
        <div className="ad-fv-items-modal" role="dialog" aria-label="Order items">
          <div className="ad-fv-items-modal__card">
            <div className="ad-fv-items-modal__header">
              <span className="ad-fv-items-modal__title">
                <IconPackage /> Order Items
              </span>
              <button
                className="ad-fv-items-modal__close"
                onClick={() => setShowItems(false)}
                aria-label="Close items"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <ul className="ad-items ad-items--fv">
              {(stop.items || []).map((item, i) => (
                <li key={i} className="ad-item">
                  <span className="ad-item__qty">{item.quantity}×</span>
                  <span className="ad-item__name">{itemLabel(item)}</span>
                  <span className="ad-item__price">{formatCurrency(item.unit_price * item.quantity)}</span>
                </li>
              ))}
            </ul>

            {stop.special_request && (
              <div className="ad-special-note" style={{ marginTop: 8 }}>
                <span className="ad-special-note__label">Note:</span>
                {stop.special_request}
              </div>
            )}

            <div className="ad-total ad-total--fv">
              <span>Total</span>
              <span className="ad-total__amount">{formatCurrency(stop.total_amount)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Single stop card ───────────────────────────────────────────────────────────
function StopCard({ stop, stopNumber, onStatusClick, isCurrent, onOpenFullView }) {
  const [expanded, setExpanded] = useState(isCurrent);
  const isDelivered = stop.delivery_status === 'delivered';

  return (
    <div className={`ad-stop-card${isCurrent ? ' ad-stop-card--active' : ''}${isDelivered ? ' ad-stop-card--done' : ''}`}>
      {/* Stop header */}
      <button
        className="ad-stop-card__header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="ad-stop-card__header-left">
          <span className={`ad-stop-num${isCurrent ? ' ad-stop-num--active' : ''}${isDelivered ? ' ad-stop-num--done' : ''}`}>
            {isDelivered ? <IconCheck /> : stopNumber}
          </span>
          <div>
            <div className="ad-stop-card__customer">{stop.customer_name}</div>
            <div className="ad-stop-card__order-num">{stop.order_number}</div>
          </div>
        </div>
        <div className="ad-stop-card__header-right">
          <StatusBadge status={stop.delivery_status} />
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="ad-stop-card__body">
          {/* Contact & address */}
          <div className="ad-info-row ad-info-row--address">
            <span className="ad-info-row__icon"><IconPin /></span>
            <span className="ad-info-row__value">{stop.delivery_address}</span>
          </div>
          {stop.customer_contact && (
            <div className="ad-info-row">
              <span className="ad-info-row__icon"><IconPhone /></span>
              <a href={`tel:${stop.customer_contact}`} className="ad-info-row__link">
                {stop.customer_contact}
              </a>
            </div>
          )}

          {/* Items summary */}
          <div className="ad-stop-card__items-label">
            <IconPackage /> Order Items
          </div>
          <ul className="ad-items">
            {(stop.items || []).map((item, i) => (
              <li key={i} className="ad-item">
                <span className="ad-item__qty">{item.quantity}×</span>
                <span className="ad-item__name">{itemLabel(item)}</span>
                <span className="ad-item__price">{formatCurrency(item.unit_price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          {stop.special_request && (
            <div className="ad-special-note">
              <span className="ad-special-note__label">Note:</span>
              {stop.special_request}
            </div>
          )}
          <div className="ad-total">
            <span>Total</span>
            <span className="ad-total__amount">{formatCurrency(stop.total_amount)}</span>
          </div>

          {/* Actions */}
          {isCurrent && !isDelivered && (
            <div className="ad-card__actions" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stop.delivery_status === 'assigned' && (
                <button
                  className="ad-btn ad-btn--primary ad-btn--full"
                  onClick={() => onStatusClick(stop.delivery_id, 'out_for_delivery')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                  Pick Up — Start Delivery
                </button>
              )}

              {/* Full View button — always shown for current non-delivered stop */}
              <button
                className="ad-btn ad-btn--outline ad-btn--full"
                onClick={() => onOpenFullView(stop)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                </svg>
                Full View
              </button>
            </div>
          )}

          {isDelivered && (
            <div className="ad-delivered-note">
              <IconCheck /> Delivered at {formatTime(stop.delivered_at)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── No delivery state ──────────────────────────────────────────────────────────
function NoDelivery() {
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
      <p className="ad-empty__sub">You have no delivery assigned right now. Check back when staff assigns one.</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ActiveDelivery() {
  const [batch,         setBatch]       = useState(null);
  const [loading,       setLoading]     = useState(true);
  const [error,         setError]       = useState('');
  const [confirm,       setConfirm]     = useState(null);
  const [actionLoad,    setActionLoad]  = useState(false);
  const [successMsg,    setSuccess]     = useState('');
  const [initialLoad,   setInitial]     = useState(true);
  const [fullViewStop,  setFullView]    = useState(null); // stop object shown in full-view
  const { subscribe } = useSocketEventContext();

  const fetchBatch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getCurrentBatch();
      setBatch(res.batch || null);
    } catch (err) {
      // Fallback: try single-delivery endpoint for backwards compat
      try {
        const res2 = await getCurrentDelivery();
        if (res2.delivery) {
          // Wrap in fake batch shape
          setBatch({
            batch_id: null,
            status: 'in_progress',
            timer_remaining_ms: null,
            stops: [{
              ...res2.delivery,
              delivery_id:     res2.delivery.id,
              delivery_status: res2.delivery.status,
              stop_sequence:   1,
            }],
          });
        } else {
          setBatch(null);
        }
      } catch {
        setError('Failed to load delivery. Please try again.');
      }
    } finally {
      setInitial(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBatch(); }, [fetchBatch]);

  // Socket: re-fetch on delivery:new, delivery:update, batch:dispatched
  useEffect(() => {
    return subscribe((name) => {
      if (['delivery:new', 'delivery:update', 'batch:dispatched'].includes(name)) {
        fetchBatch();
      }
    });
  }, [subscribe, fetchBatch]);

  // Called from both StopCard (needs confirm modal) and StopFullView
  // (slide-to-deliver bypasses the modal — it IS the confirmation gesture)
  const handleStatusClick = (deliveryId, nextStatus, skipConfirm = false) => {
    if (skipConfirm || nextStatus === 'delivered') {
      // Delivered action: either via slide (skipConfirm=true) or direct call from fullview
      // The slide button itself is the confirm gesture — no modal needed
      return executeStatusChange(deliveryId, nextStatus);
    }
    const messages = {
      out_for_delivery: 'Mark this stop as Out for Delivery?',
    };
    setConfirm({ deliveryId, status: nextStatus, message: messages[nextStatus] });
  };

  const executeStatusChange = async (deliveryId, status) => {
    setActionLoad(true);
    try {
      await updateDeliveryStatus(deliveryId, status);
      setSuccess(
        status === 'delivered'
          ? 'Stop marked as delivered!'
          : 'On the way — customer has been notified.'
      );
      // If full view is open, close it after delivered
      if (status === 'delivered') setFullView(null);
      await fetchBatch();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed. Please try again.');
      return false;
    } finally {
      setActionLoad(false);
      setTimeout(() => setSuccess(''), 3500);
    }
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    await executeStatusChange(confirm.deliveryId, confirm.status);
    setConfirm(null);
  };

  const firstLoad  = loading && initialLoad;
  const refreshing = loading && !initialLoad;

  if (firstLoad) {
    return (
      <div className="ad-loading" role="status" aria-live="polite">
        <span className="ad-spinner ad-spinner--lg" aria-label="Loading delivery" />
        <p>Loading your delivery…</p>
      </div>
    );
  }

  // Find current active stop (first non-delivered stop, ordered by stop_sequence)
  const stops = batch?.stops ?? [];
  const activeStop = stops.find((s) =>
    s.delivery_status !== 'delivered' && s.delivery_status !== 'cancelled'
  );
  const deliveredCount = stops.filter((s) => s.delivery_status === 'delivered').length;

  return (
    <div className="ad-root">
      <header className="ad-header">
        <div>
          <h1 className="ad-header__title">Active Delivery</h1>
          <p className="ad-header__sub">
            {batch?.status === 'waiting'
              ? 'Collecting orders for your batch…'
              : batch
                ? `Stop ${deliveredCount + 1} of ${stops.length}`
                : 'Your current assigned order'}
          </p>
        </div>
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
          <IconCheck />{successMsg}
        </div>
      )}

      {!batch ? (
        <NoDelivery />
      ) : batch.status === 'waiting' ? (
        <div className={`ad-card${refreshing ? ' ad-card--busy' : ''}`}>
          <BatchWaitingScreen
            batch={batch}
            onDispatch={async () => {
              setActionLoad(true);
              try {
                await dispatchCurrentBatch();
                setSuccess('Batch dispatched! You can start your delivery route.');
                await fetchBatch();
                return true;
              } catch (err) {
                setError(err.response?.data?.message || 'Could not dispatch the batch. Please try again.');
                return false;
              } finally {
                setActionLoad(false);
                setTimeout(() => setSuccess(''), 3500);
              }
            }}
            loading={actionLoad}
          />
        </div>
      ) : (
        <div className={`ad-card${refreshing ? ' ad-card--busy' : ''}`} aria-busy={refreshing}>
          {/* Batch progress header */}
          {stops.length > 1 && (
            <div className="ad-batch-progress">
              <div className="ad-batch-progress__label">
                <IconClock />
                Batch Progress — {deliveredCount}/{stops.length} delivered
              </div>
              <div className="ad-batch-progress__bar">
                <div
                  className="ad-batch-progress__fill"
                  style={{ width: `${(deliveredCount / stops.length) * 100}%` }}
                />
              </div>
              <div className="ad-batch-progress__stops">
                {stops.map((s, i) => (
                  <div
                    key={s.delivery_id}
                    className={`ad-batch-progress__dot${s.delivery_status === 'delivered' ? ' ad-batch-progress__dot--done' : ''}${s === activeStop ? ' ad-batch-progress__dot--active' : ''}`}
                    title={`Stop ${i + 1}: ${s.customer_name}`}
                  >
                    {s.delivery_status === 'delivered' ? '✓' : i + 1}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stop cards */}
          <div className="ad-stops-list">
            {stops.map((stop, i) => (
              <StopCard
                key={stop.delivery_id}
                stop={stop}
                stopNumber={i + 1}
                totalStops={stops.length}
                isCurrent={stop === activeStop}
                onStatusClick={handleStatusClick}
                onOpenFullView={setFullView}
              />
            ))}
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
          loading={actionLoad}
        />
      )}

      {/* Full-view modal — both pick-up and delivered execute directly,
          no confirm modal needed since opening Full View is already intentional */}
      {fullViewStop && (
        <StopFullView
          stop={fullViewStop}
          onClose={() => setFullView(null)}
          onStatusClick={(id, status) => executeStatusChange(id, status)}
          actionLoading={actionLoad}
        />
      )}
    </div>
  );
}