import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI, inventoryAPI, kitchenAPI } from '../../services/managerApi';
import useLiveData from '../../hooks/useLiveData';
import { currency, stockStatus, stockBadgeVariant, normalizeLiveOrder } from '../../utils/format';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';
import CardPanel from '../../components/CardPanel';
import PageHeader from '../../components/PageHeader';
import '../../styles/DashboardPage.css';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';

const PIE_COLORS = ['#1D4ED8', '#B45309', '#0EA5E9'];

export default function DashboardPage() {
  const { data: orders, loading } = useLiveData({
    fetchFn: async () => {
      const [o, k, s] = await Promise.all([
        ordersAPI.getAll(),
        kitchenAPI.getOrders(),
        inventoryAPI.getAll(),
      ]);
      return { orders: o.data, kitchen: k.data, stock: s.data.items || s.data };
    },
    initial: { orders: [], kitchen: [], stock: [] },
events: [
      {
        name: 'inventory:update',
        merge: (prev, p) => {
          if (!p) return prev;
          const stock = (prev?.stock ?? []);
          const idx = stock.findIndex((i) => i.id === p.itemId);
          if (idx < 0) return prev;
          const nextStock = stock.slice();
          nextStock[idx] = { ...nextStock[idx], current_stock: p.currentStock };
          return { ...prev, stock: nextStock };
        },
      },
      {
        name: 'order:status',
        merge: (prev, p) => {
          if (!p) return prev;
          const orders = (prev?.orders ?? []);
          const idx = orders.findIndex((o) => o.id === p.orderId);
          if (idx < 0) return prev;
          const nextOrders = orders.slice();
          nextOrders[idx] = { ...nextOrders[idx], status: p.status };
          return { ...prev, orders: nextOrders };
        },
      },
      {
        name: 'order:new',
        merge: (prev, p) => {
          if (!p) return prev;
          const orders = (prev?.orders ?? []);
          if (orders.some((o) => o.id === p.id)) return prev;
          const order = normalizeLiveOrder(p);
          return { ...prev, orders: [order, ...orders], kitchen: [p, ...(prev?.kitchen ?? [])] };
        },
      },
    ],
  });

  const { orders: allOrders = [], kitchen = [], stock = [] } = orders;

  // Memoized so downstream useMemos keyed on `completed` don't recompute
  // on every render (allOrders only changes identity when data is set).
  const completed = useMemo(() => allOrders.filter((o) => o.status === 'completed'), [allOrders]);
  const revenue = completed.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const avgTicket = completed.length ? revenue / completed.length : 0;

  const counterOrders = kitchen.filter((o) => o.order_channel !== 'mobile_app');
  const onlineOrders = kitchen.filter((o) => o.order_channel === 'mobile_app');

  const out = stock.filter((i) => i.current_stock <= 0).length;
  const low = stock.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level).length;

  // Low-stock quick list (top 5)
  const lowStockItems = useMemo(() => {
    return stock
      .filter((i) => stockStatus(i.current_stock, i.reorder_level) !== 'ok')
      .sort((a, b) => a.current_stock - b.current_stock)
      .slice(0, 5);
  }, [stock]);

  // Daily revenue trend (last 7 days)
  const daily = useMemo(() => {
    const buckets = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('en-PH', { weekday: 'short' });
      buckets[key] = 0;
    }
    completed.forEach((o) => {
      const d = new Date(o.created_at);
      const now = new Date();
      const diff = Math.floor((now - d) / (24 * 60 * 60 * 1000));
      if (diff >= 0 && diff <= 6) {
        const key = d.toLocaleDateString('en-PH', { weekday: 'short' });
        buckets[key] = (buckets[key] || 0) + Number(o.total_amount || 0);
      }
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, revenue: value }));
  }, [completed]);

  // Revenue by payment method
  const byMethod = useMemo(() => {
    const m = { cash: 0, gcash: 0 };
    completed.forEach((o) => {
      const k = o.payment_method === 'gcash' ? 'gcash' : 'cash';
      m[k] += Number(o.total_amount || 0);
    });
    return [
      { name: 'Cash', value: Math.round(m.cash) },
      { name: 'GCash', value: Math.round(m.gcash) },
    ].filter((x) => x.value > 0);
  }, [completed]);

  // Order status breakdown
  const statusData = useMemo(() => {
    const m = {};
    allOrders.forEach((o) => { m[o.status] = (m[o.status] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count }));
  }, [allOrders]);

  const todayOrders = completed.filter((o) => {
    const d = new Date(o.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  const kpis = [
    { label: 'Total Revenue', value: currency(revenue), sub: `${todayOrders} orders today`, accent: 'none' },
    { label: 'Avg. Ticket', value: currency(avgTicket), sub: `${completed.length} completed`, accent: 'none' },
    { label: 'Kitchen Queue', value: String(kitchen.length), sub: `${counterOrders.length} counter · ${onlineOrders.length} online`, accent: 'queue' },
    { label: 'Stock Alerts', value: String(out + low), sub: `${out} out · ${low} low`, accent: out + low > 0 ? 'alert' : 'none' },
  ];

  return (
    <div className="dash-root">
      <PageHeader
        title="Dashboard"
        sub="Analytics and operational pulse (auto-refreshes in real time)"
      />

      {loading ? (
        <Loader text="Loading dashboard…" />
      ) : (
        <>
          {/* KPI cards */}
          <div className="dash-kpis">
            {kpis.map((k) => (
              <div key={k.label} className={`ui-stat${k.accent === 'alert' ? ' ui-stat--alert' : k.accent === 'queue' ? ' ui-stat--queue' : ''}`}>
                <span className="ui-stat__label">{k.label}</span>
                <span className="ui-stat__value">{k.value}</span>
                <span className="ui-stat__sub">{k.sub}</span>
              </div>
            ))}
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
            <CardPanel title="Revenue by method">
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
            </CardPanel>

            {/* Status breakdown */}
            <CardPanel title="Order status">
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
                        {s === 'out' ? 'Out of stock' : 'Low stock'}
                      </Badge>
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
