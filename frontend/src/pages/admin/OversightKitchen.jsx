import { useState } from 'react';
import { kitchenAPI } from '../../services/oversightApi';
import useLiveData from '../../hooks/useLiveData';
import { kitchenBadgeVariant, kitchenStatusText } from '../../utils/format';
import { listEvent, queueUpsert, queueStatusInView, queueReady, splitByChannel, urgencyFor, elapsedSince, useNow } from './oversightData';
import LiveControls from './LiveControls';
import PageSkeleton from '../../components/PageSkeleton';
import Pagination from '../../components/Pagination';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import PageHeader from '../../components/PageHeader';
import ErrorBanner from '../../components/ErrorBanner';
import { useSocketContext } from '../../context/SocketContext';
import '../../styles/OversightKitchen.css';

// Counter and online are separate lanes; each lane is a 2-column grid of three
// rows, so six cards per lane page.
const LANE_PAGE_SIZE = 6;
// Ready-for-handoff grid — its own six-per-page window (2 columns × 3 rows).
const PAGE_SIZE = 6;

export default function OversightKitchen() {
  const { connected } = useSocketContext();
  // Without this the urgency colours and "Overdue" flag would only ever change
  // when a socket event happened to arrive.
  const now = useNow();

  const [counterPage, setCounterPage] = useState(1);
  const [onlinePage, setOnlinePage] = useState(1);
  const [unknownPage, setUnknownPage] = useState(1);
  const [handoffPage, setHandoffPage] = useState(1);

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

  // The queue is two independent lanes — counter and online — kept separate so
  // the kitchen can read one channel at a time. Ready orders are waiting to be
  // handed over rather than being made, so they get their own section below
  // instead of competing for space in the lane columns.
  const prep = orders.filter((o) => o.status !== 'ready');
  const handoff = orders.filter((o) => o.status === 'ready');
  const { counter, online, unknown } = splitByChannel(prep);

  // Ready-for-handoff keeps a six-per-page window (2 columns × 3 rows). The safe
  // page is clamped so a live socket update that shrinks the list can't strand
  // the view on a page that no longer exists.
  const handoffTotalPages = Math.max(1, Math.ceil(handoff.length / PAGE_SIZE));
  const handoffSafePage = Math.min(handoffPage, handoffTotalPages);
  const handoffPageOrders = handoff.slice((handoffSafePage - 1) * PAGE_SIZE, handoffSafePage * PAGE_SIZE);

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

      {loading ? (
        <PageSkeleton stats={2} cards={4} />
      ) : (
        <>
          {/* Kitchen queue — counter and online kept apart, each a 2-column
              grid of at most three rows, paginated per lane. */}
          <div className="ok-split">
            <LaneColumn lane="counter" label="Counter Orders" orders={counter} now={now} page={counterPage} onPage={setCounterPage} />
            <div className="ok-divider" aria-hidden="true" />
            <LaneColumn lane="online" label="Online Orders" orders={online} now={now} page={onlinePage} onPage={setOnlinePage} />
          </div>

          {/* Orders whose order_channel is neither a known counter nor online
              channel. Kept out of the two lane columns and shown below them, so
              a new or missing channel is visible instead of being silently
              counted as counter. */}
          {unknown.length > 0 && (
            <div className="ok-unknown">
              <LaneColumn lane="unknown" label="Unassigned Channel" orders={unknown} now={now} page={unknownPage} onPage={setUnknownPage} />
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
              <div className="ok-grid">
                {handoffPageOrders.map((o) => (
                  <Card key={o.id} order={o} lane="handoff" now={now} />
                ))}
              </div>
            )}
            <Pagination
              page={handoffSafePage}
              totalPages={handoffTotalPages}
              total={handoff.length}
              from={handoff.length === 0 ? 0 : (handoffSafePage - 1) * PAGE_SIZE + 1}
              to={Math.min(handoffSafePage * PAGE_SIZE, handoff.length)}
              onPage={setHandoffPage}
              label="Ready for handoff pagination"
            />
          </section>
        </>
      )}
    </div>
  );
}

/** One channel lane: a 2-column grid of at most three rows, paginated in place. */
function LaneColumn({ lane, label, orders, now, page, onPage }) {
  const totalPages = Math.max(1, Math.ceil(orders.length / LANE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = orders.slice((safePage - 1) * LANE_PAGE_SIZE, safePage * LANE_PAGE_SIZE);

  return (
    <section className={`ok-col ok-col--${lane}`} aria-label={`${label}: ${orders.length}`}>
      <div className="ok-col__header">
        <span className="ok-col__count">{orders.length}</span>
        <h2 className="ok-col__title">{label}</h2>
      </div>
      {orders.length === 0 ? (
        <EmptyState message={`No ${label.toLowerCase()}`} />
      ) : (
        <div className="ok-col__list">
          {visible.map((o) => (
            <Card key={o.id} order={o} lane={lane} now={now} />
          ))}
        </div>
      )}
      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={orders.length}
        from={orders.length === 0 ? 0 : (safePage - 1) * LANE_PAGE_SIZE + 1}
        to={Math.min(safePage * LANE_PAGE_SIZE, orders.length)}
        onPage={onPage}
        label={`${label} pagination`}
      />
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
