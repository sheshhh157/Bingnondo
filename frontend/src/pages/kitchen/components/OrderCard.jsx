import { useState } from 'react';
import { kitchenAPI } from '../../../services/api';

function elapsed(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function urgency(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins >= 15) return 'critical';
  if (mins >= 8)  return 'urgent';
  return 'normal';
}

function ChannelBadge({ channel }) {
  const isOnline = channel === 'mobile_app';
  return (
    <span className={`kp-badge kp-badge--${isOnline ? 'online' : 'counter'}`}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true">
        {isOnline
          ? <><circle cx="4.5" cy="4.5" r="3.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="4.5" cy="4.5" r="1.5" fill="currentColor"/></>
          : <><rect x="1" y="3" width="7" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M2.5 3V2.5a2 2 0 014 0V3" stroke="currentColor" strokeWidth="1.2"/></>
        }
      </svg>
      {isOnline ? 'Online' : 'Counter'}
    </span>
  );
}

export default function OrderCard({ order, onStatusChange }) {
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
      className={`kp-card kp-card--${u}`}
      aria-label={`Order ${order.order_number}`}
    >
      <div className={`kp-card__stripe kp-card__stripe--${u}`} aria-hidden="true" />

      <div className="kp-card__header">
        <div className="kp-card__meta">
          <span className="kp-card__number">#{order.order_number}</span>
          <ChannelBadge channel={order.order_channel} />
        </div>
        <time
          className={`kp-card__time kp-card__time--${u}`}
          dateTime={order.created_at}
        >
          {elapsed(order.created_at)}
        </time>
      </div>

      <div className={`kp-card__progress kp-card__progress--${order.status}`}>
        <div className="kp-card__progress-fill" />
      </div>

      <ul className="kp-card__items" aria-label="Order items">
        {order.order_items?.map((item) => (
          <li key={item.id} className="kp-card__item">
            <span className="kp-card__item-qty">{item.quantity}×</span>
            <span className="kp-card__item-name">{item.menu_item?.name || item.name}</span>
            {item.notes && (
              <span className="kp-card__item-note">{item.notes}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="kp-card__footer">
        {u === 'critical' && (
          <span className="kp-card__overdue" role="alert" aria-live="polite">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path d="M5.5 1L10 9.5H1L5.5 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M5.5 5v2M5.5 8.5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Overdue
          </span>
        )}
        <button
          className={`kp-btn kp-btn--${isPreparing ? 'ready' : 'start'}`}
          onClick={handleAction}
          disabled={loading}
          aria-label={isPreparing ? `Mark order ${order.order_number} ready` : `Start preparing order ${order.order_number}`}
        >
          {loading ? (
            <span className="kp-spinner-sm" aria-label="Processing" />
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