import { useState, useMemo } from 'react';
import { ordersAPI } from '../../services/managerApi';
import useLiveData from '../../hooks/useLiveData';
import { currency, STATUS_LABEL, normalizeLiveOrder } from '../../utils/format';
import Loader from '../../components/Loader';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import StatCard from '../../components/StatCard';
import CardPanel from '../../components/CardPanel';
import '../../styles/SalesReportPage.css';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line,
} from 'recharts';

const PERIODS = [
  { k: 'today', l: 'Today' },
  { k: 'week', l: 'This Week' },
  { k: '7d', l: '7 days' },
  { k: '30d', l: '30 days' },
  { k: 'all', l: 'All Time' },
];

function toCsv(rows) {
  const header = ['Order #', 'Items', 'Payment', 'Total', 'Status', 'Time'];
  const lines = rows.map((o) => [
    o.order_number || o.id,
    (o.items || []).map((i) => `${i.name} x${i.quantity}`).join('; '),
    o.payment_method === 'gcash' ? 'GCash' : 'Cash',
    `"${currency(o.total_amount)}"`,
    STATUS_LABEL[o.status] || o.status,
    new Date(o.created_at).toLocaleString('en-PH'),
  ].join(','));
  return [header.join(','), ...lines].join('\n');
}

export default function SalesReportPage() {
  const { data: allOrders = [], loading } = useLiveData({
    fetchFn: async () => {
      const { data } = await ordersAPI.getAll();
      return data;
    },
    events: [
      {
        name: 'order:new',
        merge: (prev, p) => {
          const order = normalizeLiveOrder(p);
          if (!order || prev.some((o) => o.id === order.id)) return prev;
          return [order, ...prev];
        },
      },
    ],
  });

  const [period, setPeriod] = useState('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [expanded, setExpanded] = useState(null);

  // Stable "now" captured once per mount so the `filtered`/`daily`
  // memos below don't recompute on every render.
  const [now] = useState(() => new Date());

  const filtered = useMemo(() => {
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start = null;
    if (period === 'today') start = startDay;
    else if (period === 'week') {
      const sw = new Date(startDay);
      sw.setDate(startDay.getDate() - startDay.getDay());
      start = sw;
    } else if (period === '7d') start = new Date(startDay.getTime() - 6 * 24 * 60 * 60 * 1000);
    else if (period === '30d') start = new Date(startDay.getTime() - 29 * 24 * 60 * 60 * 1000);
    else if (period === 'custom') {
      const s = customStart ? new Date(customStart + 'T00:00:00') : null;
      const e = customEnd ? new Date(customEnd + 'T23:59:59') : null;
      return allOrders.filter((o) => {
        if (o.status !== 'completed') return false;
        const d = new Date(o.created_at);
        if (s && d < s) return false;
        if (e && d > e) return false;
        return true;
      });
    }

    return allOrders
      .filter((o) => o.status === 'completed')
      .filter((o) => !start || new Date(o.created_at) >= start);
  }, [allOrders, period, customStart, customEnd, now]);

  const totalRevenue = filtered.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const orderCount = filtered.length;

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
  }, [filtered, now]);

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

  const handleExport = () => {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${period}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sales-root">
      <div className="ui-pageheader">
        <div>
          <h1 className="ui-pageheader__title">Sales Reports</h1>
          <p className="ui-pageheader__sub">Revenue trends and transaction details</p>
        </div>
        <div className="sales-period" role="group" aria-label="Filter by period">
          {PERIODS.map((p) => (
            <button key={p.k} className={`sales-period__btn${period === p.k ? ' sales-period__btn--active' : ''}`} onClick={() => setPeriod(p.k)} aria-pressed={period === p.k}>
              {p.l}
            </button>
          ))}
          <button className={`sales-period__btn${period === 'custom' ? ' sales-period__btn--active' : ''}`} onClick={() => setPeriod('custom')} aria-pressed={period === 'custom'}>
            Custom
          </button>
          {period === 'custom' && (
            <span className="sales-date-wrap">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="sales-date" aria-label="Start date" />
              <span className="sales-date-sep">–</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="sales-date" aria-label="End date" />
            </span>
          )}
          <button className="ui-btn ui-btn--primary" onClick={handleExport} disabled={filtered.length === 0}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <Loader text="Loading sales…" />
      ) : (
        <>
          <div className="sales-summary">
            <StatCard label="Total Revenue" value={currency(totalRevenue)} />
            <StatCard label="Completed Orders" value={orderCount} />
            <StatCard label="Avg. Order Value" value={orderCount ? currency(totalRevenue / orderCount) : currency(0)} />
          </div>

          <div className="sales-grid">
            <CardPanel title="Revenue trend">
              <div className="sales-chart" role="img" aria-label="Revenue trend chart">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border)' }} />
                    <Line type="monotone" dataKey="revenue" stroke="#1D4ED8" strokeWidth={2.5} dot={{ r: 3, fill: '#1D4ED8' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardPanel>

            <CardPanel title="Best-selling items">
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
            </CardPanel>
          </div>

          <CardPanel title="Transactions">
            <div className="sales-table-wrap">
              <table className="sales-table" aria-label="Sales transactions">
                <thead>
                  <tr>
                    <th scope="col"></th>
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
                    <tr><td colSpan={7}><EmptyState message="No transactions in this period." /></td></tr>
                  ) : filtered.map((o) => (
                    <FragmentRow key={o.id} order={o} expanded={expanded === o.id} onToggle={() => setExpanded(expanded === o.id ? null : o.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardPanel>
        </>
      )}
    </div>
  );
}

function FragmentRow({ order, expanded, onToggle }) {
  return (
    <>
      <tr className={`sales-row${expanded ? ' sales-row--open' : ''}`}>
        <td>
          <button className="sales-expand" onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? 'Collapse order details' : 'Expand order details'}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
        </td>
        <td className="sales-cell--order">#{order.order_number || order.id}</td>
        <td className="sales-cell--items">
          {(order.items || []).slice(0, 2).map((i) => i.name).filter(Boolean).join(', ')}
          {(order.items || []).length > 2 && <span className="sales-more"> +{order.items.length - 2}</span>}
        </td>
        <td><Badge variant={order.payment_method === 'gcash' ? 'info' : 'muted'}>{order.payment_method === 'gcash' ? 'GCash' : 'Cash'}</Badge></td>
        <td className="sales-cell--total">{currency(order.total_amount)}</td>
        <td><Badge variant={order.status === 'completed' ? 'success' : 'warning'}>{STATUS_LABEL[order.status] || order.status}</Badge></td>
        <td className="sales-cell--time">{new Date(order.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</td>
      </tr>
      {expanded && (
        <tr className="sales-detail-row">
          <td colSpan={7}>
            <div className="sales-detail">
              <strong className="sales-detail__title">Items</strong>
              {(order.items || []).map((i) => (
                <div key={i.name + i.unit_price} className="sales-detail__item">
                  <span className="sales-detail__qty">{i.quantity}×</span>
                  <span className="sales-detail__name">{i.name}</span>
                  <span className="sales-detail__price">{currency((i.unit_price || 0) * (i.quantity || 1))}</span>
                </div>
              ))}
              <div className="sales-detail__total">
                <span>Subtotal</span>
                <strong>{currency(order.total_amount)}</strong>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
