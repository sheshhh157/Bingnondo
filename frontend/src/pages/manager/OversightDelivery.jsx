import { deliveryAPI } from '../../services/managerApi';
import useLiveData from '../../hooks/useLiveData';
import { STATUS_LABEL, deliveryBadgeVariant } from '../../utils/format';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import StatCard from '../../components/StatCard';
import PageHeader from '../../components/PageHeader';
import '../../styles/OversightDelivery.css';

const STEPS = ['preparing', 'ready', 'out_for_delivery', 'delivered'];

export default function OversightDelivery() {
  const { data: deliveries, loading } = useLiveData({
    fetchFn: async () => {
      const { data } = await deliveryAPI.getAll();
      return data;
    },
    events: [
      {
        name: 'delivery:update',
        merge: (prev, p) => {
          if (!p) return prev;
          const idx = prev.findIndex((d) => d.id === p.deliveryId);
          if (idx < 0) return prev;
          const next = prev.slice();
          next[idx] = { ...next[idx], status: p.status, eta: p.status === 'delivered' ? 'Delivered' : next[idx].eta };
          return next;
        },
      },
      {
        name: 'delivery:new',
        merge: (prev, p) => {
          if (!p) return prev;
          if (prev.some((d) => d.id === p.id)) return prev;
          return [p, ...prev];
        },
      },
    ],
  });

  const active = deliveries.filter((d) => d.status !== 'delivered');
  const completed = deliveries.filter((d) => d.status === 'delivered');

  return (
    <div className="odl-root">
      <PageHeader
        title="Delivery — Live"
        sub="Track rider deliveries from preparation to drop-off (viewing only)"
      />

      <div className="odl-stats">
        <StatCard label="Awaiting / In transit" value={active.length} />
        <StatCard label="Delivered" value={completed.length} />
      </div>

      {loading ? (
        <Loader text="Loading deliveries…" />
      ) : deliveries.length === 0 ? (
        <EmptyState message="No deliveries yet." />
      ) : (
        <div className="odl-list">
          {deliveries.map((d) => (
            <article key={d.id} className="odl-card">
              <div className="odl-card__top">
                <div>
                  <span className="odl-card__order">#{d.order_number}</span>
                  <span className="odl-card__customer">{d.customer}</span>
                </div>
                <Badge variant={deliveryBadgeVariant(d.status)} dot>
                  {STATUS_LABEL[d.status] || d.status}
                </Badge>
              </div>
              <div className="odl-card__meta">
                <span className="odl-meta"><RiderIcon /> {d.rider}</span>
                <span className="odl-meta"><ClockIcon /> {d.eta}</span>
              </div>
              <div className="odl-progress">
                {STEPS.map((step, i) => {
                  const idx = STEPS.indexOf(d.status);
                  const done = i <= idx;
                  return (
                    <div key={step} className="odl-step">
                      <span className={`odl-step__dot${done ? ' odl-step__dot--done' : ''}`} aria-hidden="true" />
                      {i < STEPS.length - 1 && <span className={`odl-step__line${i < idx ? ' odl-step__line--done' : ''}`} aria-hidden="true" />}
                      <span className={`odl-step__label${done ? ' odl-step__label--done' : ''}`}>{STATUS_LABEL[step]}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function RiderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="7" r="3"/><path d="M2 21v-1a5 5 0 0 1 5-5 4 4 0 0 1 1.5.29M17 11l4 4v4h-4M17 11l-3 3M20 15l-4-4v3M17 18h.01"/>
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
  );
}
