import { useState, useEffect, useCallback, useRef } from 'react';
import { deliveryAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import '../../styles/DeliveryPage.css';

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState('');
  const [type, setType] = useState('success');
  const t = useRef(null);
  const show = useCallback((message, tp = 'success') => {
    clearTimeout(t.current);
    setMsg(message); setType(tp);
    t.current = setTimeout(() => setMsg(''), 3200);
  }, []);
  return { msg, type, show };
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending_assignment: { label: 'Pending',       cls: 'dl-badge--pending' },
    assigned:           { label: 'Assigned',       cls: 'dl-badge--assigned' },
    out_for_delivery:   { label: 'Out for delivery', cls: 'dl-badge--out' },
    delivered:          { label: 'Delivered',      cls: 'dl-badge--done' },
    cancelled:          { label: 'Cancelled',      cls: 'dl-badge--cancelled' },
  };
  const { label, cls } = map[status] || { label: status, cls: '' };
  return <span className={`dl-badge ${cls}`}>{label}</span>;
}

// ─── Preference badge ─────────────────────────────────────────────────────────
function PrefBadge({ pref }) {
  return pref === 'lalamove'
    ? <span className="dl-pref dl-pref--lalamove">Lalamove</span>
    : <span className="dl-pref dl-pref--own">Own Delivery</span>;
}

