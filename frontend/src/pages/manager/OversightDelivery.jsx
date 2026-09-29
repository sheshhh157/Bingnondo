import { deliveryAPI } from '../../services/managerApi';
import useLiveData from '../../hooks/useLiveData';
import { STATUS_LABEL, deliveryBadgeVariant } from '../../utils/format';
import { listEvent, deliveryUpsert, deliveryStatus } from './managerData';
import { RiderIcon, ClockIcon } from './managerIcons';
import LiveControls from './LiveControls';
import PageSkeleton from '../../components/PageSkeleton';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import StatCard from '../../components/StatCard';
import PageHeader from '../../components/PageHeader';
import ErrorBanner from '../../components/ErrorBanner';
import '../../styles/OversightDelivery.css';

const STEPS = ['preparing', 'ready', 'out_for_delivery', 'delivered'];

export default function OversightDelivery() {
  const { data: deliveries, loading, error, refresh, lastUpdated, refreshing } = useLiveData({
    fetchFn: async () => (await deliveryAPI.getAll()).data,
    events: [
      listEvent('delivery:new', deliveryUpsert),
      listEvent('delivery:update', deliveryStatus),
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

      {error && (
        <ErrorBanner>
          Couldn't load this view.
          <button type="button" className="ui-error__retry" onClick={() => refresh()}>Retry</button>
        </ErrorBanner>
      )}

      <LiveControls lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={() => refresh(true)} label="Refresh deliveries" />

      {loading ? (
        <PageSkeleton stats={3} wide rows={3} />
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

