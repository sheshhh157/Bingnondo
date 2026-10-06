import { useState, useMemo, useCallback, Fragment } from 'react';
import { inventoryAPI } from '../../services/managerApi';
import useLiveData from '../../hooks/useLiveData';
import { stockStatus, stockBadgeVariant, stockStatusText } from '../../utils/format';
import { toCsv, downloadCsv } from '../../utils/csv';
import { listEvent, stockPatch, stockCounts } from './managerData';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import StatCard from '../../components/StatCard';
import PageHeader from '../../components/PageHeader';
import ErrorBanner from '../../components/ErrorBanner';
import '../../styles/OversightStocks.css';

function Bar({ current, reorder }) {
  const cap = Math.max(current * 1.5, reorder * 3, 10);
  const pct = Math.min(100, (current / cap) * 100);
  const s = stockStatus(current, reorder);
  return (
    <div className="osk-bar">
      <div className="osk-bar__track">
        <div className={`osk-bar__fill osk-bar__fill--${s}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="osk-bar__value">{current}</span>
    </div>
  );
}

const TX_LABEL = { restock: 'Restock', deduction: 'Deduction', adjustment: 'Adjustment' };

const STATUS_TEXT = { ok: 'In stock', low: 'Low stock', out: 'Out of stock' };

const STOCK_CSV_HEADERS = ['Ingredient', 'Unit', 'Current stock', 'Reorder level', 'Status'];

function buildStockCsv(rows) {
  return toCsv(STOCK_CSV_HEADERS, rows, (i) => {
    const s = stockStatus(i.current_stock, i.reorder_level);
    return [i.name, i.unit, i.current_stock, i.reorder_level, STATUS_TEXT[s] || s];
  });
}

/**
 * Lazy-loaded movement history for one ingredient. Mounted only while its row
 * is expanded, so the fetch (and any future polls) only happen on demand.
 */
function MovementHistory({ itemId }) {
  const { data: rows = [], loading, error, refresh } = useLiveData({
    fetchFn: async () => (await inventoryAPI.getTransactions(itemId)).data,
  });

  if (loading) {
    return (
      <div className="osk-history">
        <span className="osk-history__muted">Loading movements…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="osk-history">
        <span className="osk-history__muted">Couldn't load movement history.</span>
        <button type="button" className="ui-error__retry" onClick={() => refresh()}>Retry</button>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="osk-history">
        <span className="osk-history__muted">No movements recorded.</span>
      </div>
    );
  }
  return (
    <div className="osk-history">
      {rows.map((t) => {
        const qty = Number(t.quantity);
        const sign = t.change_type === 'deduction' ? '−' : t.change_type === 'restock' ? '+' : '=';
        return (
          <div key={t.id} className="osk-history__item">
            <span className={`osk-history__type osk-history__type--${t.change_type}`}>
              {TX_LABEL[t.change_type] || t.change_type}
            </span>
            <span className="osk-history__qty">{sign}{qty}</span>
            <span className="osk-history__who">{t.performed_by_name || '—'}</span>
            <time className="osk-history__when" dateTime={t.created_at}>
              {new Date(t.created_at).toLocaleString('en-PH')}
            </time>
          </div>
        );
      })}
    </div>
  );
}

export default function OversightStocks() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [openId, setOpenId] = useState(null);

  const { data: items, loading, error, refresh } = useLiveData({
    fetchFn: async () => {
      const { data } = await inventoryAPI.getAll();
      return data.items || data;
    },
    events: [listEvent('inventory:update', stockPatch)],
    pollMs: 15000,
  });

  const stats = useMemo(() => stockCounts(items), [items]);

  const filtered = useMemo(() => {
    let r = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((i) => i.name.toLowerCase().includes(q) || i.unit.toLowerCase().includes(q));
    }
    if (filterStatus !== 'all') {
      r = r.filter((i) => stockStatus(i.current_stock, i.reorder_level) === filterStatus);
    }
    return [...r].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'stock_asc') return a.current_stock - b.current_stock;
      if (sortBy === 'stock_desc') return b.current_stock - a.current_stock;
      return 0;
    });
  }, [items, search, filterStatus, sortBy]);

  const handleExport = useCallback(() => {
    downloadCsv(
      buildStockCsv(filtered),
      `inventory-status-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }, [filtered]);

  return (
    <div className="osk-root">
      <PageHeader
        title="Stocks — Live"
        sub="Current inventory levels and reorder thresholds (read-only, auto-refreshes every 15s)"
      />

      {error && (
        <ErrorBanner>
          Couldn't load this view.
          <button type="button" className="ui-error__retry" onClick={() => refresh()}>Retry</button>
        </ErrorBanner>
      )}

      {loading ? (
        <div className="osk-stats" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ui-skel ui-skel--card">
              <span className="ui-skel ui-skel--label" />
              <span className="ui-skel ui-skel--value" />
            </div>
          ))}
        </div>
      ) : (
        <div className="osk-stats">
          <StatCard label="Total Items" value={stats.total} />
          <StatCard label="In Stock" value={stats.ok} />
          <StatCard label="Low Stock" value={stats.low} />
          <StatCard label="Out of Stock" value={stats.out} />
        </div>
      )}

      {!loading && (stats.low + stats.out) > 0 && (
        <ErrorBanner>
          <strong>{stats.out} out of stock</strong> and <strong>{stats.low} low-stock</strong> items need attention.
        </ErrorBanner>
      )}

      <div className="osk-filters">
        <div className="osk-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients…" className="osk-search__input" aria-label="Search ingredients" />
        </div>
        <button type="button" className="ui-btn osk-filter-btn" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filter
          {(filterStatus !== 'all' || sortBy !== 'name') && <span className="osk-filter-dot" aria-label="Filters active" />}
        </button>
        <select className="osk-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All items</option>
          <option value="ok">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select className="osk-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort by">
          <option value="name">Sort: Name</option>
          <option value="stock_asc">Stock: Low first</option>
          <option value="stock_desc">Stock: High first</option>
        </select>
        <button
          type="button"
          className="osk-export"
          onClick={() => setExportOpen(true)}
          disabled={filtered.length === 0}
          title="Export the current filtered list to CSV"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>

      {filtersOpen && (
        <div className="sales-modal-overlay" onClick={() => setFiltersOpen(false)}>
          <div className="sales-modal" role="dialog" aria-modal="true" aria-labelledby="osk-filter-title" onClick={(e) => e.stopPropagation()}>
            <h2 className="sales-modal__head" id="osk-filter-title">Filter stocks</h2>
            <div className="sales-modal__body">
              <label className="sales-modal__label" htmlFor="osk-filter-status">Status
                <select id="osk-filter-status" className="osk-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status">
                  <option value="all">All items</option>
                  <option value="ok">In stock</option>
                  <option value="low">Low stock</option>
                  <option value="out">Out of stock</option>
                </select>
              </label>
              <label className="sales-modal__label" htmlFor="osk-filter-sort">Sort by
                <select id="osk-filter-sort" className="osk-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort by">
                  <option value="name">Sort: Name</option>
                  <option value="stock_asc">Stock: Low first</option>
                  <option value="stock_desc">Stock: High first</option>
                </select>
              </label>
            </div>
            <div className="sales-modal__foot">
              <button className="ui-btn" onClick={() => { setFilterStatus('all'); setSortBy('name'); }}>Reset</button>
              <button className="ui-btn ui-btn--primary" onClick={() => setFiltersOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div className="sales-modal-overlay" onClick={() => setExportOpen(false)}>
          <div className="sales-modal" role="dialog" aria-modal="true" aria-labelledby="osk-export-title" onClick={(e) => e.stopPropagation()}>
            <h2 className="sales-modal__head" id="osk-export-title">Export stock levels</h2>
            <div className="sales-modal__body">
              <p>This downloads a CSV of the stock list exactly as it is filtered and sorted right now — one row per ingredient.</p>
              <ul>
                <li>Columns: Ingredient, Unit, Current stock, Reorder level, Status.</li>
                <li>It includes this page's {filtered.length} visible rows only, respecting your search, status filter, and sort.</li>
                <li>The file downloads as <code>inventory-status-YYYY-MM-DD.csv</code>.</li>
              </ul>
            </div>
            <div className="sales-modal__foot">
              <button className="ui-btn" onClick={() => setExportOpen(false)}>Cancel</button>
              <button className="ui-btn ui-btn--primary" onClick={() => { setExportOpen(false); handleExport(); }}>Export CSV</button>
            </div>
          </div>
        </div>
      )}

      <div className="osk-table-wrap">
        <table className="osk-table" aria-label="Inventory levels">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Unit</th>
              <th>Stock level</th>
              <th>Reorder at</th>
              <th>Status</th>
              <th><span className="osk-muted">History</span></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 6 }).map((__, j) => <td key={j}><div className="osk-skel" /></td>)}
                  </tr>
                ))
              : filtered.length === 0
                ? <tr><td colSpan={6}><EmptyState message="No items match your filter." icon="search" /></td></tr>
                : filtered.map((item) => {
                    const status = stockStatus(item.current_stock, item.reorder_level);
                    const open = openId === item.id;
                    return (
                    <Fragment key={item.id}>
                    <tr>
                      <td><span className="osk-name">{item.name}</span></td>
                      <td className="osk-muted">{item.unit}</td>
                      <td><Bar current={item.current_stock} reorder={item.reorder_level} /></td>
                      <td className="osk-muted osk-nowrap">{item.reorder_level} {item.unit}</td>
                      <td>
                        <Badge variant={stockBadgeVariant(status)}>
                          {stockStatusText(status)}
                        </Badge>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`osk-expand${open ? ' osk-expand--open' : ''}`}
                          onClick={() => setOpenId(open ? null : item.id)}
                          aria-expanded={open}
                          aria-label={`View movement history for ${item.name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 9l6 6 6-6"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="osk-history-row">
                        <td colSpan={6}>
                          <MovementHistory itemId={item.id} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
