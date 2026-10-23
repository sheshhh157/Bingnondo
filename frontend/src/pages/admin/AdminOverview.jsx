import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI, adminRidersAPI, staffMenuAPI } from '../../services/api';
import { ordersAPI, kitchenAPI, inventoryAPI, MANAGER_ORDER_LIMITS } from '../../services/oversightApi';
import useLiveData from '../../hooks/useLiveData';
import { currency, stockStatus, stockBadgeVariant, stockStatusText, dayKey, lastDaysBounds, itemLabel } from '../../utils/format';
import { keyEvent, orderUpsert, orderStatus, queueUpsert, stockPatch, stockCounts, splitByChannel } from './oversightData';
import NotificationBell from './NotificationBell';
import Badge from '../../components/Badge';
import CardPanel from '../../components/CardPanel';
import ErrorBanner from '../../components/ErrorBanner';
import { PageHeader } from './adminShared';
import '../../styles/AdminOverview.css';
import '../../styles/DashboardPage.css';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';

// How much order history the revenue panels read. Everything derived from the
// order list is scoped to this window; all-time revenue comes from the one-row
// /api/orders/totals aggregate instead of downloading the whole history.
const WINDOW_DAYS = 90;

const PIE_COLORS = ['#1D4ED8', '#B45309', '#0EA5E9'];

const asList = (value) => {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  return [];
};

const isRiderActive = (rider) =>
  (rider.status || rider.account_status) === 'active' || rider.is_active === true;

function storeStatus(hours) {
  if (hours.length === 0) return { state: 'unknown', label: 'Hours not set' };
  const row = hours.find((h) => h.day_of_week === new Date().getDay());
  if (!row || row.is_closed) return { state: 'closed', label: 'Closed today', row };

  const toMinutes = (t) => {
    const [h, m] = String(t || '').split(':');
    return Number(h) * 60 + Number(m);
  };
  const open = toMinutes(row.open_time);
  const close = toMinutes(row.close_time);
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const within = close >= open ? current >= open && current < close : current >= open || current < close;
  return { state: within ? 'open' : 'closed', label: within ? 'Open now' : 'Closed now', row };
}

function hourRange(row) {
  if (!row) return '—';
  const open = row.open_time ? row.open_time.slice(0, 5) : null;
  const close = row.close_time ? row.close_time.slice(0, 5) : null;
  if (!open || !close) return '—';
  return `${open}–${close}`;
}

const FETCH_LABELS = [
  'staff accounts', 'user accounts', 'business hours', 'menu categories',
  'riders', 'kitchen queue', 'inventory', 'orders', 'order totals', 'menu items',
];

const INITIAL = {
  staff: [], restrictions: [], hours: [], categories: [], riders: [],
  kitchen: [], stock: [], orders: [], total: 0, totals: {}, menu: [], failed: [],
};

