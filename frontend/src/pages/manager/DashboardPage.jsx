import { useMemo, useState, useReducer, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI, kitchenAPI, inventoryAPI, MANAGER_ORDER_LIMITS } from '../../services/managerApi';
import useLiveData from '../../hooks/useLiveData';
import { useSocketEventContext } from '../../context/SocketContext';
import { currency, stockStatus, stockBadgeVariant, stockStatusText, STATUS_LABEL, dayKey, lastDaysBounds } from '../../utils/format';
import { keyEvent, orderUpsert, orderStatus, queueUpsert, stockPatch, stockCounts, splitByChannel } from './managerData';
import LiveControls from './LiveControls';
import Badge from '../../components/Badge';
import CardPanel from '../../components/CardPanel';
import PageHeader from '../../components/PageHeader';
import ErrorBanner from '../../components/ErrorBanner';
import '../../styles/DashboardPage.css';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';

const PIE_COLORS = ['#1D4ED8', '#B45309', '#0EA5E9'];

/**
 * How much order history the Dashboard reads.
 *
 * Everything on this page except the all-time revenue KPI is derived from this
 * window. It has to be bounded — the previous build fetched the whole history
 * every 15 seconds. 90 days comfortably covers the 7-day trend and the
 * "best sellers" list, and keeps a single response small.
 */
const DASHBOARD_WINDOW_DAYS = 90;

const StatusText = (s) => STATUS_LABEL[s] || s;

// ─── Live activity feed (order:new / order:status / order:ready) ────────────
const FEED_CAP = 8;
const FEED_META = {
  'order:new': { tag: 'New', cls: 'info' },
  'order:ready': { tag: 'Ready', cls: 'success' },
  'order:status': { tag: 'Status', cls: 'muted' },
};

/**
 * Shimmer placeholder that mirrors the dashboard layout while data loads.
 */
function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard…">
      <div className="dash-kpis" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ui-stat">
            <div className="dash-skel dash-skel--label" />
            <div className="dash-skel dash-skel--value" />
            <div className="dash-skel dash-skel--sub" />
          </div>
        ))}
      </div>
      <div className="dash-grid" aria-hidden="true">
        <CardPanel wide>
          <div className="dash-skel dash-skel--chart" />
        </CardPanel>
        <CardPanel>
          <div className="dash-skel dash-skel--chart" />
        </CardPanel>
        <CardPanel>
          <div className="dash-skel dash-skel--chart" />
        </CardPanel>
      </div>
    </div>
  );
}

function feedReducer(state, action) {
  if (action.type !== 'feed') return state;
  const meta = FEED_META[action.name];
  if (!meta) return state;
  const p = action.payload || {};
  const orderNumber = p.orderNumber || p.order_number || (p.order != null ? `ORD-${String(p.order).padStart(4, '0')}` : '');
  const status = p.status ? StatusText(p.status) : '';
  const at = action.at;
  const key = `${action.name}:${orderNumber}:${status}`;
  if (state[0] && state[0].key === key && Math.abs(state[0].at - at) < 1000) return state;
  return [{ key, name: action.name, tag: meta.tag, cls: meta.cls, orderNumber, status, at }, ...state].slice(0, FEED_CAP);
}

