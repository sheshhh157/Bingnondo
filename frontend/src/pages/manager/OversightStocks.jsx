import { useState, useEffect, useMemo, useCallback } from 'react';
import { inventoryAPI } from '../../services/api';
import '../../styles/OversightStocks.css';

function stockStatus(current, reorder) {
  if (current <= 0) return 'out';
  if (current <= reorder) return 'low';
  return 'ok';
}

function Badge({ current, reorder }) {
  const s = stockStatus(current, reorder);
  return <span className={`osk-badge osk-badge--${s}`}>{s === 'out' ? 'Out of stock' : s === 'low' ? 'Low stock' : 'In stock'}</span>;
}

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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const load = useCallback(async () => {
    try {
      const { data } = await inventoryAPI.getAll();
      setItems(data.items || data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
      <div className="osk-header">
        <div>
          <h1 className="osk-title">Stocks — Read-Only</h1>
          <p className="osk-sub">Current inventory levels and reorder thresholds (viewing only)</p>
        </div>
      </div>

      <div className="osk-stats">
        <div className="osk-stat"><span className="osk-stat__label">Total Items</span><span className="osk-stat__value">{stats.total}</span></div>
        <div className="osk-stat"><span className="osk-stat__label">In Stock</span><span className="osk-stat__value osk-stat__value--ok">{stats.ok}</span></div>
        <div className="osk-stat"><span className="osk-stat__label">Low Stock</span><span className="osk-stat__value osk-stat__value--low">{stats.low}</span></div>
        <div className="osk-stat"><span className="osk-stat__label">Out of Stock</span><span className="osk-stat__value osk-stat__value--out">{stats.out}</span></div>
      </div>

      {!loading && (stats.low + stats.out) > 0 && (
        <div className="osk-alert" role="alert">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span><strong>{stats.out} out of stock</strong> and <strong>{stats.low} low-stock</strong> items need attention.</span>
        </div>
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
                ? <tr><td colSpan={5}><div className="osk-empty">No items match your filter.</div></td></tr>
                : filtered.map((item) => (
                    <tr key={item.id}>
                      <td><span className="osk-name">{item.name}</span></td>
                      <td className="osk-muted">{item.unit}</td>
                      <td><Bar current={item.current_stock} reorder={item.reorder_level} /></td>
                      <td className="osk-muted">{item.reorder_level} {item.unit}</td>
                      <td><Badge current={item.current_stock} reorder={item.reorder_level} /></td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
