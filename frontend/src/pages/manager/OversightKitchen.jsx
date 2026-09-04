import { useState, useEffect, useCallback } from 'react';
import { kitchenAPI } from '../../services/api';
import '../../styles/OversightKitchen.css';

function elapsed(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}
function urgency(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins >= 15) return 'critical';
  if (mins >= 8) return 'urgent';
  return 'normal';
}

export default function OversightKitchen() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await kitchenAPI.getOrders();
      setOrders(data);
      setConnected(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counter = orders.filter((o) => o.order_channel !== 'mobile_app');
  const online = orders.filter((o) => o.order_channel === 'mobile_app');

  return (
    <div className="ok-root">
      <div className="ok-header">
        <div>
          <h1 className="ok-title">Kitchen — Read-Only</h1>
          <p className="ok-sub">Live mirror of the Kitchen Dashboard (viewing only)</p>
        </div>
        <div className={`ok-conn${connected ? '' : ' ok-conn--off'}`} role="status">
          <span className="ok-conn__dot" aria-hidden="true" />
          {connected ? 'Live' : 'Offline'}
        </div>
      </div>

      {loading ? (
        <div className="ok-loading" role="status" aria-live="polite">
          <div className="ok-loader"><div /><div /><div /></div>
          <span>Loading kitchen queue…</span>
        </div>
      ) : (
        <div className="ok-split">
          <Column lane="counter" label="Counter Orders" orders={counter} />
          <div className="ok-divider" aria-hidden="true" />
          <Column lane="online" label="Online Orders" orders={online} />
        </div>
      )}
    </div>
  );
}

function Column({ lane, label, orders }) {
  return (
    <section className={`ok-col ok-col--${lane}`} aria-label={`${label}: ${orders.length}`}>
      <div className="ok-col__header">
        <span className={`ok-col__count ok-col__count--${lane}`}>{orders.length}</span>
        <h2 className="ok-col__title">{label}</h2>
      </div>
      {orders.length === 0 ? (
        <div className="ok-col__empty">No {label.toLowerCase()}</div>
      ) : (
        <div className="ok-col__list">
          {orders.map((o) => (
            <Card key={o.id} order={o} lane={lane} />
          ))}
        </div>
      )}
    </section>
  );
}

function Card({ order, lane }) {
  const u = urgency(order.created_at);
  return (
    <article className={`ok-card ok-card--${u} ok-card--${lane}`} aria-label={`Order ${order.order_number}`}>
      <div className="ok-card__header">
        <div className="ok-card__header-left">
          <span className={`ok-card__dot ok-card__dot--${u}`} aria-hidden="true" />
          <span className="ok-card__number">#{order.order_number}</span>
          <span className={`ok-card__status ok-card__status--${order.status}`}>
            {order.status === 'preparing' ? 'Preparing' : 'Incoming'}
          </span>
        </div>
        <time className={`ok-card__time ok-card__time--${u}`} dateTime={order.created_at}>{elapsed(order.created_at)}</time>
      </div>
      <div className={`ok-card__bar ok-card__bar--${order.status}`} role="progressbar" aria-valuenow={order.status === 'preparing' ? 66 : 33} aria-valuemin={0} aria-valuemax={100} aria-label={order.status}>
        <div className="ok-card__bar-fill" />
      </div>
      <ul className="ok-card__items">
        {order.order_items?.map((item) => (
          <li key={item.id} className="ok-card__item">
            <span className="ok-card__qty">{item.quantity}×</span>
            <div className="ok-card__item-body">
              <span className="ok-card__item-name">{item.menu_item?.name || item.name}</span>
              {item.notes && <span className="ok-card__note">{item.notes}</span>}
            </div>
          </li>
        ))}
      </ul>
      {u === 'critical' && <div className="ok-card__overdue" role="alert">Overdue</div>}
    </article>
  );
}
