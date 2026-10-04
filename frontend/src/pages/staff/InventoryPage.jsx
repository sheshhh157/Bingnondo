import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { inventoryAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
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

// An ingredient can sit in several categories at once - Chicken Siomai serves
// both a Student Meal and a Student Platter item - so the tag list is a set of
// checkboxes rather than a single <select>. A native multi-select hides the
// other options behind a scroll on the tablets staff actually use.
function CategoryPicker({ categories, selected, onToggle }) {
  return (
    <div className="inv-catpick" role="group" aria-label="Categories">
      {categories.map((c) => {
        const on = selected.includes(Number(c.id));
        return (
          <label key={c.id} className={`inv-catpick__opt${on ? ' inv-catpick__opt--on' : ''}`}>
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggle(Number(c.id))}
            />
            <span className="inv-catpick__box" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="inv-catpick__label">{c.name}</span>
          </label>
        );
      })}
    </div>
  );
}

// ─── Transaction Modal ────────────────────────────────────────────────────────
function TransactionModal({ item, type, categories, onClose, onSubmit, onSaveDetails }) {
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);
  // Ids are kept sorted so set comparison against the item's tags is stable
  // regardless of the order the boxes were ticked in.
  const [categoryIds, setCategoryIds] = useState(() => [...(item.category_ids || [])].sort((a, b) => a - b));
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
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

  // Name, unit and category are saved together, separately from the stock
  // movement, so a correction of a typo never gets logged as a restock or
  // adjustment.
  const unitChanged = unit.trim() !== item.unit;

  const toggleCategory = (id) => {
    setError('');
    setCategoryIds((prev) =>
      (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]).sort((a, b) => a - b)
    );
  };

  // Set equality, not array equality: ticking boxes in a different order is not
  // a change worth enabling Save for.
  const categoriesChanged =
    categoryIds.length !== (item.category_ids?.length || 0) ||
    categoryIds.some((id) => !(item.category_ids || []).includes(id));

  const detailsChanged =
    name.trim() !== item.name || unitChanged || categoriesChanged;

  const handleSaveDetails = async () => {
    if (!name.trim()) { setError('Ingredient name is required.'); return; }
    if (!unit.trim()) { setError('Unit is required.'); return; }
    setSavingDetails(true); setError('');
    try {
      await onSaveDetails(item.id, {
        name: name.trim(),
        unit: unit.trim(),
        category_ids: categoryIds,
      });
      setEditingDetails(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the changes.');
    } finally { setSavingDetails(false); }
  };

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
            {editingDetails ? (
              <input
                type="text"
                className="inv-modal__name-input"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                aria-label="Ingredient name"
              />
            ) : (
              <div className="inv-modal__name-row">
                <span className="inv-modal__item-name">{name.trim() || item.name}</span>
                <button
                  type="button"
                  className="inv-modal__edit-btn"
                  onClick={() => { setEditingDetails(true); setError(''); }}
                  aria-label={`Edit details for ${item.name}`}
                  title="Edit name, unit and categories"
                >
<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                  </svg>
                </button>
              </div>
            )}
            <div className="inv-modal__item-meta">
              <span>Current: <strong>{item.current_stock} {item.unit}</strong></span>
              <StockBadge current={item.current_stock} reorder={item.reorder_level} />
            </div>
          </div>

          {editingDetails && (
            <>
              <div className="inv-field">
                <label htmlFor="txn-unit" className="inv-field__label">Unit</label>
                <select
                  id="txn-unit"
                  value={unit}
                  onChange={(e) => { setUnit(e.target.value); setError(''); }}
                  className="inv-field__input"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>

              <div className="inv-field">
                <span className="inv-field__label" id="txn-cat-label">
                  Categories
                  {categoryIds.length > 1 && (
                    <span className="inv-field__optional"> (pick any)</span>
                  )}
                </span>
                <CategoryPicker
                  categories={categories}
                  selected={categoryIds}
                  onToggle={toggleCategory}
                />
                <p className="inv-field__hint">
                  An ingredient can sit in more than one. Tick every category it
                  belongs to and it will show up in each of those lists.
                </p>
              </div>

              {unitChanged && item.current_stock > 0 && (
                <p className="inv-modal__warn" role="alert">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <span>
                    Changing the unit does not convert the quantity. The stored{' '}
                    <strong>{item.current_stock}</strong> will now be read as{' '}
                    <strong>{unit}</strong>, not {item.unit}. Use Adjust afterwards to set the
                    correct figure.
                  </span>
                </p>
              )}
            </>
          )}

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
          {editingDetails && (
            <button
              className="inv-btn inv-btn--secondary"
              type="button"
              onClick={handleSaveDetails}
              disabled={savingDetails || !detailsChanged}
              aria-busy={savingDetails}
            >
              {savingDetails ? <span className="inv-spinner" aria-label="Saving…" /> : 'Save details'}
            </button>
          )}
          <button className="inv-btn inv-btn--ghost" onClick={onClose} disabled={loading || savingDetails}>Cancel</button>
          <button className="inv-btn inv-btn--primary" form="txn-form" type="submit" disabled={loading} aria-busy={loading}>
            {loading ? <span className="inv-spinner" aria-label="Saving…" /> : isRestock ? 'Restock' : 'Adjust'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile card ──────────────────────────────────────────────────────────────
function InventoryCard({ item, onRestock, onAdjust, onOutOfStock, onDelete }) {
  const s = stockStatus(item.current_stock, item.reorder_level);
  return (
    <article className={`inv-card${s !== 'ok' ? ` inv-card--${s}` : ''}`}>
      <div className="inv-card__top">
        <div>
          <p className="inv-card__name">{item.name}</p>
          <p className="inv-card__unit">Unit: {item.unit}</p>
          {item.category_names?.length > 0 ? (
            <p className="inv-card__category">
              {item.category_names.join(', ')}
            </p>
          ) : (
            <p className="inv-card__category inv-card__category--none">Uncategorized</p>
          )}
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
        {item.current_stock > 0 && (
          <button className="inv-btn inv-btn--danger inv-btn--sm" onClick={() => onOutOfStock(item)}>Out of stock</button>
        )}
        <button
          className="inv-btn inv-btn--ghost inv-btn--sm inv-btn--icon"
          onClick={() => onDelete(item)}
          aria-label={`Delete ${item.name}`}
          title="Delete ingredient"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      </div>
    </article>
  );
}

// ─── Delete Ingredient Confirm ────────────────────────────────────────────────
// Mirrors MenuPage's ConfirmDialog, but reuses the inventory modal styles since
// this page has no separate confirm stylesheet.
function DeleteIngredientDialog({ item, onClose, onConfirm, loading }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [onClose, loading]);

  return (
    <div className="inv-modal-overlay" onClick={() => !loading && onClose()} aria-hidden="true">
      <div
        className="inv-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inv-delete-title"
      >
        <div className="inv-modal__header">
          <h3 id="inv-delete-title" className="inv-modal__title">Delete Ingredient</h3>
          <button
            className="inv-modal__close"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="inv-modal__body">
          <p>
            Delete <strong>{item.name}</strong>? This permanently removes the ingredient
            and <strong>erases its stock movement history</strong>.
          </p>
          <p className="inv-modal__item-meta">
            Currently {item.current_stock} {item.unit} on hand. To keep the history but stop
            selling it, use <strong>Out of stock</strong> instead.
          </p>
        </div>

        <div className="inv-modal__footer">
          <button className="inv-btn inv-btn--ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="inv-btn inv-btn--danger" onClick={onConfirm} disabled={loading} aria-busy={loading}>
            {loading ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Ingredient Modal ─────────────────────────────────────────────────────
function AddIngredientModal({ categories, onClose, onSubmit }) {
  const [name, setName]               = useState('');
  const [unit, setUnit]               = useState('');
  const [categoryIds, setCategoryIds] = useState([]);
  const [currentStock, setCurrentStock] = useState('');
  const [reorderLevel, setReorderLevel] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
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
    if (categoryIds.length === 0) { setError('Select at least one category.'); return; }
    setLoading(true); setError('');
    try {
      await onSubmit({
        name:          name.trim(),
        unit:          unit.trim(),
        category_ids:  categoryIds,
        current_stock: Number(currentStock) || 0,
        reorder_level: Number(reorderLevel) || 0,
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add ingredient.');
    } finally { setLoading(false); }
  };

  return (
    <div className="inv-modal-overlay" onClick={onClose} aria-hidden="true">
      <div
        className="inv-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-ing-title"
      >
        <div className="inv-modal__header">
          <h2 id="add-ing-title" className="inv-modal__title">Add Ingredient</h2>
          <button className="inv-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="inv-modal__body">
          <form id="add-ing-form" onSubmit={handleSubmit} noValidate>
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
              <span className="inv-field__label">Categories <span className="inv-field__required">*</span></span>
              <CategoryPicker
                categories={categories}
                selected={categoryIds}
                onToggle={(id) => {
                  setError('');
                  setCategoryIds((prev) =>
                    (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]).sort((a, b) => a - b)
                  );
                }}
              />
              <p className="inv-field__hint">
                Tick every category this ingredient belongs to.
              </p>
            </div>

            <div className="inv-field-row">
              <div className="inv-field">
                <label htmlFor="ing-stock" className="inv-field__label">
                  Starting stock <span className="inv-field__optional">(optional)</span>
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
          <button className="inv-btn inv-btn--primary" form="add-ing-form" type="submit" disabled={loading} aria-busy={loading}>
            {loading ? <span className="inv-spinner" aria-label="Saving…" /> : 'Add Ingredient'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [categories, setCategories] = useState([]);
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [modal, setModal] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
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

  // Ingredient categories are the menu's categories, fetched rather than
  // hardcoded so a new menu category shows up here without a frontend change.
  useEffect(() => {
    let cancelled = false;
    inventoryAPI.getCategories()
      .then(({ data }) => { if (!cancelled) setCategories(data.categories || []); })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, []);

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
    const { data } = await inventoryAPI.transaction(id, payload);
    const autoEnabled = data.auto_enabled_menu_items?.length || 0;
    if (autoEnabled > 0) {
      showToast(
        `Restocked! ${autoEnabled} menu item${autoEnabled > 1 ? 's' : ''} automatically marked available.`,
        'success'
      );
    } else {
      showToast(payload.change_type === 'restock' ? 'Restocked successfully.' : 'Stock adjusted.');
    }
    await fetchItems();
  };

  const handleAddIngredient = async (payload) => {
    await inventoryAPI.create(payload);
    showToast(`"${payload.name}" added to inventory.`);
    await fetchItems();
  };

  const handleSaveDetails = async (id, payload) => {
    await inventoryAPI.update(id, payload);
    showToast(`"${payload.name}" updated.`);
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

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const { data } = await inventoryAPI.remove(deleteTarget.id);
      const unlinked = data.unlinked_menu_items?.length || 0;
      const erased = data.transactions_erased || 0;
      showToast(
        `"${data.name}" deleted.` +
        (unlinked > 0
          ? ` ${unlinked} menu item${unlinked > 1 ? 's' : ''} lost this ingredient.` : '') +
        (erased > 0 ? ` ${erased} history entr${erased > 1 ? 'ies' : 'y'} erased.` : ''),
        'warning'
      );
      setDeleteTarget(null);
      await fetchItems();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete ingredient.', 'error');
    } finally {
      setDeleting(false);
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
      const q = search.toLowerCase();
      r = r.filter((i) => i.name.toLowerCase().includes(q) || i.unit.toLowerCase().includes(q));
    }
    if (filterStatus === 'out') r = r.filter((i) => i.current_stock <= 0);
    else if (filterStatus === 'low') r = r.filter((i) => i.current_stock > 0 && i.current_stock <= i.reorder_level);
    else if (filterStatus === 'ok') r = r.filter((i) => i.current_stock > i.reorder_level);
    // 'uncategorized' is its own option: ingredients added before categories
    // existed, or cleared when a category was deleted, still need to be findable.
    if (filterCategory === 'uncategorized') r = r.filter((i) => !i.category_ids?.length);
    // A single category is picked, but an item can hold several. Matching on
    // membership rather than equality is what makes an ingredient tagged with
    // three categories show up under all three.
    else if (filterCategory !== 'all') {
      const want = Number(filterCategory);
      r = r.filter((i) => (i.category_ids || []).includes(want));
    }
    return [...r].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      // Names arrive alphabetically, so comparing the first is a stable order
      // for items carrying more than one category.
      if (sortBy === 'category') {
        return (a.category_names?.[0] || 'zzz').localeCompare(b.category_names?.[0] || 'zzz');
      }
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
        <div className="inv-header-actions">
          <button className="inv-btn inv-btn--primary" onClick={() => setShowAddModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Ingredient
          </button>
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
        <select className="inv-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} aria-label="Filter by category">
          <option value="all">All categories</option>
          <option value="uncategorized">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>{c.name}</option>
          ))}
        </select>
        <select className="inv-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All items</option>
          <option value="ok">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select className="inv-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort by">
          <option value="name">Sort: Name</option>
          <option value="category">Sort: Category</option>
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
                  onRestock={(i) => setModal({ item: i, type: 'restock' })}
                  onAdjust={(i) => setModal({ item: i, type: 'adjustment' })}
                  onOutOfStock={handleOutOfStock}
                  onDelete={setDeleteTarget}
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
              <th className="inv-table__th">Ingredient</th>
              <th className="inv-table__th">Category</th>
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
                      <td className="inv-table__td inv-table__td--muted">
                        {item.category_names?.length
                          ? item.category_names.join(', ')
                          : 'Uncategorized'}
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
                          {item.current_stock > 0 && (
                            <button className="inv-btn inv-btn--danger inv-btn--xs" onClick={() => handleOutOfStock(item)}>Out of stock</button>
                          )}
                          <button
                            className="inv-btn inv-btn--ghost inv-btn--xs inv-btn--icon"
                            onClick={() => setDeleteTarget(item)}
                            aria-label={`Delete ${item.name}`}
                            title="Delete ingredient"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                            </svg>
                          </button>
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

      {/* Transaction modal (restock / adjust) */}
      {modal && (
        <TransactionModal
          item={modal.item}
          type={modal.type}
          categories={categories}
          onClose={() => setModal(null)}
          onSubmit={handleTransaction}
          onSaveDetails={handleSaveDetails}
        />
      )}

      {/* Add ingredient modal */}
      {showAddModal && (
        <AddIngredientModal
          categories={categories}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddIngredient}
        />
      )}

      {/* Delete ingredient confirm */}
      {deleteTarget && (
        <DeleteIngredientDialog
          item={deleteTarget}
          onClose={() => !deleting && setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}
    </div>
  );
}