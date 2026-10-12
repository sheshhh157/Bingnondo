import { useState, useEffect, useMemo } from 'react';
import { ordersAPI } from '../../../services/cashierApi';
import '../../../styles/TransactionHistory.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_LABEL = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready:     'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_CLASS = {
  pending:   'th-status--pending',
  confirmed: 'th-status--confirmed',
  preparing: 'th-status--preparing',
  ready:     'th-status--ready',
  completed: 'th-status--completed',
  cancelled: 'th-status--cancelled',
};

const PAYMENT_METHODS = ['all', 'cash', 'gcash'];
const STATUSES        = ['all', 'pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
const PAGE_SIZE_OPTIONS = [10, 20, 50];

const fmt   = (n) => `₱${Number(n).toFixed(2)}`;
const fmtDt = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
};

// ─── Sort icon ────────────────────────────────────────────────────────────────
function SortIcon({ col, sortCol, sortDir }) {
  const active = sortCol === col;
  return (
    <span className="th-sort-icon" aria-hidden="true">
      <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
        {/* Up chevron */}
        <polyline
          points="2,6 5,2 8,6"
          stroke={active && sortDir === 'asc' ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          opacity={active && sortDir === 'asc' ? 1 : 0.35}
        />
        {/* Down chevron */}
        <polyline
          points="2,8 5,12 8,8"
          stroke={active && sortDir === 'desc' ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          opacity={active && sortDir === 'desc' ? 1 : 0.35}
        />
      </svg>
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TransactionHistory() {
  // ── Remote data ─────────────────────────────────────────────────────────────
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // ── Toolbar controls ────────────────────────────────────────────────────────
  const [range,       setRange]       = useState('today');   // 'today' | 'week'
  const [search,      setSearch]      = useState('');
  const [payFilter,   setPayFilter]   = useState('all');     // payment method
  const [statusFilter,setStatusFilter]= useState('all');
  const [sortCol,     setSortCol]     = useState('created_at');
  const [sortDir,     setSortDir]     = useState('desc');

  // ── Pagination ──────────────────────────────────────────────────────────────
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ── Expand row ──────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await ordersAPI.getMyTransactions({ range });
      setOrders(Array.isArray(data) ? data : data.orders || []);
    } catch {
      setError('Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [range]);

  // Reset to page 1 whenever a filter/sort/search changes
  useEffect(() => { setPage(1); }, [range, search, payFilter, statusFilter, sortCol, sortDir, pageSize]);

  // ── Derived: filter + sort ───────────────────────────────────────────────────
  const processed = useMemo(() => {
    let list = [...orders];

    // Search: order number or item name
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) => {
        const num  = String(o.order_number || o.id).toLowerCase();
        const items = (o.items || []).map((i) => (i.name || i.menu_item?.name || '').toLowerCase()).join(' ');
        return num.includes(q) || items.includes(q);
      });
    }

    // Payment filter
    if (payFilter !== 'all') {
      list = list.filter((o) => (o.payment_method || 'cash') === payFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter((o) => o.status === statusFilter);
    }

    // Sort
    list.sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case 'order_number':
          av = Number(a.order_number || a.id);
          bv = Number(b.order_number || b.id);
          break;
        case 'total_amount':
          av = Number(a.total_amount || 0);
          bv = Number(b.total_amount || 0);
          break;
        case 'status':
          av = a.status || '';
          bv = b.status || '';
          break;
        case 'payment_method':
          av = a.payment_method || 'cash';
          bv = b.payment_method || 'cash';
          break;
        default: // created_at
          av = new Date(a.created_at).getTime();
          bv = new Date(b.created_at).getTime();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [orders, search, payFilter, statusFilter, sortCol, sortDir]);

  // ── Pagination slice ─────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paginated  = processed.slice((safePage - 1) * pageSize, safePage * pageSize);

  // ── Totals (filtered, not just paginated) ────────────────────────────────────
  const filteredTotal = processed.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  // ── Sort handler ─────────────────────────────────────────────────────────────
  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  };

  const thBtn = (col, label) => (
    <button className="th-th-btn" onClick={() => handleSort(col)} aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {label}
      <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
    </button>
  );

  // ── Active filter count (for badge) ─────────────────────────────────────────
  const activeFilters = [search.trim() && 1, payFilter !== 'all' && 1, statusFilter !== 'all' && 1].filter(Boolean).length;

  // ── Reset all filters ────────────────────────────────────────────────────────
  const resetFilters = () => { setSearch(''); setPayFilter('all'); setStatusFilter('all'); };

  return (
    <div className="th-root">

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="th-toolbar">
        <div className="th-toolbar__left">
          <h2 className="th-title">My Transactions</h2>
          {!loading && !error && (
            <span className="th-count">
              {processed.length} order{processed.length !== 1 ? 's' : ''}
              {processed.length !== orders.length && ` of ${orders.length}`}
              {' · '}{fmt(filteredTotal)}
            </span>
          )}
        </div>

        {/* Range toggle */}
        <div className="th-toolbar__filters" role="group" aria-label="Filter by period">
          {['today', 'week'].map((f) => (
            <button
              key={f}
              className={`th-filter-btn${range === f ? ' th-filter-btn--active' : ''}`}
              onClick={() => setRange(f)}
              aria-pressed={range === f}
            >
              {f === 'today' ? 'Today' : 'This Week'}
            </button>
          ))}
        </div>

        <button className="th-refresh-btn" onClick={fetchOrders} aria-label="Refresh transactions" title="Refresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
        </button>
      </div>

      {/* ── Search + filters bar ────────────────────────────────────────────── */}
      <div className="th-filters">
        {/* Search */}
        <div className="th-search-wrap">
          <svg className="th-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="th-search"
            type="search"
            placeholder="Search order # or item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search transactions"
          />
          {search && (
            <button className="th-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Payment method filter */}
        <select
          className="th-select"
          value={payFilter}
          onChange={(e) => setPayFilter(e.target.value)}
          aria-label="Filter by payment method"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{m === 'all' ? 'All Payments' : m === 'gcash' ? 'GCash' : 'Cash'}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          className="th-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All Statuses' : STATUS_LABEL[s]}</option>
          ))}
        </select>

        {/* Reset filters */}
        {activeFilters > 0 && (
          <button className="th-reset-btn" onClick={resetFilters}>
            Clear
            <span className="th-reset-badge">{activeFilters}</span>
          </button>
        )}

        {/* Rows per page */}
        <div className="th-pagesize-wrap">
          <label className="th-pagesize-label" htmlFor="th-pagesize">Rows</label>
          <select
            id="th-pagesize"
            className="th-select th-select--sm"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="th-content">
        {loading ? (
          <TransactionSkeleton />
        ) : error ? (
          <div className="th-state th-state--error">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>{error}</p>
            <button className="th-retry" onClick={fetchOrders}>Try again</button>
          </div>
        ) : processed.length === 0 ? (
          <div className="th-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>
              {activeFilters > 0
                ? 'No transactions match your filters.'
                : `No transactions ${range === 'today' ? 'today' : 'this week'} yet.`}
            </p>
            {activeFilters > 0 && (
              <button className="th-retry" onClick={resetFilters}>Clear filters</button>
            )}
          </div>
        ) : (
          <div className="th-table-wrap">
            <table className="th-table" aria-label="Transaction history">
              <thead>
                <tr>
                  <th scope="col">{thBtn('order_number', 'Order #')}</th>
                  <th scope="col">Items</th>
                  <th scope="col">{thBtn('payment_method', 'Payment')}</th>
                  <th scope="col">{thBtn('total_amount', 'Total')}</th>
                  <th scope="col">{thBtn('status', 'Status')}</th>
                  <th scope="col">{thBtn('created_at', 'Time')}</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((order) => (
                  <>
                    <tr
                      key={order.id}
                      className={`th-row${expanded === order.id ? ' th-row--expanded' : ''}`}
                      onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                      aria-expanded={expanded === order.id}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpanded(expanded === order.id ? null : order.id);
                        }
                      }}
                    >
                      <td className="th-cell--order">
                        <span className="th-order-num">#{order.order_number || order.id}</span>
                      </td>
                      <td className="th-cell--items">
                        {(order.items || []).slice(0, 2).map((i) => i.name || i.menu_item?.name).filter(Boolean).join(', ')}
                        {(order.items || []).length > 2 && <span className="th-more"> +{order.items.length - 2}</span>}
                        {(!order.items || order.items.length === 0) && <span className="th-muted">—</span>}
                      </td>
                      <td className="th-cell--pay">
                        <span className={`th-pay-badge th-pay-badge--${order.payment_method || 'cash'}`}>
                          {order.payment_method === 'gcash' ? 'GCash' : 'Cash'}
                        </span>
                      </td>
                      <td className="th-cell--total">{fmt(order.total_amount || 0)}</td>
                      <td>
                        <span className={`th-status ${STATUS_CLASS[order.status] || ''}`}>
                          {STATUS_LABEL[order.status] || order.status}
                        </span>
                      </td>
                      <td className="th-cell--time">{fmtDt(order.created_at)}</td>
                    </tr>

                    {expanded === order.id && (
                      <tr key={`${order.id}-exp`} className="th-expanded-row">
                        <td colSpan={6}>
                          <div className="th-expanded">
                            {(order.items || []).map((item, idx) => (
                              <div key={idx} className="th-expanded__line">
                                <span>{item.name || item.menu_item?.name} ×{item.quantity}</span>
                                <span>{fmt((item.unit_price || item.price || 0) * item.quantity)}</span>
                              </div>
                            ))}
                            {order.notes && <p className="th-expanded__note">Note: {order.notes}</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination bar ──────────────────────────────────────────────────── */}
      {!loading && !error && processed.length > 0 && (
        <div className="th-pagination" role="navigation" aria-label="Pagination">
          <span className="th-pagination__info">
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, processed.length)} of {processed.length}
          </span>

          <div className="th-pagination__controls">
            {/* First */}
            <button
              className="th-pg-btn"
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              aria-label="First page"
              title="First page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
              </svg>
            </button>

            {/* Prev */}
            <button
              className="th-pg-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              aria-label="Previous page"
              title="Previous page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            {/* Page numbers */}
            <PageNumbers current={safePage} total={totalPages} onSelect={setPage} />

            {/* Next */}
            <button
              className="th-pg-btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              aria-label="Next page"
              title="Next page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            {/* Last */}
            <button
              className="th-pg-btn"
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              aria-label="Last page"
              title="Last page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page number buttons with ellipsis ───────────────────────────────────────
function PageNumbers({ current, total, onSelect }) {
  if (total <= 1) return null;

  // Build page array: always show first, last, current ±1, with ellipsis gaps
  const pages = [];
  const addPage = (n) => { if (!pages.includes(n) && n >= 1 && n <= total) pages.push(n); };

  addPage(1);
  addPage(current - 1);
  addPage(current);
  addPage(current + 1);
  addPage(total);

  pages.sort((a, b) => a - b);

  const result = [];
  for (let i = 0; i < pages.length; i++) {
    if (i > 0 && pages[i] - pages[i - 1] > 1) {
      result.push(<span key={`e${i}`} className="th-pg-ellipsis">…</span>);
    }
    const n = pages[i];
    result.push(
      <button
        key={n}
        className={`th-pg-btn th-pg-btn--num${current === n ? ' th-pg-btn--active' : ''}`}
        onClick={() => onSelect(n)}
        aria-current={current === n ? 'page' : undefined}
        aria-label={`Page ${n}`}
      >
        {n}
      </button>
    );
  }

  return <>{result}</>;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function TransactionSkeleton() {
  return (
    <div className="th-table-wrap" aria-busy="true" aria-label="Loading transactions">
      <table className="th-table">
        <thead>
          <tr>
            <th>Order #</th><th>Items</th><th>Payment</th><th>Total</th><th>Status</th><th>Time</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="th-row">
              {Array.from({ length: 6 }).map((__, j) => (
                <td key={j}><div className="th-skel" /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}