export default function AdminOverview() {
  const { data, loading, error, refresh } = useLiveData({
    fetchFn: async () => {
      // One snapshot for the whole page. A single failing endpoint must not
      // blank everything: each panel falls back to empty and the banner names
      // what couldn't be loaded.
      const settled = await Promise.allSettled([
        adminAPI.listStaffAccounts(),
        adminAPI.listCustomerRestrictions({ limit: 100, flagged: 1 }),
        adminAPI.getBusinessHours(),
        adminAPI.listCategories(),
        adminRidersAPI.getAll({ limit: 100 }),
        kitchenAPI.getOrders(),
        inventoryAPI.getAll(),
        ordersAPI.getRange({ ...lastDaysBounds(WINDOW_DAYS), limit: MANAGER_ORDER_LIMITS.window }),
        ordersAPI.getTotals(),
        staffMenuAPI.getAll(),
      ]);
      const [staffR, restrR, hoursR, catsR, ridersR, kitR, invR, ordersR, totalsR, menuR] = settled;
      const failed = [];
      settled.forEach((r, i) => { if (r.status === 'rejected') failed.push(FETCH_LABELS[i]); });
      if (failed.length === settled.length) throw new Error('Overview data unavailable');
      return {
        staff: staffR.status === 'fulfilled' ? asList(staffR.value.data) : [],
        restrictions: restrR.status === 'fulfilled' ? asList(restrR.value.data) : [],
        hours: hoursR.status === 'fulfilled' ? asList(hoursR.value.data) : [],
        categories: catsR.status === 'fulfilled' ? asList(catsR.value.data) : [],
        riders: ridersR.status === 'fulfilled' ? asList(ridersR.value) : [],
        kitchen: kitR.status === 'fulfilled' ? asList(kitR.value.data) : [],
        stock: invR.status === 'fulfilled'
          ? ((invR.value.data && (invR.value.data.items || invR.value.data)) || [])
          : [],
        orders: ordersR.status === 'fulfilled' ? (ordersR.value.data || []) : [],
        total: ordersR.status === 'fulfilled' ? (ordersR.value.total || 0) : 0,
        totals: totalsR.status === 'fulfilled' ? (totalsR.value.data || {}) : {},
        menu: menuR.status === 'fulfilled' ? (menuR.value.data?.items || []) : [],
        failed,
      };
    },
    initial: INITIAL,
    // Order/inventory events are patchable lists, so merge them in place rather
    // than re-fetching the whole snapshot.
    events: [
      keyEvent('order:new', { orders: orderUpsert, kitchen: queueUpsert }),
      keyEvent('order:status', { orders: orderStatus }),
      keyEvent('inventory:update', { stock: stockPatch }),
    ],
    pollMs: 30000,
  });

  const {
    staff, restrictions, hours, categories, riders,
    kitchen, stock, orders: windowOrders, total: windowTotal, totals, menu,
  } = data;
  const failed = data.failed || [];

  // Revenue counts paid, non-cancelled orders — the same population the server
  // uses for /orders/totals and the sales report.
  const revenueOrders = useMemo(
    () => windowOrders.filter((o) => o.payment_status === 'paid' && o.status !== 'cancelled'),
    [windowOrders],
  );

  const windowRevenue = revenueOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const allTimeRevenue = Number(totals?.total_revenue || 0);
  const allTimeCollected = Number(totals?.collected_orders || 0);
  const avgTicket = revenueOrders.length ? windowRevenue / revenueOrders.length : 0;

  const { counter: counterOrders, online: onlineOrders, unknown: unknownOrders } = splitByChannel(kitchen);
  const { out, low, alerts } = stockCounts(stock);

  const staffActive = staff.filter((s) => s.status === 'active').length;
  const ridersActive = riders.filter(isRiderActive).length;
  const suspended = restrictions.filter((c) => c.restriction_level === 'suspended').length;
  const store = storeStatus(hours);

  const channelSub = unknownOrders.length > 0
    ? `${counterOrders.length} counter · ${onlineOrders.length} online · ${unknownOrders.length} unassigned`
    : `${counterOrders.length} counter · ${onlineOrders.length} online`;

  const lowStockItems = useMemo(
    () => stock
      .filter((i) => stockStatus(i.current_stock, i.reorder_level) !== 'ok')
      .sort((a, b) => a.current_stock - b.current_stock)
      .slice(0, 5),
    [stock],
  );

  const topItems = useMemo(() => {
    // Tally by menu_item_id so ratings can be joined in later; keying by the
    // display string would collapse distinct items that share a name.
    const tally = {};
    for (const o of revenueOrders) {
      for (const it of o.items || o.order_items || []) {
        const name = itemLabel(it);
        if (!name) continue;
        const key = it.menu_item_id != null ? `id:${it.menu_item_id}` : `name:${name}`;
        const row = tally[key] || (tally[key] = { menu_item_id: it.menu_item_id ?? null, name, qty: 0 });
        row.qty += Number(it.quantity) || 1;
      }
    }
    return Object.values(tally)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [revenueOrders]);

  // menu_item_id → { avg_rating, review_count } for items that have reviews.
  const ratingsById = useMemo(() => {
    const map = new Map();
    for (const m of menu) {
      const count = Number(m.review_count) || 0;
      if (count > 0) map.set(m.id, { avg_rating: Number(m.avg_rating) || 0, review_count: count });
    }
    return map;
  }, [menu]);

  const daily = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      // Building the trailing-7-day window is intentionally "now"-relative.
      // oxlint-disable-next-line react/purity
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: dayKey(d), name: d.toLocaleDateString('en-PH', { weekday: 'short' }), revenue: 0 });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const o of revenueOrders) {
      const bucket = byKey.get(dayKey(o.created_at));
      if (bucket) bucket.revenue += Number(o.total_amount || 0);
    }
    return days.map(({ name, revenue }) => ({ name, revenue }));
  }, [revenueOrders]);

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

  // The day string only changes at midnight, so it is captured in state and
  // refreshed on an interval rather than recomputed every render.
  const [todayKey, setTodayKey] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTodayKey(dayKey(new Date())), 60000);
    return () => clearInterval(id);
  }, []);

  const [scope, setScope] = useState('window');

  const statusData = useMemo(() => {
    const m = {};
    (scope === 'today'
      ? windowOrders.filter((o) => dayKey(o.created_at) === todayKey)
      : windowOrders)
      .forEach((o) => { m[o.status] = (m[o.status] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count }));
  }, [windowOrders, scope, todayKey]);

  const todayRevenue = useMemo(
    () => revenueOrders
      .filter((o) => dayKey(o.created_at) === todayKey)
      .reduce((s, o) => s + Number(o.total_amount || 0), 0),
    [revenueOrders, todayKey],
  );

  const readyCount = useMemo(
    () => windowOrders.filter((o) => o.status === 'ready').length,
    [windowOrders],
  );

  const truncated = windowTotal > windowOrders.length;
  const windowLabel = `last ${WINDOW_DAYS} days`;

  const kpis = [
    {
      id: 'revenue',
      label: 'Total revenue',
      value: currency(allTimeRevenue),
      sub: `${allTimeCollected.toLocaleString('en-PH')} paid · ${currency(todayRevenue)} today`,
      to: '/admin/sales',
    },
    {
      id: 'avg',
      label: 'Avg. ticket',
      value: currency(avgTicket),
      sub: `${revenueOrders.length} paid · ${windowLabel}`,
      to: '/admin/sales',
    },
    {
      id: 'kitchen',
      label: 'Kitchen queue',
      value: String(kitchen.length),
      sub: channelSub,
      to: '/admin/oversight/kitchen',
      tone: 'queue',
    },
    {
      id: 'low',
      label: 'Stock alerts',
      value: String(alerts),
      sub: `${out} out · ${low} low`,
      to: '/admin/inventory',
      tone: alerts ? 'alert' : undefined,
    },
    {
      id: 'staff',
      label: 'Staff accounts',
      value: staff.length,
      sub: `${staffActive} active · ${staff.length - staffActive} inactive`,
      to: '/admin/accounts',
    },
    {
      id: 'riders',
      label: 'Riders',
      value: riders.length,
      sub: `${ridersActive} active`,
      to: '/admin/riders',
    },
    {
      id: 'flagged',
      label: 'Flagged users',
      value: restrictions.length,
      sub: suspended ? `${suspended} suspended` : 'No suspensions',
      to: '/admin/restrictions',
      tone: suspended ? 'alert' : undefined,
    },
  ];

  return (
    <div className="ap-page ap-page--wide ao-page">
      <PageHeader title="Overview" sub="Store at a glance" action={<NotificationBell />} />

      {error && (
        <ErrorBanner>
          Couldn't load this overview.
          <button type="button" className="ui-error__retry" onClick={() => refresh()}>Retry</button>
        </ErrorBanner>
      )}

      {loading ? (
        <div className="dash-kpis" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="ui-stat">
              <div className="dash-skel dash-skel--label" />
              <div className="dash-skel dash-skel--value" />
              <div className="dash-skel dash-skel--sub" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {failed.length > 0 && (
            <p className="ao-note" role="status">
              Some data couldn't load: {failed.join(', ')}.
              <button type="button" className="ao-note__retry" onClick={() => refresh()}>Retry</button>
            </p>
          )}

          {/* KPI cards */}
          <div className="dash-kpis dash-kpis--overview">
            {kpis.map((k) => {
              const cls = `ui-stat dash-kpi dash-kpi--${k.id}${k.tone === 'alert' ? ' ui-stat--alert' : k.tone === 'queue' ? ' ui-stat--queue' : ''}`;
              return (
                <Link key={k.label} to={k.to} className={cls}>
                  <span className="ui-stat__label">{k.label}</span>
                  <span className="ui-stat__value">{k.value}</span>
                  <span className="ui-stat__sub">{k.sub}</span>
                </Link>
              );
            })}
          </div>

          {readyCount > 0 && (
            <Link className="dash-ready" to="/admin/oversight/kitchen">
              <span className="dash-ready__count">{readyCount}</span>
              <span className="dash-ready__text">
                {readyCount === 1 ? 'Order is ready for pickup' : `${readyCount} orders are ready for pickup`} — hand it over →
              </span>
            </Link>
          )}

          {truncated && (
            <p className="dash-truncated" role="status">
              Showing the most recent {MANAGER_ORDER_LIMITS.window.toLocaleString('en-PH')} orders
              ({windowLabel}). Older orders aren't included in the status chart or best sellers —
              Total revenue is all time and is unaffected.
            </p>
          )}

          <section className="ap-card">
            <div className="ap-card__head">
              <span className="ap-card__title">Store status</span>
            </div>
            <div className="ap-card__body">
              <div className={`ao-status ao-status--${store.state}`}>
                <span className="ao-status__dot" aria-hidden="true" />
                <span className="ao-status__label">{store.label}</span>
              </div>
              {store.row ? (
                <p className="ao-muted">Today's hours: {hourRange(store.row)}</p>
              ) : (
                <p className="ao-muted">Business hours haven't been configured yet.</p>
              )}
              <p className="ao-muted">
                {categories.length} menu categor{categories.length === 1 ? 'y' : 'ies'}
              </p>
              <Link className="ao-link" to="/admin/settings">Manage system settings →</Link>
            </div>
          </section>

          <div className="dash-scope" role="group" aria-label="Order status chart scope">
            <span className="dash-scope__label">Status chart</span>
            <button type="button" className={`dash-scope__btn${scope === 'window' ? ' dash-scope__btn--active' : ''}`} onClick={() => setScope('window')} aria-pressed={scope === 'window'}>
              {WINDOW_DAYS} days
            </button>
            <button type="button" className={`dash-scope__btn${scope === 'today' ? ' dash-scope__btn--active' : ''}`} onClick={() => setScope('today')} aria-pressed={scope === 'today'}>
              Today
            </button>
          </div>

          <div className="dash-grid">
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

          {lowStockItems.length > 0 && (
            <CardPanel>
              <div className="dash-low-title">
                <span>Low / out of stock — needs attention</span>
                <Link className="dash-low-link" to="/admin/inventory">View all →</Link>
              </div>
              <div className="dash-low">
                {lowStockItems.map((i) => {
                  const s = stockStatus(i.current_stock, i.reorder_level);
                  return (
                    <div key={i.id} className="dash-low__row">
                      <span className="dash-low__name">{i.name}</span>
                      <span className="dash-low__val">{i.current_stock}{i.unit}</span>
                      <Badge variant={stockBadgeVariant(s)}>{stockStatusText(s)}</Badge>
                    </div>
                  );
                })}
              </div>
            </CardPanel>
          )}

          {topItems.length > 0 && (
            <CardPanel>
              <div className="dash-top-title">
                <span>Top selling items</span>
                <span className="dash-top-sub">by quantity · paid orders · {windowLabel}</span>
              </div>
              <div className="dash-top">
                {topItems.map((t, i) => {
                  const rating = t.menu_item_id != null ? ratingsById.get(t.menu_item_id) : null;
                  return (
                    <div key={t.menu_item_id != null ? `id:${t.menu_item_id}` : `name:${t.name}`} className="dash-top__row">
                      <span className="dash-top__rank">{i + 1}</span>
                      <span className="dash-top__name">{t.name}</span>
                      {rating && (
                        <span className="dash-top__rating" title={`${rating.review_count} review${rating.review_count === 1 ? '' : 's'}`}>
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                            <path d="M12 2.5l2.9 6.06 6.6.83-4.86 4.5 1.25 6.56L12 17.9l-5.89 2.55 1.25-6.56L2.5 9.39l6.6-.83z" />
                          </svg>
                          {rating.avg_rating.toFixed(1)}
                          <span className="dash-top__rating-count">({rating.review_count})</span>
                        </span>
                      )}
                      <span className="dash-top__qty">{t.qty} sold</span>
                    </div>
                  );
                })}
              </div>
            </CardPanel>
          )}
        </>
      )}
    </div>
  );
}
