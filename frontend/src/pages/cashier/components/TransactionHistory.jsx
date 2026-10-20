import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { ordersAPI } from '../../../services/cashierApi';
import { currency, itemLabel } from '../../../utils/format';
import Pagination from '../../../components/Pagination';
import '../../../styles/TransactionHistory.css';

const STATUS_LABEL = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_CLASS = {
  pending: 'th-status--pending',
  confirmed: 'th-status--confirmed',
  preparing: 'th-status--preparing',
  ready: 'th-status--ready',
  completed: 'th-status--completed',
  cancelled: 'th-status--cancelled',
};

const PAYMENT_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'cash', label: 'Cash' },
  { key: 'gcash', label: 'GCash' },
];

const PERIOD_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
];

const STATUSES = ['all', 'pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest', col: 'created_at', dir: 'desc' },
  { key: 'oldest', label: 'Oldest', col: 'created_at', dir: 'asc' },
  { key: 'highest', label: 'Highest total', col: 'total_amount', dir: 'desc' },
  { key: 'lowest', label: 'Lowest total', col: 'total_amount', dir: 'asc' },
];

const DEFAULT_FILTERS = {
  range: 'today',
  payFilter: 'all',
  statusFilter: 'all',
  sortCol: 'created_at',
  sortDir: 'desc',
  pageSize: 10,
};

const fmtDt = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
};

const sortKeyOf = (col, dir) => {
  const match = SORT_OPTIONS.find((o) => o.col === col && o.dir === dir);
  return match ? match.key : null;
};

const itemsSummary = (order) => {
  const items = order.items || [];
  if (items.length === 0) return '—';
  const text = items
    .map((i) => `${i.quantity}× ${itemLabel(i)}`)
    .filter(Boolean)
    .join(', ');
  return text || '—';
};

