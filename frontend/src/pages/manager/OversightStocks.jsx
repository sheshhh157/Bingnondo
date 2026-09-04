import { useState, useMemo } from 'react';
import { inventoryAPI } from '../../services/api';
import useLiveData from '../../hooks/useLiveData';
import { stockStatus, stockBadgeVariant } from '../../utils/format';
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

export default function OversightStocks() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const { data: items, loading } = useLiveData({
    fetchFn: async () => {
      const { data } = await inventoryAPI.getAll();
      return data.items || data;
    },
    events: [{
      name: 'inventory:update',
      merge: (prev, p) => {
        if (!p) return prev;
        const idx = prev.findIndex((i) => i.id === p.itemId);
        if (idx < 0) return prev;
        const next = prev.slice();
        next[idx] = { ...next[idx], current_stock: p.currentStock, reorder_level: p.reorderLevel };
        return next;
      },
    }],
  });

  const stats = useMemo(() => {
    const out = items.filter((i) => i.current_stock <= 0).length;
    const low = items.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level).length;
    return { total: items.length, out, low, ok: items.length - out - low };
  }, [items]);

  const filtered = useMemo(() => {
    let r = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((i) => i.name.toLowerCase().includes(q) || i.unit.toLowerCase().includes(q));
    }
    if (filterStatus === 'out') r = r.filter((i) => i.current_stock <= 0);
    else if (filterStatus === 'low') r = r.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level);
    else if (filterStatus === 'ok') r = r.filter((i) => i.current_stock > i.reorder_level);
    return [...r].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'stock_asc') return a.current_stock - b.current_stock;
      if (sortBy === 'stock_desc') return b.current_stock - a.current_stock;
      return 0;
    });
  }, [items, search, filterStatus, sortBy]);

  return (
    <div className="osk-root">
      <PageHeader
        title="Stocks — Live"
        sub="Current inventory levels and reorder thresholds (read-only, live updates)"
      />

      <div className="osk-stats">
        <StatCard label="Total Items" value={stats.total} />
        <StatCard label="In Stock" value={stats.ok} />
        <StatCard label="Low Stock" value={stats.low} />
        <StatCard label="Out of Stock" value={stats.out} />
      </div>

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
      </div>

      <div className="osk-table-wrap">
        <table className="osk-table" aria-label="Inventory levels">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Unit</th>
              <th>Stock level</th>
              <th>Reorder at</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 5 }).map((__, j) => <td key={j}><div className="osk-skel" /></td>)}
                  </tr>
                ))
              : filtered.length === 0
                ? <tr><td colSpan={5}><EmptyState message="No items match your filter." icon="search" /></td></tr>
                : filtered.map((item) => (
                    <tr key={item.id}>
                      <td><span className="osk-name">{item.name}</span></td>
                      <td className="osk-muted">{item.unit}</td>
                      <td><Bar current={item.current_stock} reorder={item.reorder_level} /></td>
                      <td className="osk-muted">{item.reorder_level} {item.unit}</td>
                      <td>
                        <Badge variant={stockBadgeVariant(stockStatus(item.current_stock, item.reorder_level))}>
                          {stockStatus(item.current_stock, item.reorder_level) === 'out' ? 'Out of stock' : stockStatus(item.current_stock, item.reorder_level) === 'low' ? 'Low stock' : 'In stock'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
