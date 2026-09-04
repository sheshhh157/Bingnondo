import { useState, useEffect, useMemo, useCallback } from 'react';
import { ordersAPI, inventoryAPI, kitchenAPI } from '../../services/api';
import '../../styles/DashboardPage.css';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';

const PIE_COLORS = ['#1D4ED8', '#B45309', '#0EA5E9'];

function currency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const [orders, setOrders] = useState([]);
  const [kitchen, setKitchen] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [o, k, s] = await Promise.all([
        ordersAPI.getAll(),
        kitchenAPI.getOrders(),
        inventoryAPI.getAll(),
      ]);
      setOrders(o.data);
      setKitchen(k.data);
      setStockItems(s.data.items || s.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const completed = orders.filter((o) => o.status === 'completed');
  const revenue = completed.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const avgTicket = completed.length ? revenue / completed.length : 0;

  const counterOrders = kitchen.filter((o) => o.order_channel !== 'mobile_app');
  const onlineOrders = kitchen.filter((o) => o.order_channel === 'mobile_app');

  const out = stockItems.filter((i) => i.current_stock <= 0).length;
  const low = stockItems.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level).length;

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
    orders.forEach((o) => { m[o.status] = (m[o.status] || 0) + 1; });
    return Object.entries(m).map(([name, count]) => ({ name, count }));
  }, [orders]);

  const todayOrders = completed.filter((o) => {
    const d = new Date(o.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  const kpis = [
    { label: 'Total Revenue', value: currency(revenue), sub: `${todayOrders} orders today`, accent: false },
    { label: 'Avg. Ticket', value: currency(avgTicket), sub: `${completed.length} completed`, accent: false },
    { label: 'Kitchen Queue', value: String(kitchen.length), sub: `${counterOrders.length} counter · ${onlineOrders.length} online`, accent: 'queue' },
    { label: 'Stock Alerts', value: String(out + low), sub: `${out} out · ${low} low`, accent: out + low > 0 ? 'alert' : false },
  ];

  return (
    <div className="dash-root">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-sub">Analytics and operational pulse at a glance</p>
        </div>
        <button className="dash-refresh" onClick={load} aria-label="Refresh">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="dash-loading" role="status" aria-live="polite">
          <div className="dash-loader"><div /><div /><div /></div>
          <span>Loading dashboard…</span>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="dash-kpis">
            {kpis.map((k) => (
              <div key={k.label} className={`dash-kpi${k.accent === 'alert' ? ' dash-kpi--alert' : k.accent === 'queue' ? ' dash-kpi--queue' : ''}`}>
                <span className="dash-kpi__label">{k.label}</span>
                <span className="dash-kpi__value">{k.value}</span>
                <span className="dash-kpi__sub">{k.sub}</span>
              </div>
            ))}
          </div>

          <div className="dash-grid">
            {/* Revenue trend */}
            <div className="dash-card dash-card--wide">
              <h2 className="dash-card__title">Revenue — last 7 days</h2>
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
            </div>

            {/* Payment methods */}
            <div className="dash-card">
              <h2 className="dash-card__title">Revenue by method</h2>
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
            </div>

            {/* Status breakdown */}
            <div className="dash-card">
              <h2 className="dash-card__title">Order status</h2>
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
