import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ordersAPI } from '../../services/oversightApi';
import useLiveData from '../../hooks/useLiveData';
import { currency, STATUS_LABEL, periodBounds, itemLabel } from '../../utils/format';
import { toCsv, downloadCsv } from '../../utils/csv';
import { listEvent, orderUpsert } from './oversightData';
import PageSkeleton from '../../components/PageSkeleton';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import StatCard from '../../components/StatCard';
import CardPanel from '../../components/CardPanel';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorBanner from '../../components/ErrorBanner';
import Pagination from '../../components/Pagination';
import FilterModal, { FilterTrigger, FilterInline } from '../../components/MobileFilter';
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
  { k: 'custom', l: 'Custom' },
];

const SALES_CSV_HEADERS = ['Order #', 'Items', 'Payment', 'Total', 'Status', 'Time'];

/** Rows per page in the transactions table. */
const TABLE_PAGE_SIZE = 10;

/**
 * Stable empty values. `data?.x || []` allocates a fresh array on every render,
 * which invalidates every `useMemo` keyed on it and re-derives the whole
 * report for no reason.
 */
const NO_ORDERS = [];

/** Placeholder for the server aggregates before the first response lands. */
const EMPTY_REPORT = {
  revenue: 0,
  order_count: 0,
  cancelled_count: 0,
  method_split: [],
  daily: [],
  top_items: [],
  peak_hours: [],
};

/** Placeholder for the transactions page before the first response lands. */
const EMPTY_PAGE = { data: NO_ORDERS, total: 0 };

function buildSalesCsv(rows) {
  return toCsv(SALES_CSV_HEADERS, rows, (o) => [
    o.order_number || o.id,
    (o.items || []).map((i) => `${itemLabel(i)} x${i.quantity}`).join('; '),
    o.payment_method === 'gcash' ? 'GCash' : 'Cash',
    currency(o.total_amount),
    STATUS_LABEL[o.status] || o.status,
    new Date(o.created_at).toLocaleString('en-PH'),
  ]);
}

function PeakTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const h = payload[0].payload;
  return (
    <div style={{ borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-card)', padding: '6px 10px', fontSize: '0.8rem' }}>
      <strong>{h.name}</strong> · {h.orders} order{h.orders === 1 ? '' : 's'}
      <div>{currency(h.revenue)}</div>
    </div>
  );
}

