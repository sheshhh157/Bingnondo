import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { inventoryAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import '../../styles/InventoryPage.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stockStatus(current, reorder) {
  if (current <= 0) return 'out';
  if (current <= reorder) return 'low';
  return 'ok';
}

function StockBadge({ current, reorder }) {
  const s = stockStatus(current, reorder);
  return (
    <span className={`inv-badge inv-badge--${s}`}>
      {s === 'out' ? 'Out of stock' : s === 'low' ? 'Low stock' : 'In stock'}
    </span>
  );
}

function StockBar({ current, reorder }) {
  const cap = Math.max(current * 1.5, reorder * 3, 10);
  const pct = Math.min(100, (current / cap) * 100);
  const s = stockStatus(current, reorder);
  return (
    <div className="inv-bar" role="presentation">
      <div className="inv-bar__track">
        <div className={`inv-bar__fill inv-bar__fill--${s}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="inv-bar__value">{current}</span>
    </div>
  );
}

// ─── Toast helper (no external lib — matches codebase pattern) ────────────────
function useToast() {
  const [msg, setMsg] = useState('');
  const [type, setType] = useState('success');
  const timerRef = useRef(null);

  const show = useCallback((message, t = 'success') => {
    clearTimeout(timerRef.current);
    setMsg(message);
    setType(t);
    timerRef.current = setTimeout(() => setMsg(''), 3000);
  }, []);

  return { msg, type, show };
}

// ─── Transaction Modal ─────────────────────────────────────────────────────────
function TransactionModal({ item, type, onClose, onSubmit }) {
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const isRestock = type === 'restock';

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0) { setError('Enter a valid quantity.'); return; }
    setLoading(true); setError('');
    try {
      await onSubmit(item.id, { change_type: type, quantity: qty, note });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Transaction failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="inv-modal-overlay" onClick={onClose} aria-hidden="true">
      <div
        className="inv-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inv-modal-title"
      >
        <div className="inv-modal__header">
          <h2 id="inv-modal-title" className="inv-modal__title">
            {isRestock ? 'Restock Ingredient' : 'Adjust Stock'}
          </h2>
          <button className="inv-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="inv-modal__body">
          <div className="inv-modal__item-card">
            <span className="inv-modal__item-name">{item.name}</span>
            <div className="inv-modal__item-meta">
              <span>Current: <strong>{item.current_stock} {item.unit}</strong></span>
              <StockBadge current={item.current_stock} reorder={item.reorder_level} />
            </div>
          </div>

          <form id="txn-form" onSubmit={handleSubmit} noValidate>
            <div className="inv-field">
              <label htmlFor="txn-qty" className="inv-field__label">
                {isRestock ? `Add quantity (${item.unit})` : `Set new stock (${item.unit})`}
              </label>
              <input
                id="txn-qty"
                ref={inputRef}
                type="number"
                min={isRestock ? 1 : 0}
                step="0.01"
                value={quantity}
                onChange={(e) => { setQuantity(e.target.value); setError(''); }}
                className="inv-field__input"
                placeholder={isRestock ? 'e.g. 50' : 'Corrected stock level'}
                required
              />
              {isRestock && quantity && (
                <p className="inv-field__hint">
                  New total: <strong>{item.current_stock + Number(quantity)} {item.unit}</strong>
                </p>
              )}
            </div>

            <div className="inv-field">
              <label htmlFor="txn-note" className="inv-field__label">
                Note <span className="inv-field__optional">(optional)</span>
              </label>
              <input
                id="txn-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="inv-field__input"
                placeholder={isRestock ? 'e.g. Delivery from supplier' : 'e.g. Manual recount'}
              />
            </div>

            {error && (
              <p className="inv-modal__error" role="alert">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </p>
            )}
          </form>
        </div>

        <div className="inv-modal__footer">
          <button className="inv-btn inv-btn--ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="inv-btn inv-btn--primary" form="txn-form" type="submit" disabled={loading} aria-busy={loading}>
            {loading ? <span className="inv-spinner" aria-label="Saving…" /> : isRestock ? 'Restock' : 'Adjust'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile card ──────────────────────────────────────────────────────────────
function InventoryCard({ item, onRestock, onAdjust }) {
  const s = stockStatus(item.current_stock, item.reorder_level);
  return (
    <article className={`inv-card${s !== 'ok' ? ` inv-card--${s}` : ''}`}>
      <div className="inv-card__top">
        <div>
          <p className="inv-card__name">{item.name}</p>
          <p className="inv-card__unit">Unit: {item.unit}</p>
        </div>
        <StockBadge current={item.current_stock} reorder={item.reorder_level} />
      </div>
      <div className="inv-card__stats">
        <div className="inv-card__stat">
          <span className="inv-card__stat-label">Current</span>
          <span className="inv-card__stat-value">{item.current_stock} <small>{item.unit}</small></span>
        </div>
        <div className="inv-card__stat">
          <span className="inv-card__stat-label">Reorder at</span>
          <span className="inv-card__stat-value">{item.reorder_level} <small>{item.unit}</small></span>
        </div>
      </div>
      <div className="inv-card__actions">
        <button className="inv-btn inv-btn--primary inv-btn--sm" onClick={() => onRestock(item)}>+ Restock</button>
        <button className="inv-btn inv-btn--secondary inv-btn--sm" onClick={() => onAdjust(item)}>Adjust</button>
      </div>
    </article>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [modal, setModal] = useState(null); // { item, type }
  const { msg: toastMsg, type: toastType, show: showToast } = useToast();

  const fetchItems = useCallback(async () => {
    try {
      setError('');
      const { data } = await inventoryAPI.getAll();
      setItems(data.items || data);
    } catch {
      setError('Failed to load inventory. Please try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Real-time socket sync
  useEffect(() => {
    const socket = getSocket();
    const handler = (updated) => {
      setItems((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
    };
    socket.on('inventory_update', handler);
    return () => socket.off('inventory_update', handler);
  }, []);

  const handleTransaction = async (id, payload) => {
    await inventoryAPI.transaction(id, payload);
    showToast(payload.change_type === 'restock' ? 'Restocked successfully.' : 'Stock adjusted.');
    await fetchItems();
  };

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

  if (error && !loading) return (
    <div className="inv-error">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <p>{error}</p>
      <button className="inv-btn inv-btn--primary" onClick={fetchItems}>Try again</button>
    </div>
  );

  return (
    <div className="inv-root">
      {/* Toast */}
      {toastMsg && (
        <div className={`inv-toast inv-toast--${toastType}`} role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="inv-page-header">
        <div>
          <h1 className="inv-page-title">Inventory</h1>
          <p className="inv-page-sub">Track ingredient stock and reorder thresholds</p>
        </div>
        <button className="inv-btn inv-btn--ghost inv-btn--icon" onClick={fetchItems} aria-label="Refresh">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="inv-stats">
        <div className="inv-stat-card">
          <span className="inv-stat-card__label">Total Items</span>
          <span className="inv-stat-card__value">{stats.total}</span>
        </div>
        <div className="inv-stat-card">
          <span className="inv-stat-card__label">In Stock</span>
          <span className="inv-stat-card__value inv-stat-card__value--ok">{stats.ok}</span>
        </div>
        <div className="inv-stat-card">
          <span className="inv-stat-card__label">Low Stock</span>
          <span className="inv-stat-card__value inv-stat-card__value--low">{stats.low}</span>
        </div>
        <div className="inv-stat-card">
          <span className="inv-stat-card__label">Out of Stock</span>
          <span className="inv-stat-card__value inv-stat-card__value--out">{stats.out}</span>
        </div>
      </div>

      {/* Alert banner */}
      {!loading && (stats.low + stats.out) > 0 && (
        <div className="inv-alert" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>
            <strong>{stats.out} out of stock</strong> and <strong>{stats.low} low-stock</strong> items need your attention.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="inv-filters">
        <div className="inv-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredients…"
            className="inv-search__input"
            aria-label="Search ingredients"
          />
        </div>
        <select className="inv-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All items</option>
          <option value="ok">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select className="inv-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort by">
          <option value="name">Sort: Name</option>
          <option value="stock_asc">Stock: Low first</option>
          <option value="stock_desc">Stock: High first</option>
        </select>
      </div>

      {/* Mobile cards */}
      <div className="inv-cards" aria-label="Inventory items">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="inv-skeleton-card" aria-hidden="true" />)
          : filtered.length === 0
            ? <div className="inv-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/>
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                </svg>
                <p>{search ? 'No items match your search.' : 'Inventory is empty.'}</p>
              </div>
            : filtered.map((item) => (
                <InventoryCard
                  key={item.id}
                  item={item}
                  onRestock={(i) => setModal({ item: i, type: 'restock' })}
                  onAdjust={(i) => setModal({ item: i, type: 'adjustment' })}
                />
              ))
        }
      </div>

      {/* Desktop table */}
      <div className="inv-table-wrap">
        <table className="inv-table" aria-label="Inventory table">
          <thead>
            <tr>
              <th className="inv-table__th">Ingredient</th>
              <th className="inv-table__th">Unit</th>
              <th className="inv-table__th">Stock level</th>
              <th className="inv-table__th">Reorder at</th>
              <th className="inv-table__th">Status</th>
              <th className="inv-table__th inv-table__th--right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="inv-table__td">
                        <div className="inv-skeleton-row" style={{ width: `${55 + Math.random() * 35}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.length === 0
                ? <tr><td colSpan={6}>
                    <div className="inv-empty">
                      <p>{search ? 'No items match your search.' : 'Inventory is empty.'}</p>
                    </div>
                  </td></tr>
                : filtered.map((item) => (
                    <tr key={item.id} className="inv-table__row">
                      <td className="inv-table__td">
                        <span className="inv-table__name">{item.name}</span>
                      </td>
                      <td className="inv-table__td inv-table__td--muted">{item.unit}</td>
                      <td className="inv-table__td">
                        <StockBar current={item.current_stock} reorder={item.reorder_level} />
                      </td>
                      <td className="inv-table__td inv-table__td--muted">{item.reorder_level} {item.unit}</td>
                      <td className="inv-table__td">
                        <StockBadge current={item.current_stock} reorder={item.reorder_level} />
                      </td>
                      <td className="inv-table__td inv-table__td--right">
                        <div className="inv-table__actions">
                          <button className="inv-btn inv-btn--primary inv-btn--xs" onClick={() => setModal({ item, type: 'restock' })}>+ Restock</button>
                          <button className="inv-btn inv-btn--secondary inv-btn--xs" onClick={() => setModal({ item, type: 'adjustment' })}>Adjust</button>
                        </div>
                      </td>
                    </tr>
                  ))
            }
          </tbody>
        </table>

        {!loading && filtered.length > 0 && (
          <div className="inv-table__footer">
            Showing <strong>{filtered.length}</strong> of <strong>{items.length}</strong> ingredients
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <TransactionModal
          item={modal.item}
          type={modal.type}
          onClose={() => setModal(null)}
          onSubmit={handleTransaction}
        />
      )}
    </div>
  );
}