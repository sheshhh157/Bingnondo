import { useState } from 'react';
import { kitchenAPI } from '../../../services/api';

function elapsed(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)   return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function urgency(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins >= 15) return 'critical';
  if (mins >= 8)  return 'urgent';
  return 'normal';
}

export default function OrderCard({ order, lane, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const u = urgency(order.created_at);

  const isPending   = order.status === 'pending';
  const isPreparing = order.status === 'preparing';

  // Label shown inside the status badge
  const statusLabel =
    order.status === 'pending'   ? 'New' :
    order.status === 'preparing' ? 'Preparing' :
    'Incoming';

  // Progress bar value per status
  const progressValue =
    order.status === 'pending'   ? 15 :
    order.status === 'preparing' ? 66 :
    33;

  async function handleAction() {
    setLoading(true);
    setError(null);
    try {
      // The server owns the status machine, so apply whatever it actually
      // stored rather than the status we hoped for. Hardcoding 'confirmed' is
      // what left stale cards on screen until a manual refresh.
      const res = isPending
        ? await kitchenAPI.acknowledgeOrder(order.id)
        : await kitchenAPI.updateOrderStatus(
            order.id,
            isPreparing ? 'ready' : 'preparing'
          );

      const data = res?.data ?? res;
      onStatusChange(order.id, data?.status ?? (isPending ? 'confirmed' : isPreparing ? 'ready' : 'preparing'));
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not update this order.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <article
      className={`kp-card kp-card--${u} kp-card--${lane}${isPending ? ' kp-card--pending' : ''}`}
      aria-label={`Order ${order.order_number}, ${u === 'critical' ? 'overdue' : u}`}
    >
      {/* Header row */}
      <div className="kp-card__header">
        <div className="kp-card__header-left">
          <span className="kp-card__number">#{order.order_number}</span>
          <span className={`kp-card__status kp-card__status--${order.status}`}>
            {statusLabel}
          </span>
        </div>
        <time
          className={`kp-card__time kp-card__time--${u}`}
          dateTime={order.created_at}
          aria-label={`Waiting ${elapsed(order.created_at)}`}
        >
          {elapsed(order.created_at)}
        </time>
      </div>

      {/* Progress bar */}
      <div
        className={`kp-card__bar kp-card__bar--${order.status}`}
        role="progressbar"
        aria-valuenow={progressValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Order status: ${order.status}`}
      >
        <div className="kp-card__bar-fill" />
      </div>

      {/* Items */}
      <ul className="kp-card__items" aria-label="Order items">
        {order.order_items?.map((item) => (
          <li key={item.id} className="kp-card__item">
            <span className="kp-card__qty">{item.quantity}×</span>
            <div className="kp-card__item-body">
              <span className="kp-card__item-name">{item.menu_item?.name || item.name}</span>
              {item.notes && (
                <span className="kp-card__note" aria-label={`Note: ${item.notes}`}>
                  {item.notes}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Special request */}
      {order.special_request && (
        <p className="kp-card__special-request" aria-label={`Special request: ${order.special_request}`}>
          {order.special_request}
        </p>
      )}

      {/* Footer */}
      <div className="kp-card__footer">

        {error && (
          <p className="kp-card__error" role="alert">{error}</p>
        )}

        <button
          className={`kp-btn kp-btn--${isPending ? 'acknowledge' : isPreparing ? 'ready' : 'start'}`}
          onClick={handleAction}
          disabled={loading}
          aria-label={
            isPending   ? `Acknowledge order ${order.order_number}` :
            isPreparing ? `Mark order ${order.order_number} as ready` :
                          `Start preparing order ${order.order_number}`
          }
        >
          {loading ? (
            <span className="kp-spin-sm" aria-hidden="true" />
          ) : isPending ? (
            <>
              Acknowledge
            </>
          ) : isPreparing ? (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <path d="M2 6.5l3 3L11 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Mark Ready
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <polygon points="3,2 11,6.5 3,11" fill="currentColor"/>
              </svg>
              Start Preparing
            </>
          )}
        </button>
      </div>
    </article>
  );
}