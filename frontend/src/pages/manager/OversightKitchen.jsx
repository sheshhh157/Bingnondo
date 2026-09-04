import { kitchenAPI } from '../../services/api';
import useLiveData from '../../hooks/useLiveData';
import { kitchenBadgeVariant } from '../../utils/format';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import PageHeader from '../../components/PageHeader';
import { useSocketContext } from '../../context/SocketContext';
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
  const { connected } = useSocketContext();

  const { data: orders, loading } = useLiveData({
    fetchFn: async () => {
      const { data } = await kitchenAPI.getOrders();
      return data;
    },
    events: [
      {
        name: 'order:new',
        merge: (prev, p) => {
          if (!p) return prev;
          if (prev.some((o) => o.id === p.id)) return prev;
          return [p, ...prev];
        },
      },
      {
        name: 'order:status',
        merge: (prev, p) => {
          if (!p) return prev;
          const idx = prev.findIndex((o) => o.id === p.orderId);
          if (idx < 0) return prev;
          const next = prev.slice();
          // preparing stays in queue; if it becomes something beyond preparing/confirmed remove it
          if (p.status === 'preparing') {
            next[idx] = { ...next[idx], status: 'preparing' };
          }
          return next;
        },
      },
      {
        name: 'order:ready',
        merge: (prev, p) => {
          if (!p) return prev;
          return prev.filter((o) => o.id !== p.orderId);
        },
      },
    ],
  });

  const counter = orders.filter((o) => o.order_channel !== 'mobile_app');
  const online = orders.filter((o) => o.order_channel === 'mobile_app');

  return (
    <div className="ok-root">
      <PageHeader
        title="Kitchen — Live"
        sub="Live mirror of the Kitchen Dashboard (viewing only)"
        actions={[
          {
            label: connected ? 'Live' : 'Offline',
            disabled: true,
            className: `ok-conn${connected ? '' : ' ok-conn--off'}`,
          },
        ]}
      />

      {loading ? (
        <Loader text="Loading kitchen queue…" />
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
        <EmptyState message={`No ${label.toLowerCase()}`} />
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
          <Badge variant={kitchenBadgeVariant(order.status)}>
            {order.status === 'preparing' ? 'Preparing' : 'Incoming'}
          </Badge>
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