function SortIcon({ col, sortCol, sortDir }) {
  const active = sortCol === col;
  return (
    <span className="th-sort-icon" aria-hidden="true">
      <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
        <polyline
          points="2,6 5,2 8,6"
          stroke={active && sortDir === 'asc' ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        />
        <polyline
          points="2,8 5,12 8,8"
          stroke={active && sortDir === 'desc' ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function OrderDetail({ order }) {
  return (
    <>
      {(order.items || []).map((item, idx) => (
        <div key={idx} className="th-expanded__line">
          <span>{itemLabel(item)} ×{item.quantity}</span>
          <span>{currency((item.unit_price || item.price || 0) * item.quantity)}</span>
        </div>
      ))}
      {order.notes && <p className="th-expanded__note">Note: {order.notes}</p>}
    </>
  );
}

function FilterModal({ initial, orders, committedRange, onApply, onClose, returnFocusRef }) {
  const [draft, setDraft] = useState(initial);
  const sheetRef = useRef(null);

  useEffect(() => {
    const el = sheetRef.current;
    const opener = document.activeElement;
    const returnTarget = returnFocusRef?.current || opener;
    if (el) el.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusables = () => el
      ? Array.from(el.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        ))
      : [];

    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      if (returnTarget && returnTarget.focus) returnTarget.focus();
    };
  }, [onClose, returnFocusRef]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const clearAll = () => setDraft({ ...DEFAULT_FILTERS });

  const activeSortKey = sortKeyOf(draft.sortCol, draft.sortDir);
  const resultCount = draft.range === committedRange
    ? orders.filter((o) => (
        (draft.payFilter === 'all' || (o.payment_method || 'cash') === draft.payFilter)
        && (draft.statusFilter === 'all' || o.status === draft.statusFilter)
      )).length
    : null;

  return createPortal(
    <div
      className="th-fm-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="th-fm-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="th-fm-title"
        ref={sheetRef}
        tabIndex={-1}
      >
        <div className="th-fm-handle" aria-hidden="true" />

        <div className="th-fm-head">
          <h2 id="th-fm-title" className="th-fm-title">Filters</h2>
          <button type="button" className="th-fm-close" onClick={onClose} aria-label="Close filters">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="th-fm-body">
          <div className="th-fm-group">
            <span className="th-fm-label">Period</span>
            <div className="th-fm-seg">
              {PERIOD_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={`th-fm-chip${draft.range === o.key ? ' th-fm-chip--active' : ''}`}
                  aria-pressed={draft.range === o.key}
                  onClick={() => set({ range: o.key })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="th-fm-group">
            <span className="th-fm-label">Payment</span>
            <div className="th-fm-seg">
              {PAYMENT_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={`th-fm-chip${draft.payFilter === o.key ? ' th-fm-chip--active' : ''}`}
                  aria-pressed={draft.payFilter === o.key}
                  onClick={() => set({ payFilter: o.key })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="th-fm-group">
            <span className="th-fm-label">Status</span>
            <div className="th-fm-seg">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`th-fm-chip${draft.statusFilter === s ? ' th-fm-chip--active' : ''}`}
                  aria-pressed={draft.statusFilter === s}
                  onClick={() => set({ statusFilter: s })}
                >
                  {s === 'all' ? 'All' : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="th-fm-group">
            <span className="th-fm-label">Sort by</span>
            <div className="th-fm-seg">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={`th-fm-chip${activeSortKey === o.key ? ' th-fm-chip--active' : ''}`}
                  aria-pressed={activeSortKey === o.key}
                  onClick={() => set({ sortCol: o.col, sortDir: o.dir })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="th-fm-group">
            <span className="th-fm-label">Rows per page</span>
            <div className="th-fm-seg">
              {PAGE_SIZE_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`th-fm-chip${draft.pageSize === n ? ' th-fm-chip--active' : ''}`}
                  aria-pressed={draft.pageSize === n}
                  onClick={() => set({ pageSize: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="th-fm-foot">
          <button type="button" className="th-fm-clear" onClick={clearAll}>Clear all</button>
          <div className="th-fm-foot__right">
            {resultCount !== null && (
              <span className="th-fm-count">{resultCount} result{resultCount === 1 ? '' : 's'}</span>
            )}
            <button type="button" className="th-fm-apply" onClick={() => onApply(draft)}>Apply</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TransactionSkeleton() {
  return (
    <div className="th-skel-wrap" aria-busy="true" aria-label="Loading transactions">
      <div className="th-table-wrap">
        <table className="th-table">
          <thead>
            <tr>
              <th>Order #</th><th className="th-col--items">Items</th><th>Payment</th><th>Total</th><th>Status</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="th-row">
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} className={j === 1 ? 'th-col--items' : undefined}><div className="th-skel" /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="th-list">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="th-skel-card">
            <div className="th-skel-card__row">
              <div className="th-skel th-skel--sm" />
              <div className="th-skel th-skel--xs" />
            </div>
            <div className="th-skel-card__row">
              <div className="th-skel th-skel--lg" />
              <div className="th-skel th-skel--sm" />
            </div>
            <div className="th-skel-card__row">
              <div className="th-skel th-skel--pill" />
              <div className="th-skel th-skel--pill" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TransactionHistory() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [range, setRange] = useState('today');
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortCol, setSortCol] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterBtnRef = useRef(null);

  const fetchOrders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const { data } = await ordersAPI.getMyTransactions({ range });
      setOrders(Array.isArray(data) ? data : data.orders || []);
      if (silent) setError('');
    } catch {
      if (!silent) setError('Failed to load transactions.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [range]);

  // Fetch on range change. The synchronous setLoading inside fetchOrders is
  // intentional — there is no user event to move it to.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchOrders({ silent: true });
    };
    const onFocus = () => fetchOrders({ silent: true });

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOrders({ silent: true });
    }, 60000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [fetchOrders]);

  // Reset to the first page whenever any filter, sort or page-size changes.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setPage(1);
  }, [range, search, payFilter, statusFilter, sortCol, sortDir, pageSize]);

  const processed = useMemo(() => {
    let list = [...orders];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) => {
        const num = String(o.order_number || o.id).toLowerCase();
        const items = (o.items || [])
          .map((i) => itemLabel(i).toLowerCase())
          .join(' ');
        return num.includes(q) || items.includes(q);
      });
    }

    if (payFilter !== 'all') {
      list = list.filter((o) => (o.payment_method || 'cash') === payFilter);
    }

    if (statusFilter !== 'all') {
      list = list.filter((o) => o.status === statusFilter);
    }

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
        default:
          av = new Date(a.created_at).getTime();
          bv = new Date(b.created_at).getTime();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [orders, search, payFilter, statusFilter, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = processed.slice((safePage - 1) * pageSize, safePage * pageSize);

  const filteredTotal = processed.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  const badgeCount =
    (range !== 'today' ? 1 : 0) +
    (payFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (sortCol !== 'created_at' || sortDir !== 'desc' ? 1 : 0) +
    (pageSize !== 10 ? 1 : 0);

  const anyFilterActive = Boolean(search.trim()) || badgeCount > 0;

  const chips = [];
  if (range !== 'today') chips.push({ key: 'range', label: 'This Week', clear: () => setRange('today') });
  if (payFilter !== 'all') {
    chips.push({ key: 'pay', label: payFilter === 'gcash' ? 'GCash' : 'Cash', clear: () => setPayFilter('all') });
  }
  if (statusFilter !== 'all') {
    chips.push({ key: 'status', label: STATUS_LABEL[statusFilter] || statusFilter, clear: () => setStatusFilter('all') });
  }
  if (sortCol !== 'created_at' || sortDir !== 'desc') {
    const key = sortKeyOf(sortCol, sortDir);
    const option = key ? SORT_OPTIONS.find((o) => o.key === key) : null;
    chips.push({
      key: 'sort',
      label: option ? option.label : 'Sorted',
      clear: () => { setSortCol('created_at'); setSortDir('desc'); },
    });
  }
  if (pageSize !== 10) {
    chips.push({ key: 'size', label: `${pageSize} rows`, clear: () => setPageSize(10) });
  }

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

  const applyFilters = (draft) => {
    setRange(draft.range);
    setPayFilter(draft.payFilter);
    setStatusFilter(draft.statusFilter);
    setSortCol(draft.sortCol);
    setSortDir(draft.sortDir);
    setPageSize(draft.pageSize);
    setPage(1);
    setFiltersOpen(false);
  };

  const clearAllFilters = () => {
    setSearch('');
    setPayFilter('all');
    setStatusFilter('all');
    setSortCol('created_at');
    setSortDir('desc');
    setPageSize(10);
    setRange('today');
    setPage(1);
  };

  const countLabel = (
    <>
      {processed.length} order{processed.length !== 1 ? 's' : ''}
      {processed.length !== orders.length && ` of ${orders.length}`}
      {' · '}{currency(filteredTotal)}
    </>
  );

  // Keep the previous rows on screen while a new range loads (stale-while-
  // revalidate) so switching ranges doesn't blank the table and jump.
  const firstLoad = loading && orders.length === 0;
  const busy = loading && orders.length > 0;

  return (
    <div className="th-root">
      <div className="th-head">
        <h2 className="th-title">My Transactions</h2>
        {!firstLoad && !error && <span className="th-count">{countLabel}</span>}
      </div>

      <div className="th-controls">
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
            <button type="button" className="th-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        <button
          type="button"
          className={`th-filter-open${badgeCount > 0 ? ' th-filter-open--active' : ''}`}
          ref={filterBtnRef}
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
          aria-label="Filters"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
          </svg>
          {badgeCount > 0 && <span className="th-filter-badge">{badgeCount}</span>}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="th-chips">
          {chips.map((c) => (
            <button key={c.key} type="button" className="th-chip" onClick={c.clear}>
              <span className="th-chip__label">{c.label}</span>
              <span className="th-chip__x" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className={`th-content${busy ? ' th-content--busy' : ''}`} aria-busy={busy}>
        {firstLoad ? (
          <TransactionSkeleton />
        ) : error ? (
          <div className="th-state th-state--error">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>{error}</p>
            <button type="button" className="th-retry" onClick={() => fetchOrders()}>Try again</button>
          </div>
        ) : processed.length === 0 ? (
          <div className="th-state">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>No transactions found</p>
            {anyFilterActive && (
              <button type="button" className="th-retry" onClick={clearAllFilters}>Clear filters</button>
            )}
          </div>
        ) : (
          <>
            <div className="th-table-wrap">
              <table className="th-table" aria-label="Transaction history">
                <thead>
                  <tr>
                    <th scope="col">{thBtn('order_number', 'Order #')}</th>
                    <th scope="col" className="th-col--items">Items</th>
                    <th scope="col">{thBtn('payment_method', 'Payment')}</th>
                    <th scope="col">{thBtn('total_amount', 'Total')}</th>
                    <th scope="col">{thBtn('status', 'Status')}</th>
                    <th scope="col">{thBtn('created_at', 'Time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((order) => {
                    const isOpen = expanded === order.id;
                    return (
                      <Fragment key={order.id}>
                        <tr
                          className={`th-row${isOpen ? ' th-row--expanded' : ''}`}
                          onClick={() => setExpanded(isOpen ? null : order.id)}
                          aria-expanded={isOpen}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpanded(isOpen ? null : order.id);
                            }
                          }}
                        >
                          <td className="th-cell--order">
                            <span className="th-order-num">#{order.order_number || order.id}</span>
                          </td>
                          <td className="th-cell--items">
                            {(order.items || []).slice(0, 2).map((i) => itemLabel(i)).filter(Boolean).join(', ')}
                            {(order.items || []).length > 2 && <span className="th-more"> +{order.items.length - 2}</span>}
                            {(!order.items || order.items.length === 0) && <span className="th-muted">—</span>}
                          </td>
                          <td className="th-cell--pay">
                            <span className={`th-pay-badge th-pay-badge--${order.payment_method || 'cash'}`}>
                              {order.payment_method === 'gcash' ? 'GCash' : 'Cash'}
                            </span>
                          </td>
                          <td className="th-cell--total">{currency(order.total_amount || 0)}</td>
                          <td>
                            <span className={`th-status ${STATUS_CLASS[order.status] || ''}`}>
                              {STATUS_LABEL[order.status] || order.status}
                            </span>
                          </td>
                          <td className="th-cell--time">{fmtDt(order.created_at)}</td>
                        </tr>

                        {isOpen && (
                          <tr className="th-expanded-row">
                            <td colSpan={6}>
                              <div className="th-expanded">
                                <OrderDetail order={order} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="th-list">
              {paginated.map((order) => {
                const isOpen = expanded === order.id;
                return (
                  <div key={order.id} className="th-card-item">
                    <button
                      type="button"
                      className={`th-card${isOpen ? ' th-card--open' : ''}`}
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : order.id)}
                    >
                      <span className="th-card__row">
                        <span className="th-card__order">#{order.order_number || order.id}</span>
                        <span className="th-card__time">{fmtDt(order.created_at)}</span>
                      </span>
                      <span className="th-card__row th-card__row--mid">
                        <span className="th-card__items">{itemsSummary(order)}</span>
                        <span className="th-card__total">{currency(order.total_amount || 0)}</span>
                      </span>
                      <span className="th-card__row th-card__row--bottom">
                        <span className={`th-pay-badge th-pay-badge--${order.payment_method || 'cash'}`}>
                          {order.payment_method === 'gcash' ? 'GCash' : 'Cash'}
                        </span>
                        <span className={`th-status ${STATUS_CLASS[order.status] || ''}`}>
                          {STATUS_LABEL[order.status] || order.status}
                        </span>
                        <span className="th-card__chev" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="th-card-detail">
                        <OrderDetail order={order} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="th-pag-wrap">
                <Pagination
                  label="orders"
                  page={safePage}
                  totalPages={totalPages}
                  total={processed.length}
                  from={(safePage - 1) * pageSize + 1}
                  to={Math.min(safePage * pageSize, processed.length)}
                  onPage={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {filtersOpen && (
        <FilterModal
          initial={{ range, payFilter, statusFilter, sortCol, sortDir, pageSize }}
          orders={orders}
          committedRange={range}
          onApply={applyFilters}
          onClose={() => setFiltersOpen(false)}
          returnFocusRef={filterBtnRef}
        />
      )}
    </div>
  );
}
