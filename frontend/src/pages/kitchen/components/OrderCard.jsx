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

function UrgencyDot({ level }) {
  return (
    <span
      className={`kp-card__dot kp-card__dot--${level}`}
      aria-label={level === 'critical' ? 'Overdue' : level === 'urgent' ? 'Getting late' : 'On time'}
    />
  );
}

export default function OrderCard({ order, lane, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const u = urgency(order.created_at);
  const isPreparing = order.status === 'preparing';

  async function handleAction() {
    setLoading(true);
    try {
      const next = isPreparing ? 'ready' : 'preparing';
      await kitchenAPI.updateOrderStatus(order.id, next);
      onStatusChange(order.id, next);
    } catch (err) {
      console.error('Status update failed:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article
      className={`kp-card kp-card--${u} kp-card--${lane}`}
      aria-label={`Order ${order.order_number}, ${u === 'critical' ? 'overdue' : u}`}
    >
      {/* Header row */}
      <div className="kp-card__header">
        <div className="kp-card__header-left">
          <UrgencyDot level={u} />
          <span className="kp-card__number">#{order.order_number}</span>
          <span className={`kp-card__status kp-card__status--${order.status}`}>
            {order.status === 'preparing' ? 'Preparing' : 'Incoming'}
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
        aria-valuenow={order.status === 'preparing' ? 66 : 33}
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

      {/* Footer */}
      <div className="kp-card__footer">
        {u === 'critical' && (
          <span className="kp-card__overdue" role="alert">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path d="M5.5 1L10 9.5H1L5.5 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M5.5 4.5v2M5.5 8h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Overdue
          </span>
        )}
        <button
          className={`kp-btn kp-btn--${isPreparing ? 'ready' : 'start'}`}
          onClick={handleAction}
          disabled={loading}
          aria-label={isPreparing ? `Mark order ${order.order_number} as ready` : `Start preparing order ${order.order_number}`}
        >
          {loading ? (
            <span className="kp-spin-sm" aria-hidden="true" />
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