export default function SalesReportPage() {
  const [period, setPeriod] = useState('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Horizontal scroll position of the period strip. `visible` only when the
  // strip overflows; `ratio` (0..1) and `thumb` (%) drive the scrollbar thumb.
  const stripRef = useRef(null);
  const [strip, setStrip] = useState({ visible: false, ratio: 0, thumb: 100 });

  // Stable "now" captured once per mount so the bound memos below don't
  // recompute on every render, and so a period never straddles midnight
  // halfway through a session.
  const [now] = useState(() => new Date());

  // One definition of every period, shared with the dashboard and oversight.
  const bounds = useMemo(
    () => periodBounds(period, { customStart, customEnd, now }),
    [period, customStart, customEnd, now],
  );

  const query = search.trim();
  // 'all' is the select's "every method" option, not a method name — collapse it
  // to undefined so the API omits the filter entirely.
  const paymentParam = paymentFilter === 'all' ? undefined : paymentFilter;

  // Every filter and period switch starts at page 1. Done in the handlers
  // rather than an effect, so a stale page number never survives a change.
  const resetToFirstPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  // ── Aggregates ──────────────────────────────────────────────────────────────
  // Revenue, order count, trend, best sellers and peak hours all come from
  // Postgres. They used to be reduced in the browser from a downloaded page of
  // orders, which meant a period wider than the row limit reported a confident
  // but understated total — and the search box could only match items inside
  // the rows that happened to be loaded.
  const fetchReport = useCallback(
    () => ordersAPI.getReport({ ...bounds, payment: paymentParam, search: query }),
    [bounds, paymentParam, query],
  );

  const {
    data: report,
    loading: reportLoading,
    error: reportError,
    refresh: refreshReport,
  } = useLiveData({
    fetchFn: fetchReport,
    // These figures are server-derived, so a new order can't be merged into
    // them — the totals have to be recomputed. Fetched quietly (`refetchEvents`
    // runs the same path as the poll), and at a longer interval than the table
    // because the summary only changes when a sale is taken.
    refetchEvents: ['order:new'],
    initial: EMPTY_REPORT,
    pollMs: 30000,
    reloadKey: `${period}|${customStart}|${customEnd}|${paymentFilter}|${query}`,
  });

  const {
    revenue: totalRevenue,
    order_count: orderCount,
    cancelled_count: cancelledCount,
    method_split: methodSplit,
    daily,
    top_items: topItems,
    peak_hours: peakBuckets,
    // `getReport` returns `{ data: row }`, and useLiveData stores that envelope
    // verbatim as `report`. The aggregates therefore live one level down —
    // destructuring off `report` itself yields undefined and iterating
    // `method_split` throws. See ordersAPI.getReport's return contract.
  } = report?.data ?? EMPTY_REPORT;

  // ── Transactions table ──────────────────────────────────────────────────────
  // A page of rows at a time, with `status` applied server-side. The previous
  // build paged the full period in the browser, which required downloading
  // every matching order before it could show the first page.
  const fetchPage = useCallback(
    () => ordersAPI.getRange({
      ...bounds,
      limit: TABLE_PAGE_SIZE,
      offset: (page - 1) * TABLE_PAGE_SIZE,
      status: statusFilter === 'all' ? undefined : statusFilter,
      payment: paymentParam,
      search: query,
    }),
    [bounds, page, statusFilter, paymentParam, query],
  );

  const {
    data: tableData,
    loading: tableLoading,
    error: tableError,
    refresh: refreshTable,
  } = useLiveData({
    fetchFn: fetchPage,
    // A row list is patchable, so a new order is merged in rather than
    // re-fetched — it lands at the top, which is where the query put it.
    events: [listEvent('order:new', orderUpsert)],
    initial: EMPTY_PAGE,
    reloadKey: `${period}|${customStart}|${customEnd}|${statusFilter}|${paymentFilter}|${query}|${page}`,
  });

  const pageRows = tableData?.data ?? NO_ORDERS;
  const matchCount = tableData?.total ?? 0;
  // Rows that match the filters but sit on another page: the export only ever
  // writes the page on screen, so the confirmation has to say how many are left out.
  const unmatchedOnOtherPages = Math.max(0, matchCount - pageRows.length);

  // `total` is the unpaged match count, so the pager doesn't need every row to
  // know how many pages exist.
  const totalPages = Math.max(1, Math.ceil(matchCount / TABLE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // The summary and the table load independently, and paging / filtering only
  // reloads one of them. The full-page skeleton is therefore reserved for the
  // first paint: once either half has data, a reload keeps the current view in
  // place rather than collapsing the page and throwing the scroll back to the
  // top. `tableBusy` drives a quiet overlay on the table for later reloads.
  const firstPaint = report?.data == null || tableData === EMPTY_PAGE;
  const showSkeleton = firstPaint && (reportLoading || tableLoading);
  const tableBusy = tableLoading && !showSkeleton;

  const error = reportError || tableError;

  // Track the period strip's overflow. The ResizeObserver callback fires once on
  // observe and again on any resize, so the initial measure never runs
  // synchronously in the effect body.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setStrip({
        visible: max > 1,
        ratio: max > 0 ? el.scrollLeft / max : 0,
        thumb: el.scrollWidth > 0 ? Math.max((el.clientWidth / el.scrollWidth) * 100, 12) : 100,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onStripScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setStrip((s) => ({ ...s, ratio: max > 0 ? el.scrollLeft / max : 0 }));
  };

  // Both halves are refetched together: the summary and the table describe the
  // same period, and letting one update a moment before the other would briefly
  // show a total that doesn't match the rows under it.
  const refresh = useCallback(
    (silent) =>
      Promise.all([refreshReport(silent), refreshTable(silent)]).then((results) => results.every(Boolean)),
    [refreshReport, refreshTable],
  );

  // Revenue by payment method. The server already grouped it, so this only maps
  // the rows it returned onto the two fixed labels the UI renders.
  const methods = useMemo(() => {
    const m = { cash: null, gcash: null };
    for (const row of methodSplit) {
      if (row.method === 'cash' || row.method === 'gcash') m[row.method] = row;
    }
    return m;
  }, [methodSplit]);

  // Day labels for the trend chart. The server buckets by calendar day in the
  // viewer's timezone and returns them as 'YYYY-MM-DD'; sorting and labelling
  // still happen here, but from an already-sorted, already-aggregated list, so
  // there is nothing left that could disagree with the totals.
  const dailyChart = useMemo(
    () => (daily || []).map((d) => {
      const [y, m, day] = String(d.day).split('-').map(Number);
      return {
        key: d.day,
        name: new Date(y, m - 1, day).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        revenue: Number(d.revenue || 0),
      };
    }),
    [daily],
  );

  // Hourly activity (0–23) for the peak-hours chart. The server returns only
  // hours with activity, so the full day is filled in here — recharts needs a
  // dense axis to draw 24 evenly spaced bars.
  const peakHours = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({
      name: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
      orders: 0,
      revenue: 0,
    }));
    for (const b of peakBuckets || []) {
      const h = Number(b.hour);
      if (h >= 0 && h < 24) {
        hours[h].orders = Number(b.orders || 0);
        hours[h].revenue = Number(b.revenue || 0);
      }
    }
    return hours;
  }, [peakBuckets]);

  const busiestHour = useMemo(() => {
    let best = null;
    for (const h of peakHours) {
      if (h.orders > 0 && (!best || h.orders > best.orders)) best = h;
    }
    return best;
  }, [peakHours]);

  // Exports the rows on screen, and says so. The old export wrote every
  // matching row in the period; with a server-paged table that would mean
  // silently downloading the whole period on click, so the button now exports
  // the current page and the label reflects that.
  const handleExport = () => {
    downloadCsv(
      buildSalesCsv(pageRows),
      `sales-report-${period}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    setExportOpen(false);
  };

  const hasFilters = statusFilter !== 'all' || paymentFilter !== 'all';
  const filterFields = (
    <>
      <select className="sales-select" value={statusFilter} onChange={(e) => resetToFirstPage(setStatusFilter)(e.target.value)} aria-label="Filter by status">
        <option value="all">All statuses</option>
        {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <select className="sales-select" value={paymentFilter} onChange={(e) => resetToFirstPage(setPaymentFilter)(e.target.value)} aria-label="Filter by payment method">
        <option value="all">All payments</option>
        <option value="cash">Cash</option>
        <option value="gcash">GCash</option>
      </select>
    </>
  );

  return (
    <div className="sales-root">
      <div className="ui-pageheader">
        <div>
          <h1 className="ui-pageheader__title">Sales Reports</h1>
          <p className="ui-pageheader__sub">
            Period reports and transaction details. Revenue counts orders that have been paid
            and not cancelled — the status filter below applies to the table only.
          </p>
        </div>
        <div className="sales-controls">
          <div className="sales-period" role="group" aria-label="Filter by period">
            <div className="sales-period__scroll" ref={stripRef} onScroll={onStripScroll}>
              {PERIODS.map((p) => (
                <button key={p.k} className={`sales-period__btn${period === p.k ? ' sales-period__btn--active' : ''}`} onClick={() => resetToFirstPage(setPeriod)(p.k)} aria-pressed={period === p.k}>
                  {p.l}
                </button>
              ))}
            </div>
            {strip.visible && (
              <span className="sales-period__scrollbar" aria-hidden="true">
                <span
                  className="sales-period__scrollbar-thumb"
                  style={{ width: `${strip.thumb}%`, left: `${strip.ratio * (100 - strip.thumb)}%` }}
                />
              </span>
            )}
          </div>
          {period === 'custom' && (
            <span className="sales-date-wrap">
              <input type="date" value={customStart} onChange={(e) => resetToFirstPage(setCustomStart)(e.target.value)} className="sales-date" aria-label="Start date" />
              <span className="sales-date-sep">–</span>
              <input type="date" value={customEnd} onChange={(e) => resetToFirstPage(setCustomEnd)(e.target.value)} className="sales-date" aria-label="End date" />
            </span>
          )}
          <button
            className="ui-btn ui-btn--primary sales-export"
            onClick={() => setExportOpen(true)}
            disabled={pageRows.length === 0}
            title={matchCount > pageRows.length
              ? `Exports the ${pageRows.length} orders on this page, not all ${matchCount} matches.`
              : undefined}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export this page
          </button>
        </div>
      </div>

      {error && (
        <ErrorBanner>
          Couldn't load this view.
          <button type="button" className="ui-error__retry" onClick={() => refresh()}>Retry</button>
        </ErrorBanner>
      )}

      {showSkeleton ? (
        <PageSkeleton stats={3} charts={2} rows={5} />
      ) : (
        <>
          <div className="sales-filters">
            <div className="sales-search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => resetToFirstPage(setSearch)(e.target.value)}
                placeholder="Search order # or item…"
                className="sales-search__input"
                aria-label="Search orders"
              />
            </div>
            <FilterTrigger open={filterOpen} onClick={() => setFilterOpen(true)} active={hasFilters} label="Filter orders" />
            <FilterInline>{filterFields}</FilterInline>
          </div>

          <div className="sales-summary">
            <StatCard label="Revenue Collected" value={currency(totalRevenue)} />
            <StatCard label="Paid Orders" value={orderCount} />
            <StatCard label="Avg. Order Value" value={orderCount ? currency(totalRevenue / orderCount) : currency(0)} />
          </div>

          {(methods.cash || methods.gcash || cancelledCount > 0) && (
            <div className="sales-substats" role="status">
              {methods.cash && (
                <span className="sales-method sales-method--cash">
                  Cash <strong>{currency(methods.cash.amount)}</strong> · {methods.cash.count} order{methods.cash.count === 1 ? '' : 's'}
                </span>
              )}
              {methods.gcash && (
                <span className="sales-method sales-method--gcash">
                  GCash <strong>{currency(methods.gcash.amount)}</strong> · {methods.gcash.count} order{methods.gcash.count === 1 ? '' : 's'}
                </span>
              )}
              {cancelledCount > 0 && (
                <span className="sales-cancel">
                  {cancelledCount} cancelled order{cancelledCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          )}

          <div className="sales-grid">
            <CardPanel title="Revenue trend">
              {dailyChart.length === 0 ? (
                <div className="ui-chart-empty">No paid orders in this period — revenue trend will appear here.</div>
              ) : (
                <div className="sales-chart" role="img" aria-label="Revenue trend chart">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={dailyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip formatter={(v) => currency(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--color-border)' }} />
                      <Line type="monotone" dataKey="revenue" stroke="#1D4ED8" strokeWidth={2.5} dot={{ r: 3, fill: '#1D4ED8' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardPanel>

            <CardPanel title="Best-selling items">
              {topItems.length === 0 ? (
                <div className="ui-chart-empty">No item sales in this period — best sellers will appear here.</div>
              ) : (
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
              )}
            </CardPanel>
          </div>

          <CardPanel title={busiestHour ? `Peak hours — busiest around ${busiestHour.name}` : 'Peak hours'}>
            {busiestHour ? (
              <div className="sales-chart" role="img" aria-label="Orders per hour bar chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={peakHours} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip content={<PeakTooltip />} />
                    <Bar dataKey="orders" fill="#1D4ED8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="ui-chart-empty">No order activity in this period — peak hours will appear here.</div>
            )}
          </CardPanel>

          <CardPanel title="Transactions" className="sales-card">
            <div className={`sales-table-wrap${tableBusy ? ' sales-table-wrap--busy' : ''}`} aria-busy={tableBusy}>
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
                  {pageRows.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState message="No transactions match your filters." /></td></tr>
                  ) : pageRows.map((o) => (
                    <FragmentRow key={o.id} order={o} expanded={expanded === o.id} onToggle={() => setExpanded(expanded === o.id ? null : o.id)} />
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={currentPage}
              totalPages={totalPages}
              total={matchCount}
              from={pageRows.length ? (currentPage - 1) * TABLE_PAGE_SIZE + 1 : 0}
              to={(currentPage - 1) * TABLE_PAGE_SIZE + pageRows.length}
              onPage={setPage}
              label="Transactions pagination"
            />
          </CardPanel>
        </>
      )}

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter orders">
        {filterFields}
      </FilterModal>

      <ConfirmDialog
        open={exportOpen}
        title="Export this page?"
        message={
          unmatchedOnOtherPages > 0
            ? `This downloads the ${pageRows.length} order${pageRows.length === 1 ? '' : 's'} currently shown as a CSV file (order number, items, payment, total, status, time). Only this page is exported — ${unmatchedOnOtherPages} more order${unmatchedOnOtherPages === 1 ? '' : 's'} match your filters but sit on other pages and won't be included. To export those, change the period, filters, or go to another page first.`
            : `This downloads ${pageRows.length === 1 ? 'the one matching order' : `all ${pageRows.length} matching orders`} as a CSV file (order number, items, payment, total, status, time). Every order matching your current filters is included.`
        }
        confirmLabel="Export CSV"
        cancelLabel="Cancel"
        tone="primary"
        onConfirm={handleExport}
        onCancel={() => setExportOpen(false)}
      />
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
          {(order.items || []).slice(0, 2).map((i) => itemLabel(i)).filter(Boolean).join(', ')}
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
              {(order.items || []).map((i, idx) => (
                <div key={`${i.name}-${i.variant_name ?? ''}-${i.unit_price}-${idx}`} className="sales-detail__item">
                  <span className="sales-detail__qty">{i.quantity}×</span>
                  <span className="sales-detail__name">{itemLabel(i)}</span>
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