function ActivityFeed() {
  const { lastEvent } = useSocketEventContext();
  const [feed, dispatch] = useReducer(feedReducer, []);

  useEffect(() => {
    if (!lastEvent || !FEED_META[lastEvent.name]) return;
    dispatch({
      type: 'feed',
      name: lastEvent.name,
      payload: lastEvent.payload,
      at: Date.now(),
    });
  }, [lastEvent]);

  if (feed.length === 0) return null;
  return (
    <CardPanel title={<span className="dash-feed__title">Live activity <span className="dash-feed__count">{feed.length}</span></span>}>
      <div className="dash-feed">
        {feed.map((e) => (
          <div key={e.key} className="dash-feed__row">
            <span className={`dash-feed__tag dash-feed__tag--${e.cls}`}>{e.tag}</span>
            <span className="dash-feed__text">
              {e.name === 'order:new' ? 'New order' : e.name === 'order:ready' ? 'Order ready' : 'Order updated'}
              {e.orderNumber && <strong className="dash-feed__num"> {e.orderNumber}</strong>}
              {e.status ? <span className="dash-feed__status"> → {e.status}</span> : null}
            </span>
            <time className="dash-feed__time">{new Date(e.at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
          </div>
        ))}
      </div>
    </CardPanel>
  );
}

export default function DashboardPage() {
  const { data: summary, loading, error, refresh, lastUpdated, refreshing } = useLiveData({
    fetchFn: async () => {
      // Bounded to a recent window. This used to request the entire order
      // history (up to 10 000 rows of json_agg'd line items) on every 15s poll
      // just to draw a 7-day chart. All-time revenue now comes from the
      // one-row /api/orders/totals aggregate instead.
      const [o, k, s, t] = await Promise.all([
        ordersAPI.getRange({ ...lastDaysBounds(DASHBOARD_WINDOW_DAYS), limit: MANAGER_ORDER_LIMITS.window }),
        kitchenAPI.getOrders(),
        inventoryAPI.getAll(),
        ordersAPI.getTotals(),
      ]);
      return {
        orders: o.data,
        total: o.total,
        kitchen: k.data,
        stock: s.data.items || s.data,
        totals: t.data,
      };
    },
    initial: { orders: [], total: 0, kitchen: [], stock: [], totals: { total_revenue: 0, collected_orders: 0 } },
    events: [
      keyEvent('order:new', { orders: orderUpsert, kitchen: queueUpsert }),
      keyEvent('order:status', { orders: orderStatus }),
      keyEvent('inventory:update', { stock: stockPatch }),
    ],
    pollMs: 15000,
  });

  const { orders: windowOrders, total: windowTotal, kitchen, stock, totals } = summary;

  // True when the window holds more orders than the read returned, so the
  // window-scoped figures below are a partial view of the period. The count
  // comes from the endpoint's unpaged `total` rather than from guessing at a
  // row limit.
  const truncated = windowTotal > windowOrders.length;

  // Chart scope for the Order Status panel: the whole loaded window, or today.
  // There is no "all time" option any more — the page no longer loads all time.
  const [scope, setScope] = useState('window');

  // Orders that count as revenue: paid, and not cancelled.
  //
  // This was `status === 'completed'`, which is not the same set. Nothing in the
  // application ever sets 'completed' — the status endpoint accepts it but no
  // screen offers it — so every figure derived from it (revenue, avg ticket,
  // best sellers, the 7-day trend) was permanently zero on a shop taking real
  // money. Paid is the state a sale actually reaches, and it is what
  // /api/orders/totals and /api/orders/report count server-side, so the
  // window figures here and the all-time KPI are now the same population.
  const revenueOrders = useMemo(
    () => windowOrders.filter((o) => o.payment_status === 'paid' && o.status !== 'cancelled'),
    [windowOrders],
  );

  // Two different revenue figures, deliberately not the same number:
  //  - allTimeRevenue is the headline KPI, computed by Postgres over every
  //    paid order ever.
  //  - windowRevenue is the sum over the loaded window, and is what the avg
  //    ticket, payment split and best-sellers are derived from. Mixing the two
  //    (all-time revenue divided by a windowed order count) would be nonsense.
  const windowRevenue = revenueOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const allTimeRevenue = Number(totals?.total_revenue || 0);
  const allTimeCollected = Number(totals?.collected_orders || 0);
  const avgTicket = revenueOrders.length ? windowRevenue / revenueOrders.length : 0;

  const { counter: counterOrders, online: onlineOrders, unknown: unknownOrders } = splitByChannel(kitchen);
  const { out, low, alerts } = stockCounts(stock);

  // Channel sub-labels. `unknown` only appears when an order carries an
  // order_channel that is neither a known counter nor online value, so it is
  // surfaced rather than folded into the counter count.
  const channelSub = unknownOrders.length > 0
    ? `${counterOrders.length} counter · ${onlineOrders.length} online · ${unknownOrders.length} unassigned`
    : `${counterOrders.length} counter · ${onlineOrders.length} online`;

  // Low-stock quick list (top 5)
  const lowStockItems = useMemo(() => {
    return stock
      .filter((i) => stockStatus(i.current_stock, i.reorder_level) !== 'ok')
      .sort((a, b) => a.current_stock - b.current_stock)
      .slice(0, 5);
  }, [stock]);

  // Top selling items (top 5 by quantity, from paid orders)
  const topItems = useMemo(() => {
    const tally = {};
    for (const o of revenueOrders) {
      for (const it of o.items || o.order_items || []) {
        const name = it.name || it.menu_item?.name;
        if (!name) continue;
        tally[name] = (tally[name] || 0) + (Number(it.quantity) || 1);
      }
    }
    return Object.entries(tally)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [revenueOrders]);

  // Daily revenue trend (last 7 days).
  // Buckets are keyed on `dayKey` (YYYY-MM-DD) and ordered by a pre-computed
  // start timestamp. The previous version keyed on the weekday *name* and then
  // compared `now - created_at` in whole 24h chunks, so a 7-day window
  // spanning a year boundary folded two different days into one "Sun" bucket
  // and an order placed just before midnight could land in the wrong day.
  const daily = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key: dayKey(d),
        name: d.toLocaleDateString('en-PH', { weekday: 'short' }),
        revenue: 0,
      });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const o of revenueOrders) {
      const bucket = byKey.get(dayKey(o.created_at));
      if (bucket) bucket.revenue += Number(o.total_amount || 0);
    }
    return days.map(({ name, revenue }) => ({ name, revenue }));
  }, [revenueOrders]);

  // Revenue by payment method
  const byMethod = useMemo(() => {
    const m = { cash: 0, gcash: 0 };
    revenueOrders.forEach((o) => {
      const k = o.payment_method === 'gcash' ? 'gcash' : 'cash';
      m[k] += Number(o.total_amount || 0);
    });
    return [
      { name: 'Cash', value: Math.round(m.cash) },
      { name: 'GCash', value: Math.round(m.gcash) },
    ].filter((x) => x.value > 0);
  }, [revenueOrders]);

  // Order status breakdown
  // todayKey was previously recomputed on every render and used as a memo
  // dependency. The value is a day string, so it only changes at midnight —
  // but "only at midnight" is still a change, and a fresh string every render
  // invalidated `statusData`/`completedToday` on every keystroke and poll.
  const [todayKey, setTodayKey] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTodayKey(dayKey(new Date())), 60000);
    return () => clearInterval(id);
  }, []);

  const statusData = useMemo(() => {
    const m = {};
    (scope === 'today'
      ? windowOrders.filter((o) => dayKey(o.created_at) === todayKey)
      : windowOrders)
      .forEach((o) => { m[o.status] = (m[o.status] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count }));
  }, [windowOrders, scope, todayKey]);

  // Today pulse — paid orders created today.
  const completedToday = useMemo(
    () => revenueOrders.filter((o) => dayKey(o.created_at) === todayKey),
    [revenueOrders, todayKey],
  );
  const todayRevenue = completedToday.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  // Orders sitting at 'ready' need pickup attention.
  const readyCount = useMemo(
    () => windowOrders.filter((o) => o.status === 'ready').length,
    [windowOrders],
  );

  // Only two KPIs are all-time. The other two are window aggregates, and say
  // so — a reader comparing "Total Revenue" against "Avg. Ticket" needs to know
  // they are drawn from different populations.
  const windowLabel = `last ${DASHBOARD_WINDOW_DAYS} days`;
  const kpis = [
    {
      label: 'Total Revenue',
      value: currency(allTimeRevenue),
      sub: `all time · ${allTimeCollected.toLocaleString('en-PH')} paid orders · ${currency(todayRevenue)} today`,
      accent: 'none',
      to: '/manager/sales',
    },
    {
      label: 'Avg. Ticket',
      value: currency(avgTicket),
      sub: `${revenueOrders.length} paid · ${windowLabel}`,
      accent: 'none',
      to: '/manager/sales',
    },
    { label: 'Kitchen Queue', value: String(kitchen.length), sub: channelSub, accent: 'queue', to: '/manager/oversight/kitchen' },
    { label: 'Stock Alerts', value: String(alerts), sub: `${out} out · ${low} low`, accent: alerts > 0 ? 'alert' : 'none', to: '/manager/oversight/stocks' },
  ];

  return (
    <div className="dash-root">
      <PageHeader
        title="Dashboard"
        sub="Analytics and operational pulse (auto-refreshes every 15s)"
      />

      {error && (
        <ErrorBanner>
          Couldn't load this view.
          <button type="button" className="ui-error__retry" onClick={() => refresh()}>Retry</button>
        </ErrorBanner>
      )}

      <LiveControls lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={() => refresh(true)} label="Refresh dashboard" />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* KPI cards */}
          <div className="dash-kpis">
            {kpis.map((k) => {
              const cls = `ui-stat dash-kpi${k.accent === 'alert' ? ' ui-stat--alert' : k.accent === 'queue' ? ' ui-stat--queue' : ''}`;
              return k.to ? (
                <Link key={k.label} to={k.to} className={cls}>
                  <span className="ui-stat__label">{k.label}</span>
                  <span className="ui-stat__value">{k.value}</span>
                  <span className="ui-stat__sub">{k.sub}</span>
                </Link>
              ) : (
                <div key={k.label} className={cls}>
                  <span className="ui-stat__label">{k.label}</span>
                  <span className="ui-stat__value">{k.value}</span>
                  <span className="ui-stat__sub">{k.sub}</span>
                </div>
              );
            })}
          </div>

          {readyCount > 0 && (
            <Link to="/manager/oversight/kitchen" className="dash-ready">
              <span className="dash-ready__count">{readyCount}</span>
              <span className="dash-ready__text">
                {readyCount === 1 ? 'Order is ready for pickup' : `${readyCount} orders are ready for pickup`} — hand it over →
              </span>
            </Link>
          )}

          {/* The status panel and the best-sellers/payment panels are derived
              from the loaded window, not the whole history. */}
          {truncated && (
            <p className="dash-truncated" role="status">
              Showing the most recent {MANAGER_ORDER_LIMITS.window.toLocaleString('en-PH')} orders
              ({windowLabel}). Older orders aren't included in the status chart, best sellers
              or payment split — Total Revenue is all time and is unaffected.
            </p>
          )}

          <div className="dash-scope" role="group" aria-label="Order status chart scope">
            <span className="dash-scope__label">Status chart</span>
            <button type="button" className={`dash-scope__btn${scope === 'window' ? ' dash-scope__btn--active' : ''}`} onClick={() => setScope('window')} aria-pressed={scope === 'window'}>
              {DASHBOARD_WINDOW_DAYS} days
            </button>
            <button type="button" className={`dash-scope__btn${scope === 'today' ? ' dash-scope__btn--active' : ''}`} onClick={() => setScope('today')} aria-pressed={scope === 'today'}>
              Today
            </button>
          </div>

          <div className="dash-grid">
            {/* Revenue trend */}
            <CardPanel title="Revenue — last 7 days" wide>
              <div className="dash-chart" role="img" aria-label="Revenue trend for the last 7 days">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border)' }} />
                    <Line type="monotone" dataKey="revenue" stroke="#1D4ED8" strokeWidth={2.5} dot={{ r: 3, fill: '#1D4ED8' }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardPanel>

            {/* Payment methods */}
            <CardPanel title={`Revenue by method — ${windowLabel}`}>
              {byMethod.length === 0 ? (
                <div className="ui-chart-empty">No paid sales yet — revenue by method will appear here.</div>
              ) : (
                <div className="dash-chart" role="img" aria-label="Revenue by payment method">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={byMethod} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                        {byMethod.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border)' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardPanel>

            {/* Status breakdown */}
            <CardPanel title="Order status">
              {statusData.length === 0 ? (
                <div className="ui-chart-empty">No orders yet{scope === 'today' ? ' today' : ''}.</div>
              ) : (
                <div className="dash-chart" role="img" aria-label="Order status breakdown">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={statusData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border)' }} />
                      <Bar dataKey="count" fill="#B45309" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardPanel>
          </div>

          {/* Low-stock quick list */}
          {lowStockItems.length > 0 && (
            <CardPanel>
              <div className="dash-low-title">
                <span>Low / out of stock — needs attention</span>
                <Link className="dash-low-link" to="/manager/oversight/stocks">View all →</Link>
              </div>
              <div className="dash-low">
                {lowStockItems.map((i) => {
                  const s = stockStatus(i.current_stock, i.reorder_level);
                  return (
                    <div key={i.id} className="dash-low__row">
                      <span className="dash-low__name">{i.name}</span>
                      <span className="dash-low__val">{i.current_stock}{i.unit}</span>
                      <Badge variant={stockBadgeVariant(s)}>
                        {stockStatusText(s)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardPanel>
          )}

          {/* Top selling items */}
          {topItems.length > 0 && (
            <CardPanel>
              <div className="dash-top-title">
                <span>Top selling items</span>
                <span className="dash-top-sub">by quantity · paid orders · {windowLabel}</span>
              </div>
              <div className="dash-top">
                {topItems.map((t, i) => (
                  <div key={t.name} className="dash-top__row">
                    <span className="dash-top__rank">{i + 1}</span>
                    <span className="dash-top__name">{t.name}</span>
                    <span className="dash-top__qty">{t.qty} sold</span>
                  </div>
                ))}
              </div>
            </CardPanel>
          )}

          {/* Live activity feed */}
          <ActivityFeed />
        </>
      )}
    </div>
  );
}