// ─── Time ago ─────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────
function AssignModal({ delivery, onClose, onAssign }) {
  const isLalamove = delivery.delivery_preference === 'lalamove';

  const [riderName,    setRiderName]    = useState('');
  const [riderContact, setRiderContact] = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isLalamove) {
      if (!riderName.trim())    { setError('Rider name is required.');    return; }
      if (!riderContact.trim()) { setError('Rider contact is required.'); return; }
    }
    setLoading(true); setError('');
    try {
      await onAssign(delivery.id, {
        delivery_preference: delivery.delivery_preference,
        rider_name:    isLalamove ? null : riderName.trim(),
        rider_contact: isLalamove ? null : riderContact.trim(),
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Assignment failed. Try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="dl-overlay" onClick={onClose}>
      <div className="dl-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dl-modal-title">
        <div className="dl-modal__header">
          <h2 id="dl-modal-title" className="dl-modal__title">Assign Delivery</h2>
          <button className="dl-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="dl-modal__body">
          {/* Order summary */}
          <div className="dl-modal__order-card">
            <div className="dl-modal__order-row">
              <span className="dl-modal__order-num">{delivery.order?.order_number}</span>
              <PrefBadge pref={delivery.delivery_preference} />
            </div>
            <p className="dl-modal__order-customer">
              {delivery.order?.customer_name || 'Customer'} · {delivery.order?.customer_address || 'No address on file'}
            </p>
            <p className="dl-modal__order-items">
              {delivery.order?.order_items?.map((i) => `${i.quantity}× ${i.menu_item.name}`).join(', ')}
            </p>
          </div>

          <form id="assign-form" onSubmit={handleSubmit} noValidate>
            {isLalamove ? (
              <div className="dl-info-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p>This will trigger a Lalamove booking. A tracking ID will be saved automatically once confirmed.</p>
              </div>
            ) : (
              <div className="dl-fields">
                <div className="dl-field">
                  <label htmlFor="rider-name" className="dl-field__label">Rider name *</label>
                  <input
                    id="rider-name"
                    type="text"
                    value={riderName}
                    onChange={(e) => { setRiderName(e.target.value); setError(''); }}
                    className="dl-field__input"
                    placeholder="e.g. Juan dela Cruz"
                    autoFocus
                    required
                  />
                </div>
                <div className="dl-field">
                  <label htmlFor="rider-contact" className="dl-field__label">Rider contact *</label>
                  <input
                    id="rider-contact"
                    type="tel"
                    value={riderContact}
                    onChange={(e) => { setRiderContact(e.target.value); setError(''); }}
                    className="dl-field__input"
                    placeholder="e.g. 09171234567"
                    required
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="dl-modal__error" role="alert">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </p>
            )}
          </form>
        </div>

        <div className="dl-modal__footer">
          <button className="dl-btn dl-btn--ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="dl-btn dl-btn--primary" form="assign-form" type="submit" disabled={loading} aria-busy={loading}>
            {loading
              ? <span className="dl-spinner" aria-label="Saving…" />
              : isLalamove ? 'Book Lalamove' : 'Assign rider'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status update confirm ────────────────────────────────────────────────────
function StatusModal({ delivery, nextStatus, onClose, onConfirm }) {
  const labels = {
    out_for_delivery: 'Mark as Out for Delivery',
    delivered:        'Mark as Delivered',
    cancelled:        'Cancel Delivery',
  };

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const handle = async () => {
    setLoading(true);
    try { await onConfirm(delivery.id, nextStatus); onClose(); }
    catch { /* toast handled upstream */ }
    finally { setLoading(false); }
  };

  const isDanger = nextStatus === 'cancelled';

  return (
    <div className="dl-overlay" onClick={onClose}>
      <div className="dl-confirm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`dl-confirm__icon dl-confirm__icon--${isDanger ? 'danger' : 'info'}`} aria-hidden="true">
          {isDanger
            ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
          }
        </div>
        <h3 className="dl-confirm__title">{labels[nextStatus]}</h3>
        <p className="dl-confirm__msg">
          {isDanger
            ? `Cancel delivery for ${delivery.order?.order_number}? The customer will be notified.`
            : `Update ${delivery.order?.order_number} to "${labels[nextStatus]}"?`
          }
        </p>
        <div className="dl-confirm__actions">
          <button className="dl-btn dl-btn--ghost" onClick={onClose} disabled={loading}>Back</button>
          <button
            className={`dl-btn ${isDanger ? 'dl-btn--danger' : 'dl-btn--primary'}`}
            onClick={handle}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? <span className="dl-spinner" aria-label="Updating…" /> : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delivery row (desktop table) ─────────────────────────────────────────────
function DeliveryRow({ delivery, onAssign, onUpdateStatus }) {
  const { status, delivery_preference, order } = delivery;

  return (
    <tr className="dl-table__row">
      <td className="dl-table__td">
        <div>
          <p className="dl-table__order-num">{order?.order_number}</p>
          <p className="dl-table__time">{timeAgo(order?.created_at)}</p>
        </div>
      </td>
      <td className="dl-table__td">
        <div>
          <p className="dl-table__customer">{order?.customer_name || '—'}</p>
          <p className="dl-table__address">{order?.customer_address || 'No address'}</p>
        </div>
      </td>
      <td className="dl-table__td">
        <p className="dl-table__items">
          {order?.order_items?.map((i) => `${i.quantity}× ${i.menu_item.name}`).join(', ')}
        </p>
      </td>
      <td className="dl-table__td"><PrefBadge pref={delivery_preference} /></td>
      <td className="dl-table__td">
        {(status === 'assigned' || status === 'out_for_delivery') && delivery.rider_name && (
          <div>
            <p className="dl-table__rider">{delivery.rider_name}</p>
            <p className="dl-table__rider-contact">{delivery.rider_contact}</p>
          </div>
        )}
        {status === 'assigned' && delivery.lalamove_booking_id && (
          <p className="dl-table__rider"># {delivery.lalamove_booking_id}</p>
        )}
        {status === 'pending_assignment' && <span className="dl-table__none">—</span>}
      </td>
      <td className="dl-table__td"><StatusBadge status={status} /></td>
      <td className="dl-table__td dl-table__td--right">
        <div className="dl-table__actions">
          {status === 'pending_assignment' && (
            <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={() => onAssign(delivery)}>
              Assign
            </button>
          )}
          {status === 'assigned' && (
            <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={() => onUpdateStatus(delivery, 'out_for_delivery')}>
              Out for delivery
            </button>
          )}
          {status === 'out_for_delivery' && (
            <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={() => onUpdateStatus(delivery, 'delivered')}>
              Mark delivered
            </button>
          )}
          {['pending_assignment', 'assigned'].includes(status) && (
            <button className="dl-btn dl-btn--ghost dl-btn--sm dl-btn--danger-ghost" onClick={() => onUpdateStatus(delivery, 'cancelled')}>
              Cancel
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Delivery card (mobile) ───────────────────────────────────────────────────
function DeliveryCard({ delivery, onAssign, onUpdateStatus }) {
  const { status, delivery_preference, order } = delivery;

  return (
    <article className={`dl-card dl-card--${status}`}>
      <div className="dl-card__header">
        <div>
          <p className="dl-card__order-num">{order?.order_number}</p>
          <p className="dl-card__time">{timeAgo(order?.created_at)}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="dl-card__customer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        <span>{order?.customer_name || 'Customer'}</span>
      </div>

      <div className="dl-card__address">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        <span>{order?.customer_address || 'No address on file'}</span>
      </div>

      <div className="dl-card__items">
        {order?.order_items?.map((i) => `${i.quantity}× ${i.menu_item.name}`).join(' · ')}
      </div>

      <div className="dl-card__footer">
        <PrefBadge pref={delivery_preference} />
        {(status === 'assigned' || status === 'out_for_delivery') && delivery.rider_name && (
          <span className="dl-card__rider">{delivery.rider_name} · {delivery.rider_contact}</span>
        )}
      </div>

      <div className="dl-card__actions">
        {status === 'pending_assignment' && (
          <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={() => onAssign(delivery)}>
            Assign
          </button>
        )}
        {status === 'assigned' && (
          <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={() => onUpdateStatus(delivery, 'out_for_delivery')}>
            Out for delivery
          </button>
        )}
        {status === 'out_for_delivery' && (
          <button className="dl-btn dl-btn--primary dl-btn--sm" onClick={() => onUpdateStatus(delivery, 'delivered')}>
            Mark delivered
          </button>
        )}
        {['pending_assignment', 'assigned'].includes(status) && (
          <button className="dl-btn dl-btn--ghost dl-btn--sm dl-btn--danger-ghost" onClick={() => onUpdateStatus(delivery, 'cancelled')}>
            Cancel
          </button>
        )}
      </div>
    </article>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'pending_assignment', label: 'Pending' },
  { key: 'assigned',           label: 'Assigned' },
  { key: 'out_for_delivery',   label: 'In transit' },
  { key: 'delivered',          label: 'Delivered' },
  { key: 'all',                label: 'All' },
];

export default function DeliveryPage() {
  const [deliveries, setDeliveries]   = useState([]);
  const [loading,    setLoading]      = useState(true);
  const [error,      setError]        = useState('');
  const [activeTab,  setActiveTab]    = useState('pending_assignment');
  const [assignModal,   setAssignModal]   = useState(null);
  const [statusModal,   setStatusModal]   = useState(null); // { delivery, nextStatus }
  const { msg: toastMsg, type: toastType, show: showToast } = useToast();

  const fetchAll = useCallback(async () => {
    try {
      setError('');
      const { data } = await deliveryAPI.getAll();
      setDeliveries(data.deliveries || data);
    } catch {
      setError('Failed to load deliveries. Please try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Real-time socket — backend broadcasts rich delivery events
  useEffect(() => {
    const socket = getSocket();

    const onDeliveryUpdate = (updated) => {
      setDeliveries((prev) =>
        prev.map((d) => d.id === updated.id ? { ...d, ...updated } : d)
      );
    };

    const onDeliveryNew = (delivery) => {
      setDeliveries((prev) =>
        prev.some((d) => d.id === delivery.id) ? prev : [delivery, ...prev]
      );
    };

    socket.on('delivery_update', onDeliveryUpdate);
    socket.on('delivery_new', onDeliveryNew);
    return () => {
      socket.off('delivery_update', onDeliveryUpdate);
      socket.off('delivery_new', onDeliveryNew);
    };
  }, []);

  const handleAssign = useCallback(async (id, payload) => {
    await deliveryAPI.assign(id, payload);
    showToast(payload.delivery_preference === 'lalamove' ? 'Lalamove booked.' : 'Rider assigned.');
    await fetchAll();
  }, [fetchAll, showToast]);

  const handleUpdateStatus = useCallback(async (id, status) => {
    await deliveryAPI.updateStatus(id, status);
    const labels = { out_for_delivery: 'Marked out for delivery.', delivered: 'Marked as delivered.', cancelled: 'Delivery cancelled.' };
    showToast(labels[status] || 'Status updated.', status === 'cancelled' ? 'error' : 'success');
    await fetchAll();
  }, [fetchAll, showToast]);

  // Tab counts
  const counts = TABS.reduce((acc, t) => {
    acc[t.key] = t.key === 'all'
      ? deliveries.length
      : deliveries.filter((d) => d.status === t.key).length;
    return acc;
  }, {});

  const visible = activeTab === 'all'
    ? deliveries
    : deliveries.filter((d) => d.status === activeTab);

  const pending = deliveries.filter((d) => d.status === 'pending_assignment').length;

  if (error && !loading) return (
    <div className="dl-error">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <p>{error}</p>
      <button className="dl-btn dl-btn--primary" onClick={fetchAll}>Try again</button>
    </div>
  );

  return (
    <div className="dl-root">
      {toastMsg && (
        <div className={`dl-toast dl-toast--${toastType}`} role="status" aria-live="polite">{toastMsg}</div>
      )}

      {/* Header */}
      <div className="dl-page-header">
        <div>
          <h1 className="dl-page-title">Delivery Assignment</h1>
          <p className="dl-page-sub">Assign riders and track delivery status in real time</p>
        </div>
        <button className="dl-btn dl-btn--ghost dl-btn--icon" onClick={fetchAll} aria-label="Refresh">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Pending alert */}
      {!loading && pending > 0 && (
        <div className="dl-alert" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span><strong>{pending} order{pending > 1 ? 's' : ''}</strong> waiting for delivery assignment.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="dl-tabs" role="tablist" aria-label="Delivery status filter">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className={`dl-tab${activeTab === key ? ' dl-tab--active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
            {counts[key] > 0 && (
              <span className={`dl-tab__count${key === 'pending_assignment' && counts[key] > 0 ? ' dl-tab__count--urgent' : ''}`}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="dl-cards" aria-label="Delivery items">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="dl-skeleton-card" aria-hidden="true" />
            ))
          : visible.length === 0
            ? <div className="dl-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
                  <rect width="13" height="8" x="9" y="11" rx="1"/>
                  <circle cx="11" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
                </svg>
                <p>{activeTab === 'pending_assignment' ? 'Delivery queue is empty.' : 'No deliveries in this status.'}</p>
              </div>
            : visible.map((d) => (
                <DeliveryCard
                  key={d.id}
                  delivery={d}
                  onAssign={setAssignModal}
                  onUpdateStatus={(delivery, next) => setStatusModal({ delivery, nextStatus: next })}
                />
              ))
        }
      </div>

      {/* Desktop table */}
      <div className="dl-table-wrap">
        <table className="dl-table" aria-label="Delivery queue">
          <thead>
            <tr>
              <th className="dl-table__th">Order</th>
              <th className="dl-table__th">Customer</th>
              <th className="dl-table__th">Items</th>
              <th className="dl-table__th">Preference</th>
              <th className="dl-table__th">Rider / Booking</th>
              <th className="dl-table__th">Status</th>
              <th className="dl-table__th dl-table__th--right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="dl-table__td">
                        <div className="dl-skeleton-row" style={{ width: `${50 + Math.random() * 35}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : visible.length === 0
                ? <tr><td colSpan={7}>
                    <div className="dl-empty">
                      <p>{activeTab === 'pending_assignment' ? 'Delivery queue is empty.' : 'No deliveries in this status.'}</p>
                    </div>
                  </td></tr>
                : visible.map((d) => (
                    <DeliveryRow
                      key={d.id}
                      delivery={d}
                      onAssign={setAssignModal}
                      onUpdateStatus={(delivery, next) => setStatusModal({ delivery, nextStatus: next })}
                    />
                  ))
            }
          </tbody>
        </table>

        {!loading && visible.length > 0 && (
          <div className="dl-table__footer">
            Showing <strong>{visible.length}</strong> of <strong>{deliveries.length}</strong> deliveries
          </div>
        )}
      </div>

      {/* Assign modal */}
      {assignModal && (
        <AssignModal
          delivery={assignModal}
          onClose={() => setAssignModal(null)}
          onAssign={handleAssign}
        />
      )}

      {/* Status update confirm */}
      {statusModal && (
        <StatusModal
          delivery={statusModal.delivery}
          nextStatus={statusModal.nextStatus}
          onClose={() => setStatusModal(null)}
          onConfirm={handleUpdateStatus}
        />
      )}
    </div>
  );
}