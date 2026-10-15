import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { inventoryAPI, categoriesAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import { useAuth } from '../../context/AuthContext';
import '../../styles/InventoryPage.css';

// ─── Constants ────────────────────────────────────────────────────────────────
const UNIT_OPTIONS = [
  { value: 'pcs',      label: 'Pieces (pcs)' },
  { value: 'kilogram', label: 'Kilogram (kg)' },
  { value: 'gram',     label: 'Gram (g)' },
  { value: 'liter',    label: 'Liter (L)' },
  { value: 'ml',       label: 'Milliliter (ml)' },
  { value: 'pack',     label: 'Pack' },
  { value: 'tub',      label: 'Tub' },
  { value: 'bottle',   label: 'Bottle' },
  { value: 'sachet',   label: 'Sachet' },
  { value: 'cup',      label: 'Cup' },
  { value: 'tbsp',     label: 'Tablespoon (tbsp)' },
  { value: 'tsp',      label: 'Teaspoon (tsp)' },
];

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

// ─── Toast ────────────────────────────────────────────────────────────────────
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

// ─── Pagination ───────────────────────────────────────────────────────────────
const PER_PAGE_OPTIONS = [5, 8, 10, 15, 20, 50];

function Pagination({ page, totalPages, total, from, to, onPage }) {
  if (totalPages <= 1 && total <= 5) return null;

  const pages = [];
  const delta = 1;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  return (
    <div className="pag" role="navigation" aria-label="Pagination">
      <span className="pag__info">{from}–{to} of {total}</span>
      {totalPages > 1 && (
        <div className="pag__controls">
          <button className="pag__btn" onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          {pages.map((p, i) =>
            p === '…'
              ? <span key={`e${i}`} className="pag__ellipsis">…</span>
              : <button
                  key={p}
                  className={`pag__btn pag__btn--num${p === page ? ' pag__btn--active' : ''}`}
                  onClick={() => onPage(p)}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                >{p}</button>
          )}
          <button className="pag__btn" onClick={() => onPage(page + 1)} disabled={page === totalPages} aria-label="Next page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Restock Modal ────────────────────────────────────────────────────────────
function RestockModal({ item, onClose, onSubmit }) {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0) { setError('Enter a valid quantity.'); return; }
    setLoading(true); setError('');
    try {
      await onSubmit(item.id, { change_type: 'restock', quantity: qty, note });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Transaction failed.');
    } finally { setLoading(false); }
  };

  return createPortal(
    <div className="inv-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="inv-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inv-modal-title"
      >
        <div className="inv-modal__header">
          <h2 id="inv-modal-title" className="inv-modal__title">
            Restock Ingredient
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
                Add quantity ({item.unit})
              </label>
              <input
                id="txn-qty"
                ref={inputRef}
                type="number"
                min={1}
                step="0.01"
                value={quantity}
                onChange={(e) => { setQuantity(e.target.value); setError(''); }}
                className="inv-field__input"
                placeholder="e.g. 50"
                required
              />
              {quantity && (
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
                placeholder="e.g. Delivery from supplier"
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
            {loading ? <span className="inv-spinner" aria-label="Saving…" /> : 'Restock'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Adjust Modal ─────────────────────────────────────────────────────────────
// Corrects stock to a physically counted value (up or down). Submits an
// `adjustment` transaction, which the backend treats as "set to this value".
function AdjustModal({ item, onClose, onSubmit }) {
  const [newStock, setNewStock] = useState(String(item.current_stock));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const parsed = Number(newStock);
  const valid = newStock !== '' && Number.isFinite(parsed) && parsed >= 0;
  const delta = valid ? parsed - item.current_stock : 0;
  const changed = valid && delta !== 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid) { setError('Enter a stock count of zero or greater.'); return; }
    if (!changed) { setError('New count matches the current stock.'); return; }
    setLoading(true); setError('');
    try {
      await onSubmit(item.id, { change_type: 'adjustment', quantity: parsed });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Adjustment failed.');
    } finally { setLoading(false); }
  };

  return createPortal(
    <div className="inv-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="inv-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-modal-title"
      >
        <div className="inv-modal__header">
          <h2 id="adjust-modal-title" className="inv-modal__title">
            Adjust Stock
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

          <form id="adjust-form" onSubmit={handleSubmit} noValidate>
            <div className="inv-field">
              <label htmlFor="adjust-qty" className="inv-field__label">
                Counted stock ({item.unit})
              </label>
              <input
                id="adjust-qty"
                ref={inputRef}
                type="number"
                min={0}
                step="0.01"
                value={newStock}
                onChange={(e) => { setNewStock(e.target.value); setError(''); }}
                className="inv-field__input"
                placeholder="0"
                required
              />
              {valid && (
                <p className="inv-field__hint">
                  {delta > 0
                    ? <>New total: <strong>{parsed} {item.unit}</strong> (increase {delta})</>
                    : delta < 0
                      ? <>New total: <strong>{parsed} {item.unit}</strong> (decrease {Math.abs(delta)})</>
                      : <>No change from current stock.</>}
                </p>
              )}
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
          <button className="inv-btn inv-btn--primary" form="adjust-form" type="submit" disabled={loading || !changed} aria-busy={loading}>
            {loading ? <span className="inv-spinner" aria-label="Saving…" /> : 'Adjust'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Mobile card ──────────────────────────────────────────────────────────────
function InventoryCard({ item, isAdmin, isCashier, onRestock, onAdjust, onOutOfStock, onEdit }) {
  const s = stockStatus(item.current_stock, item.reorder_level);
  const cap = Math.max(item.current_stock * 1.5, item.reorder_level * 3, 10);
  const pct = Math.min(100, (item.current_stock / cap) * 100);
  return (
    <article className={`inv-card inv-card--${s}`}>
      <div className="inv-card__header">
        <div className="inv-card__ident">
          <h3 className="inv-card__name" title={item.name}>{item.name}</h3>
          <span className="inv-card__unit">per {item.unit}</span>
          {(item.categories || []).length > 0 && (
            <span className="inv-card__cats">
              {item.categories.map((c) => (
                <span key={c.id} className="inv-cat-chip">{c.name}</span>
              ))}
            </span>
          )}
        </div>
        <StockBadge current={item.current_stock} reorder={item.reorder_level} />
      </div>

      <div className="inv-card__level">
        <div className="inv-card__level-top">
          <span className="inv-card__stock">
            {item.current_stock} <small>{item.unit}</small>
          </span>
          <span className="inv-card__reorder">Reorder at {item.reorder_level} {item.unit}</span>
        </div>
        <div className={`inv-card__bar inv-card__bar--${s}`} role="presentation">
          <div className="inv-card__bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="inv-card__actions">
        <button className="inv-btn inv-btn--primary inv-btn--sm" onClick={() => onRestock(item)}>+ Restock</button>
        {isCashier && (
          <button className="inv-btn inv-btn--quiet inv-btn--sm" onClick={() => onAdjust(item)}>Adjust</button>
        )}
        {isAdmin && (
          <button className="inv-btn inv-btn--quiet inv-btn--sm" onClick={() => onEdit(item)}>Edit</button>
        )}
        {item.current_stock > 0 && (
          <button className="inv-btn inv-btn--quiet inv-btn--quiet-danger inv-btn--sm" onClick={() => onOutOfStock(item)}>Out of stock</button>
        )}
      </div>
    </article>
  );
}

// ─── Category multi-select (dropdown with checkbox list) ──────────────────────
function CategoryMultiSelect({ id, categories, value, onChange }) {
  const [open, setOpen]           = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const rootRef = useRef(null);

  const positionPanel = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 260 && r.top > spaceBelow;
    setPanelStyle(openUp
      ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width }
      : { top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
    };
  }, [open, positionPanel]);

  const toggleOpen = () => {
    setOpen((prev) => {
      if (!prev) positionPanel();
      return !prev;
    });
  };

  const toggle = (catId) => {
    onChange(value.includes(catId) ? value.filter((x) => x !== catId) : [...value, catId]);
  };

  const selectedNames = categories.filter((c) => value.includes(c.id)).map((c) => c.name);
  const summary = selectedNames.length === 0
    ? 'No categories selected'
    : selectedNames.length <= 2
      ? selectedNames.join(', ')
      : `${selectedNames.length} categories selected`;

  return (
    <div
      className="inv-multiselect"
      ref={rootRef}
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
    >
      <button
        type="button"
        id={id}
        className="inv-multiselect__trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <span className={`inv-multiselect__value${selectedNames.length === 0 ? ' inv-multiselect__value--empty' : ''}`}>
          {summary}
        </span>
        <svg className={`inv-multiselect__chevron${open ? ' inv-multiselect__chevron--open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="inv-multiselect__panel" style={panelStyle || undefined} role="group" aria-labelledby={id}>
          {categories.length === 0
            ? <p className="inv-multiselect__empty">No categories yet — add them in Menu Management.</p>
            : categories.map((c) => {
                const checked = value.includes(c.id);
                return (
                  <label key={c.id} className="inv-multiselect__option">
                    <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} />
                    <span>{c.name}</span>
                  </label>
                );
              })}
        </div>
      )}
    </div>
  );
}

// ─── Add / Edit ingredient modal ──────────────────────────────────────────────
function ItemModal({ mode, item, categories, onClose, onSubmit }) {
  const isEdit = mode === 'edit';
  const [name, setName]                 = useState(item?.name || '');
  const [unit, setUnit]                 = useState(item?.unit || '');
  const [currentStock, setCurrentStock] = useState(item?.current_stock != null ? String(item.current_stock) : '');
  const [reorderLevel, setReorderLevel] = useState(item?.reorder_level != null ? String(item.reorder_level) : '');
  const [categoryIds, setCategoryIds]   = useState(() => (item?.categories || []).map((c) => c.id));
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Ingredient name is required.'); return; }
    if (!unit)        { setError('Please select a unit.'); return; }
    setLoading(true); setError('');
    try {
      await onSubmit({
        name:          name.trim(),
        unit:          unit.trim(),
        current_stock: Number(currentStock) || 0,
        reorder_level: Number(reorderLevel) || 0,
        category_ids:  categoryIds,
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save ingredient.');
    } finally { setLoading(false); }
  };

  return createPortal(
    <div className="inv-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="inv-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-title"
      >
        <div className="inv-modal__header">
          <h2 id="item-title" className="inv-modal__title">{isEdit ? 'Edit Ingredient' : 'Add Ingredient'}</h2>
          <button className="inv-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="inv-modal__body">
          <form id="inv-item-form" onSubmit={handleSubmit} noValidate>
            <div className="inv-field">
              <label htmlFor="ing-name" className="inv-field__label">Ingredient name <span className="inv-field__required">*</span></label>
              <input
                id="ing-name"
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                className="inv-field__input"
                placeholder="e.g. Pork belly"
                required
              />
            </div>

            <div className="inv-field">
              <label htmlFor="ing-unit" className="inv-field__label">Unit <span className="inv-field__required">*</span></label>
              <select
                id="ing-unit"
                value={unit}
                onChange={(e) => { setUnit(e.target.value); setError(''); }}
                className="inv-field__input"
                required
              >
                <option value="">Select unit…</option>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>

            <div className="inv-field">
              <span className="inv-field__label">
                Categories <span className="inv-field__optional">(optional)</span>
              </span>
              <CategoryMultiSelect
                id="ing-category"
                categories={categories}
                value={categoryIds}
                onChange={setCategoryIds}
              />
            </div>

            <div className="inv-field-row">
              <div className="inv-field">
                <label htmlFor="ing-stock" className="inv-field__label">
                  {isEdit ? 'Current stock' : 'Starting stock'} <span className="inv-field__optional">(optional)</span>
                </label>
                <input
                  id="ing-stock"
                  type="number"
                  min="0"
                  step="0.01"
                  value={currentStock}
                  onChange={(e) => setCurrentStock(e.target.value)}
                  className="inv-field__input"
                  placeholder="0"
                />
              </div>

              <div className="inv-field">
                <label htmlFor="ing-reorder" className="inv-field__label">
                  Reorder level <span className="inv-field__optional">(optional)</span>
                </label>
                <input
                  id="ing-reorder"
                  type="number"
                  min="0"
                  step="0.01"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  className="inv-field__input"
                  placeholder="0"
                />
              </div>
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
          <button className="inv-btn inv-btn--primary" form="inv-item-form" type="submit" disabled={loading} aria-busy={loading}>
            {loading ? <span className="inv-spinner" aria-label="Saving…" /> : isEdit ? 'Save changes' : 'Add Ingredient'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const { user } = useAuth();
  // Creating new ingredients is admin-only; cashiers keep restock/adjust/out-of-stock.
  const isAdmin = user?.role === 'admin';
  // Correcting stock to a counted value is a cashier action (admins use Edit).
  const isCashier = user?.role === 'cashier';
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [modal, setModal] = useState(null);
  const [adjustModal, setAdjustModal] = useState(null);
  const [itemModal, setItemModal] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { msg: toastMsg, type: toastType, show: showToast } = useToast();

  const fetchItems = useCallback(async () => {
    try {
      setError('');
      // Categories come from Menu Management (shared menu_categories table).
      const [itemsRes, catsRes] = await Promise.all([
        inventoryAPI.getAll(),
        categoriesAPI.getAll(),
      ]);
      setItems(itemsRes.data.items || itemsRes.data);
      setCategories(catsRes.data.categories || []);
    } catch {
      setError('Failed to load inventory. Please try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Real-time socket sync
  useEffect(() => {
    const socket = getSocket();
    // The backend broadcasts `inventory:update` with a camelCase payload
    // ({ itemId, currentStock, reorderLevel, name }) so both this page and the
    // admin overview can consume it; map it onto the row shape used here.
    const handler = (p) => {
      setItems((prev) => prev.map((i) =>
        i.id === p.itemId
          ? { ...i, current_stock: p.currentStock, reorder_level: p.reorderLevel, name: p.name ?? i.name }
          : i));
    };
    socket.on('inventory:update', handler);
    return () => socket.off('inventory:update', handler);
  }, []);

  const handleTransaction = async (id, payload) => {
    const { data } = await inventoryAPI.transaction(id, payload);
    const verb = payload.change_type === 'adjustment' ? 'Adjusted' : 'Restocked';
    const autoEnabled = data.auto_enabled_menu_items?.length || 0;
    if (autoEnabled > 0) {
      showToast(
        `${verb}! ${autoEnabled} menu item${autoEnabled > 1 ? 's' : ''} automatically marked available.`,
        'success'
      );
    } else {
      showToast(`${verb} successfully.`);
    }
    await fetchItems();
  };

  const handleItemSubmit = async (payload) => {
    if (itemModal?.mode === 'edit') {
      await inventoryAPI.update(itemModal.item.id, payload);
      showToast(`"${payload.name}" updated.`);
    } else {
      await inventoryAPI.create(payload);
      showToast(`"${payload.name}" added to inventory.`);
    }
    await fetchItems();
  };

  const handleOutOfStock = async (item) => {
    try {
      const { data } = await inventoryAPI.outOfStock(item.id);
      const affected = data.affected_menu_items?.length || 0;
      showToast(
        affected > 0
          ? `"${item.name}" set to out of stock. ${affected} menu item${affected > 1 ? 's' : ''} marked unavailable.`
          : `"${item.name}" set to out of stock.`,
        'warning'
      );
      await fetchItems();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update stock.', 'error');
    }
  };

  const stats = useMemo(() => {
    const out = items.filter((i) => i.current_stock <= 0).length;
    const low = items.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level).length;
    return { total: items.length, out, low, ok: items.length - out - low };
  }, [items]);

  const filtered = useMemo(() => {
    let r = items;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((i) => i.name.toLowerCase().includes(q) || i.unit.toLowerCase().includes(q));
    }
    if (filterStatus === 'out') r = r.filter((i) => i.current_stock <= 0);
    else if (filterStatus === 'low') r = r.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level);
    else if (filterStatus === 'ok') r = r.filter((i) => i.current_stock > i.reorder_level);
    if (filterCategory === 'none') r = r.filter((i) => !i.categories || i.categories.length === 0);
    else if (filterCategory !== 'all') r = r.filter((i) => (i.categories || []).some((c) => String(c.id) === filterCategory));
    return [...r].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'stock_asc') return a.current_stock - b.current_stock;
      if (sortBy === 'stock_desc') return b.current_stock - a.current_stock;
      return 0;
    });
  }, [items, search, filterStatus, filterCategory, sortBy]);

  // Reset to page 1 when filters/search/perPage change
  useEffect(() => { setPage(1); }, [search, filterStatus, filterCategory, sortBy, perPage]);

  // Paginated slices — single perPage for both table and cards
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage   = Math.min(page, totalPages);
  const start      = (safePage - 1) * perPage;

  // Number of non-default filters, surfaced on the mobile Filter button.
  const activeFilterCount =
    (filterStatus !== 'all' ? 1 : 0) +
    (filterCategory !== 'all' ? 1 : 0) +
    (sortBy !== 'name' ? 1 : 0);

  const pagedTable = useMemo(() => filtered.slice(start, start + perPage), [filtered, start, perPage]);

  const from = filtered.length === 0 ? 0 : start + 1;
  const to   = Math.min(start + perPage, filtered.length);

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
        {isAdmin && (
          <div className="inv-header-actions">
            <button className="inv-btn inv-btn--primary" onClick={() => setItemModal({ mode: 'add' })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Ingredient
            </button>
          </div>
        )}
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
        <button
          type="button"
          className={`inv-filter-btn${activeFilterCount > 0 ? ' inv-filter-btn--active' : ''}`}
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
          aria-label="Filters and sorting"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
          </svg>
          Filter
          {activeFilterCount > 0 && <span className="inv-filter-btn__badge">{activeFilterCount}</span>}
        </button>

        <div className="inv-filter-panel">
          <select className="inv-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status">
            <option value="all">All items</option>
            <option value="ok">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          <select className="inv-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            <option value="none">Uncategorized</option>
          </select>
          <select className="inv-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort by">
            <option value="name">Sort: Name</option>
            <option value="stock_asc">Stock: Low first</option>
            <option value="stock_desc">Stock: High first</option>
          </select>
          <label className="pag__limit-label" htmlFor="inv-per-page">
            Show
            <select
              id="inv-per-page"
              className="pag__limit-select"
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              aria-label="Items per page"
            >
              {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            per page
          </label>
        </div>
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
            : pagedTable.map((item) => (
                <InventoryCard
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  isCashier={isCashier}
                  onRestock={(i) => setModal({ item: i })}
                  onAdjust={(i) => setAdjustModal({ item: i })}
                  onOutOfStock={(i) => setConfirmItem(i)}
                  onEdit={(i) => setItemModal({ mode: 'edit', item: i })}
                />
              ))
        }
      </div>



      {/* Mobile pagination — visible on mobile/tablet only, below cards */}
      {!loading && filtered.length > 0 && (
        <div className="inv-pag-mobile">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            from={from}
            to={to}
            onPage={setPage}
          />
        </div>
      )}
      <div className="inv-table-wrap">
        <table className="inv-table" aria-label="Inventory table">
          <thead>
            <tr>
              <th scope="col" className="inv-table__th">Ingredient</th>
              <th scope="col" className="inv-table__th">Unit</th>
              <th scope="col" className="inv-table__th">Category</th>
              <th scope="col" className="inv-table__th">Stock level</th>
              <th scope="col" className="inv-table__th">Reorder at</th>
              <th scope="col" className="inv-table__th">Status</th>
              <th scope="col" className="inv-table__th inv-table__th--right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="inv-table__td">
                        <div className="inv-skeleton-row" style={{ width: `${55 + Math.random() * 35}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.length === 0
                ? <tr><td colSpan={7}>
                    <div className="inv-empty">
                      <p>{search ? 'No items match your search.' : 'Inventory is empty.'}</p>
                    </div>
                  </td></tr>
                : pagedTable.map((item) => (
                    <tr key={item.id} className="inv-table__row">
                      <td className="inv-table__td">
                        <span className="inv-table__name">{item.name}</span>
                      </td>
                      <td className="inv-table__td inv-table__td--muted">{item.unit}</td>
                      <td className="inv-table__td inv-table__td--muted">
                        {(item.categories || []).length > 0
                          ? (
                            <span className="inv-cat-list-inline">
                              {item.categories.map((c) => (
                                <span key={c.id} className="inv-cat-chip">{c.name}</span>
                              ))}
                            </span>
                          )
                          : <span className="inv-table__muted">—</span>}
                      </td>
                      <td className="inv-table__td">
                        <StockBar current={item.current_stock} reorder={item.reorder_level} />
                      </td>
                      <td className="inv-table__td inv-table__td--muted">{item.reorder_level} {item.unit}</td>
                      <td className="inv-table__td">
                        <StockBadge current={item.current_stock} reorder={item.reorder_level} />
                      </td>
                      <td className="inv-table__td inv-table__td--right">
                        <div className="inv-table__actions">
                          <button className="inv-btn inv-btn--primary inv-btn--xs" onClick={() => setModal({ item })}>+ Restock</button>
                          {isCashier && (
                            <button className="inv-btn inv-btn--quiet inv-btn--xs" onClick={() => setAdjustModal({ item })}>Adjust</button>
                          )}
                          {isAdmin && (
                            <button className="inv-btn inv-btn--quiet inv-btn--xs" onClick={() => setItemModal({ mode: 'edit', item })}>Edit</button>
                          )}
                          {item.current_stock > 0 && (
                            <button className="inv-btn inv-btn--quiet inv-btn--quiet-danger inv-btn--xs" onClick={() => setConfirmItem(item)}>Out of stock</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
            }
          </tbody>
        </table>

        {!loading && filtered.length > 0 && (
          <div className="inv-table__footer">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              from={from}
              to={to}
              onPage={setPage}
            />
          </div>
        )}
      </div>

      {/* Restock modal */}
      {modal && (
        <RestockModal
          item={modal.item}
          onClose={() => setModal(null)}
          onSubmit={handleTransaction}
        />
      )}

      {/* Adjust modal — cashier only */}
      {adjustModal && (
        <AdjustModal
          item={adjustModal.item}
          onClose={() => setAdjustModal(null)}
          onSubmit={handleTransaction}
        />
      )}

      {/* Add / edit ingredient modal — admin only */}
      {isAdmin && itemModal && (
        <ItemModal
          mode={itemModal.mode}
          item={itemModal.item}
          categories={categories}
          onClose={() => setItemModal(null)}
          onSubmit={handleItemSubmit}
        />
      )}

      {/* Mobile filters modal */}
      {filtersOpen && createPortal(
        <div
          className="inv-modal-overlay inv-modal-overlay--compact"
          onClick={(e) => e.target === e.currentTarget && setFiltersOpen(false)}
          role="presentation"
        >
          <div className="inv-modal inv-modal--compact" role="dialog" aria-modal="true" aria-labelledby="inv-filter-title">
            <div className="inv-modal__header">
              <h2 className="inv-modal__title" id="inv-filter-title">Filters</h2>
              <button className="inv-modal__close" onClick={() => setFiltersOpen(false)} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="inv-modal__body">
              <label className="inv-field">
                <span className="inv-field__label">Status</span>
                <select className="inv-select inv-select--block" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="all">All items</option>
                  <option value="ok">In stock</option>
                  <option value="low">Low stock</option>
                  <option value="out">Out of stock</option>
                </select>
              </label>
              <label className="inv-field">
                <span className="inv-field__label">Category</span>
                <select className="inv-select inv-select--block" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="all">All categories</option>
                  {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  <option value="none">Uncategorized</option>
                </select>
              </label>
              <label className="inv-field">
                <span className="inv-field__label">Sort by</span>
                <select className="inv-select inv-select--block" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="name">Name</option>
                  <option value="stock_asc">Stock: Low first</option>
                  <option value="stock_desc">Stock: High first</option>
                </select>
              </label>
              <label className="inv-field">
                <span className="inv-field__label">Items per page</span>
                <select className="inv-select inv-select--block" value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
                  {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div className="inv-modal__footer">
              <button
                className="inv-btn inv-btn--ghost"
                onClick={() => { setFilterStatus('all'); setFilterCategory('all'); setSortBy('name'); setPerPage(10); setPage(1); }}
              >
                Reset
              </button>
              <button className="inv-btn inv-btn--primary" onClick={() => setFiltersOpen(false)}>Done</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Out-of-stock confirmation — destructive */}
      {confirmItem && createPortal(
        <div
          className="inv-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setConfirmItem(null)}
          role="presentation"
        >
          <div className="inv-modal" role="dialog" aria-modal="true" aria-labelledby="inv-oos-title">
            <div className="inv-modal__header">
              <h2 className="inv-modal__title" id="inv-oos-title">Mark as out of stock?</h2>
              <button className="inv-modal__close" onClick={() => setConfirmItem(null)} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="inv-modal__body">
              <div className="inv-modal__item-card">
                <span className="inv-modal__item-name">{confirmItem.name}</span>
                <div className="inv-modal__item-meta">
                  <span>Current: <strong>{confirmItem.current_stock} {confirmItem.unit}</strong></span>
                  <StockBadge current={confirmItem.current_stock} reorder={confirmItem.reorder_level} />
                </div>
              </div>
              <p className="inv-modal__text">
                This sets <strong>{confirmItem.name}</strong> to 0 {confirmItem.unit}. Any menu items that use it will be marked unavailable until it is restocked.
              </p>
            </div>
            <div className="inv-modal__footer">
              <button className="inv-btn inv-btn--ghost" onClick={() => setConfirmItem(null)}>Cancel</button>
              <button
                className="inv-btn inv-btn--danger"
                onClick={() => { const it = confirmItem; setConfirmItem(null); handleOutOfStock(it); }}
              >
                Mark out of stock
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
