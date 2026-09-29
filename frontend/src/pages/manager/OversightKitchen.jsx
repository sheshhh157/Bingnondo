import { kitchenAPI } from '../../services/managerApi';
import useLiveData from '../../hooks/useLiveData';
import { kitchenBadgeVariant, kitchenStatusText } from '../../utils/format';
import { listEvent, queueUpsert, queueStatusInView, queueReady, splitByChannel, urgencyFor, elapsedSince, useNow } from './managerData';
import LiveControls from './LiveControls';
import PageSkeleton from '../../components/PageSkeleton';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import PageHeader from '../../components/PageHeader';
import ErrorBanner from '../../components/ErrorBanner';
import { useSocketContext } from '../../context/SocketContext';
import '../../styles/OversightKitchen.css';

export default function OversightKitchen() {
  const { connected } = useSocketContext();
  // Without this the urgency colours and "Overdue" flag would only ever change
  // when a socket event happened to arrive.
  const now = useNow();

  // `includeReady` pulls the handoff queue in alongside the prep queue; the two
  // are split by status below. These reducers keep ready orders in the list
  // (unlike the nav badge's, which counts only work in the kitchen), so a live
  // `order:ready` moves a card across into the handoff section instead of
  // making it vanish.
  const { data: orders, loading, error, refresh, lastUpdated, refreshing } = useLiveData({
    fetchFn: async () => (await kitchenAPI.getOrders({ includeReady: true })).data,
    events: [
      listEvent('order:new', queueUpsert),
      listEvent('order:status', queueStatusInView),
      listEvent('order:ready', queueReady),
    ],
  });

  // Unacknowledged kitchen (ESP32) alerts. Queried, not socket-pushed: the
  // backend only buzzes the kitchen + device rooms, and an alert needs its
  // hardware source — polling the existing endpoint is the manager's view.
  const { data: alerts } = useLiveData({
    fetchFn: async () => (await kitchenAPI.getAlerts()).data,
    pollMs: 15000,
  });

  // The lane grid is the prep queue; ready orders are waiting to be handed
  // over rather than being made, so they get their own section below instead of
  // competing for space in the two-column layout.
  const prep = orders.filter((o) => o.status !== 'ready');
  const handoff = orders.filter((o) => o.status === 'ready');
  const { counter, online, unknown } = splitByChannel(prep);

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

      {error && (
        <ErrorBanner>
          Couldn't load this view.
          <button type="button" className="ui-error__retry" onClick={() => refresh()}>Retry</button>
        </ErrorBanner>
      )}

      <LiveControls lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={() => refresh(true)} label="Refresh kitchen queue" />

      {alerts.length > 0 && (
        <section className="kit-alerts" aria-label={`${alerts.length} active kitchen alert${alerts.length === 1 ? '' : 's'}`} role="status">
          <div className="kit-alerts__header">
            <span className="kit-alerts__count">{alerts.length}</span>
            <span className="kit-alerts__title">Active kitchen alerts</span>
            <span className="kit-alerts__hint">awaiting kitchen acknowledgment</span>
          </div>
          <div className="kit-alerts__list">
            {alerts.map((a) => (
              <div key={a.id} className="kit-alert" role="alert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <div className="kit-alert__body">
                  <span className="kit-alert__order">#{a.order?.order_number}</span>
                  <span className="kit-alert__loc">{a.esp32_device?.location_label || 'Unassigned device'}</span>
                </div>
                <time className="kit-alert__time" dateTime={a.triggered_at} title={new Date(a.triggered_at).toLocaleString('en-PH')}>
                  {elapsedSince(a.triggered_at, now)}
                </time>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading ? (
        <PageSkeleton stats={2} cards={4} />
      ) : (
        <>
          <div className="ok-split">
            <Column lane="counter" label="Counter Orders" orders={counter} now={now} />
            <div className="ok-divider" aria-hidden="true" />
            <Column lane="online" label="Online Orders" orders={online} now={now} />
          </div>
          {/* Orders whose order_channel is neither a known counter nor online
              channel. Kept out of the two-column grid and shown below it, so a
              new or missing channel is visible instead of being silently
              counted as counter. */}
          {unknown.length > 0 && (
            <div className="ok-unknown">
              <Column lane="unknown" label="Unassigned Channel" orders={unknown} now={now} />
            </div>
          )}

          {/* Finished in the kitchen, waiting to be handed over. Rendered
              without the queue's urgency colouring: these cards are meant to be
              picked up, and a long wait here means a handoff was missed, not
              that the kitchen fell behind. */}
          <section className="ok-handoff" aria-label={`${handoff.length} order${handoff.length === 1 ? '' : 's'} ready for handoff`}>
            <div className="ok-handoff__header">
              <span className="ok-handoff__count">{handoff.length}</span>
              <h2 className="ok-handoff__title">Ready for handoff</h2>
              <span className="ok-handoff__hint">finished in the kitchen, waiting to be handed over</span>
            </div>
            {handoff.length === 0 ? (
              <EmptyState message="Nothing waiting to be handed over." />
            ) : (
              <div className="ok-handoff__list">
                {handoff.map((o) => (
                  <Card key={o.id} order={o} lane="handoff" now={now} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Column({ lane, label, orders, now }) {
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
            <Card key={o.id} order={o} lane={lane} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

/** How far along the kitchen each status is, for the card's progress bar. */
const BAR_PROGRESS = { pending: 33, confirmed: 33, preparing: 66, ready: 100 };

function Card({ order, lane, now }) {
  // Handoff cards skip the queue's age thresholds on purpose — see the section
  // that renders them. They still show the age, just not as a red "Overdue".
  const isHandoff = lane === 'handoff';
  const u = isHandoff ? 'normal' : urgencyFor(order.created_at, now);
  return (
    <article className={`ok-card ok-card--${u} ok-card--${lane}`} aria-label={`Order ${order.order_number}`}>
      <div className="ok-card__header">
        <div className="ok-card__header-left">
          <span className={`ok-card__dot ok-card__dot--${u}`} aria-hidden="true" />
          <span className="ok-card__number">#{order.order_number}</span>
          <Badge variant={kitchenBadgeVariant(order.status)}>
            {kitchenStatusText(order.status)}
          </Badge>
        </div>
        <time className={`ok-card__time ok-card__time--${u}`} dateTime={order.created_at}>{elapsedSince(order.created_at, now)}</time>
      </div>
      <div
        className={`ok-card__bar ok-card__bar--${order.status}`}
        role="progressbar"
        aria-valuenow={BAR_PROGRESS[order.status] ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={order.status}
      >
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
      {isHandoff ? (
        <div className="ok-card__handoff-note">Awaiting handoff</div>
      ) : (
        u === 'critical' && <div className="ok-card__overdue" role="alert">Overdue</div>
      )}
    </article>
  );
}
