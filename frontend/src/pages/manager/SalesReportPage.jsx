import { useState, useEffect, useMemo, useCallback } from 'react';
import { ordersAPI } from '../../services/api';
import '../../styles/SalesReportPage.css';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line,
} from 'recharts';

const STATUS_LABEL = { completed: 'Completed', cancelled: 'Cancelled', preparing: 'Preparing', confirmed: 'Confirmed', paid: 'Paid' };
const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SalesReportPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  const load = useCallback(async () => {
    try {
      const { data } = await ordersAPI.getAll();
      setOrders(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter by period
  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startDay);
  startWeek.setDate(startDay.getDate() - startDay.getDay());

  const filtered = orders.filter((o) => {
    const d = new Date(o.created_at);
    if (period === 'today') return d >= startDay;
    if (period === 'week') return d >= startWeek;
    return true;
  }).filter((o) => o.status === 'completed');

  const totalRevenue = filtered.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const orderCount = filtered.length;

  // Daily revenue within filtered set (for bar chart)
  const daily = useMemo(() => {
    const buckets = {};
    filtered.forEach((o) => {
      const d = new Date(o.created_at);
      const key = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
      buckets[key] = (buckets[key] || 0) + Number(o.total_amount || 0);
    });
    return Object.entries(buckets)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => {
        const ka = new Date(a.name + ', ' + now.getFullYear());
        const kb = new Date(b.name + ', ' + now.getFullYear());
        return ka - kb;
      });
  }, [filtered]);

  // Top items
  const topItems = useMemo(() => {
    const m = {};
    filtered.forEach((o) => {
      (o.items || []).forEach((i) => {
        const name = i.name || 'Unknown';
        m[name] = (m[name] || 0) + (i.quantity || 0);
      });
    });
    return Object.entries(m)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);
  }, [filtered]);

  return (
    <div className="sales-root">
      <div className="sales-header">
        <div>
          <h1 className="sales-title">Sales Reports</h1>
          <p className="sales-sub">Revenue trends and transaction details</p>
        </div>
        <div className="sales-period" role="group" aria-label="Filter by period">
          {[{ k: 'today', l: 'Today' }, { k: 'week', l: 'This Week' }, { k: 'all', l: 'All Time' }].map((p) => (
            <button key={p.k} className={`sales-period__btn${period === p.k ? ' sales-period__btn--active' : ''}`} onClick={() => setPeriod(p.k)} aria-pressed={period === p.k}>
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="sales-loading" role="status" aria-live="polite">
          <div className="sales-loader"><div /><div /><div /></div>
          <span>Loading sales…</span>
        </div>
      ) : (
        <>
          <div className="sales-summary">
            <div className="sales-summary__card">
              <span className="sales-summary__label">Total Revenue</span>
              <span className="sales-summary__value">{fmt(totalRevenue)}</span>
            </div>
            <div className="sales-summary__card">
              <span className="sales-summary__label">Completed Orders</span>
              <span className="sales-summary__value">{orderCount}</span>
            </div>
            <div className="sales-summary__card">
              <span className="sales-summary__label">Avg. Order Value</span>
              <span className="sales-summary__value">{orderCount ? fmt(totalRevenue / orderCount) : fmt(0)}</span>
            </div>
          </div>

          <div className="sales-grid">
            <div className="sales-card">
              <h2 className="sales-card__title">Revenue trend</h2>
              <div className="sales-chart" role="img" aria-label="Revenue trend chart">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border)' }} />
                    <Line type="monotone" dataKey="revenue" stroke="#1D4ED8" strokeWidth={2.5} dot={{ r: 3, fill: '#1D4ED8' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="sales-card">
              <h2 className="sales-card__title">Best-selling items</h2>
              <div className="sales-chart" role="img" aria-label="Best selling items bar chart">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={topItems} layout="vertical" margin={{ top: 8, right: 16, left: 40, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border)' }} />
                    <Bar dataKey="qty" fill="#B45309" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="sales-table-card">
            <h2 className="sales-card__title">Transactions</h2>
            <div className="sales-table-wrap">
              <table className="sales-table" aria-label="Sales transactions">
                <thead>
                  <tr>
                    <th scope="col">Order #</th>
                    <th scope="col">Items</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Total</th>
                    <th scope="col">Status</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6}><div className="sales-empty">No transactions in this period.</div></td></tr>
                  ) : filtered.map((o) => (
                    <tr key={o.id}>
                      <td className="sales-cell--order">#{o.order_number || o.id}</td>
                      <td className="sales-cell--items">
                        {(o.items || []).slice(0, 2).map((i) => i.name).filter(Boolean).join(', ')}
                        {(o.items || []).length > 2 && <span className="sales-more"> +{o.items.length - 2}</span>}
                      </td>
                      <td><span className={`sales-pay sales-pay--${o.payment_method || 'cash'}`}>{o.payment_method === 'gcash' ? 'GCash' : 'Cash'}</span></td>
                      <td className="sales-cell--total">{fmt(o.total_amount)}</td>
                      <td><span className="sales-status">{STATUS_LABEL[o.status] || o.status}</span></td>
                      <td className="sales-cell--time">{new Date(o.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
