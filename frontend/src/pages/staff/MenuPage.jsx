import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { staffMenuAPI, inventoryAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import '../../styles/MenuPage.css';

// ─── Toast (matches codebase — no external lib) ───────────────────────────────
function useToast() {
  const [msg, setMsg] = useState('');
  const [type, setType] = useState('success');
  const t = useRef(null);
  const show = useCallback((message, tp = 'success') => {
    clearTimeout(t.current);
    setMsg(message); setType(tp);
    t.current = setTimeout(() => setMsg(''), 3200);
  }, []);
  return { msg, type, show };
}

// ─── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`mn-toggle${checked ? ' mn-toggle--on' : ''}${disabled ? ' mn-toggle--disabled' : ''}`}
    >
      <span className="mn-toggle__thumb" />
    </button>
  );
}

// ─── Image upload ──────────────────────────────────────────────────────────────
function ImageUpload({ value, onChange }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(value || null);
  const [drag, setDrag] = useState(false);

  const process = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;
    setPreview(URL.createObjectURL(file));
    onChange(file);
  };

  return (
    <div
      className={`mn-upload${drag ? ' mn-upload--drag' : ''}`}
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); process(e.dataTransfer.files[0]); }}
      role="button"
      tabIndex={0}
      aria-label="Upload photo"
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current.click()}
    >
      {preview
        ? <>
            <img src={preview} alt="Preview" className="mn-upload__img" />
            <div className="mn-upload__overlay">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span>Change photo</span>
            </div>
          </>
        : <div className="mn-upload__placeholder">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            <p>Drop photo here or <span>browse</span></p>
            <p className="mn-upload__hint">JPG, PNG · max 5MB</p>
          </div>
      }
      <input ref={inputRef} type="file" accept="image/*" className="mn-upload__input" onChange={(e) => process(e.target.files[0])} />
    </div>
  );
}

// ─── Ingredient linker ────────────────────────────────────────────────────────
function IngredientLinker({ inventoryItems, linked, onChange }) {
  const [adding, setAdding] = useState(false);
  const [selId, setSelId] = useState('');
  const [qty, setQty] = useState('');

  const available = inventoryItems.filter((i) => !linked.find((l) => l.inventory_item_id === i.id));

  const handleAdd = () => {
    if (!selId || !qty || Number(qty) <= 0) return;
    const item = inventoryItems.find((i) => i.id === Number(selId));
    onChange([...linked, { inventory_item_id: Number(selId), quantity_required: Number(qty), name: item.name, unit: item.unit }]);
    setSelId(''); setQty(''); setAdding(false);
  };

  return (
    <div className="mn-linker">
      <div className="mn-linker__list">
        {linked.length === 0
          ? <p className="mn-linker__empty">No ingredients linked yet.</p>
          : linked.map((l, i) => (
              <div key={l.inventory_item_id} className="mn-linker__item">
                <div>
                  <p className="mn-linker__item-name">{l.name}</p>
                  <p className="mn-linker__item-qty">{l.quantity_required} {l.unit} per serving</p>
                </div>
                <button
                  type="button"
                  onClick={() => onChange(linked.filter((_, idx) => idx !== i))}
                  className="mn-linker__remove"
                  aria-label={`Remove ${l.name}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))
        }
      </div>

      {adding
        ? <div className="mn-linker__add-row">
            <select value={selId} onChange={(e) => setSelId(e.target.value)} className="mn-field__input" autoFocus>
              <option value="">Select ingredient</option>
              {available.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
            <input type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" className="mn-field__input mn-linker__qty" />
            <button type="button" onClick={handleAdd} className="mn-btn mn-btn--primary mn-btn--xs" aria-label="Confirm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button type="button" onClick={() => setAdding(false)} className="mn-btn mn-btn--ghost mn-btn--xs" aria-label="Cancel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        : <button type="button" onClick={() => setAdding(true)} className="mn-linker__trigger" disabled={available.length === 0}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Link ingredient
          </button>
      }
    </div>
  );
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────
function MenuItemModal({ item, categories, inventoryItems, onClose, onSave }) {
  const isEdit = !!item;
  const [tab, setTab] = useState('details');
  const [form, setForm] = useState({
    name: item?.name || '',
    price: item?.price || '',
    description: item?.description || '',
    category_id: item?.category_id || categories[0]?.id || '',
    is_available: item?.is_available ?? true,
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [linked, setLinked] = useState(item?.ingredients || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Item name is required.'); return; }
    if (!form.price || Number(form.price) <= 0) { setError('Enter a valid price.'); return; }
    setLoading(true); setError('');
    try {
      // Mock: no actual upload, just use a placeholder URL if file is selected
      const image_url = photoFile ? `https://placehold.co/400x300?text=${encodeURIComponent(form.name)}` : (item?.image_url || null);
      await onSave({ ...form, price: Number(form.price), image_url, ingredients: linked }, isEdit ? item.id : null);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save item.');
    } finally { setLoading(false); }
  };

  return (
    <div className="mn-modal-overlay" onClick={onClose}>
      <div className="mn-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="mn-modal-title">
        <div className="mn-modal__header">
          <h2 id="mn-modal-title" className="mn-modal__title">{isEdit ? 'Edit Item' : 'Add Menu Item'}</h2>
          <button className="mn-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="mn-modal__tabs">
          {[{ id: 'details', label: 'Details' }, { id: 'ingredients', label: `Ingredients${linked.length ? ` (${linked.length})` : ''}` }].map(({ id, label }) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`mn-modal__tab${tab === id ? ' mn-modal__tab--active' : ''}`}>{label}</button>
          ))}
        </div>

        <form id="mn-form" onSubmit={handleSubmit} noValidate>
          <div className="mn-modal__body">
            {tab === 'details' ? (
              <>
                <div className="mn-field">
                  <label className="mn-field__label">Photo</label>
                  <ImageUpload value={item?.image_url} onChange={setPhotoFile} />
                </div>

                <div className="mn-grid-2">
                  <div className="mn-field mn-grid-2__full">
                    <label htmlFor="mn-name" className="mn-field__label">Name *</label>
                    <input id="mn-name" type="text" value={form.name} onChange={(e) => set('name')(e.target.value)} className="mn-field__input" placeholder="e.g. Tapsilog" required autoFocus={!isEdit} />
                  </div>

                  <div className="mn-field">
                    <label htmlFor="mn-price" className="mn-field__label">Price (₱) *</label>
                    <input id="mn-price" type="number" min="0" step="0.5" value={form.price} onChange={(e) => set('price')(e.target.value)} className="mn-field__input" placeholder="e.g. 120" required />
                  </div>

                  <div className="mn-field">
                    <label htmlFor="mn-cat" className="mn-field__label">Category *</label>
                    <select id="mn-cat" value={form.category_id} onChange={(e) => set('category_id')(Number(e.target.value))} className="mn-field__input">
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mn-field">
                  <label htmlFor="mn-desc" className="mn-field__label">Description</label>
                  <textarea id="mn-desc" value={form.description} onChange={(e) => set('description')(e.target.value)} className="mn-field__input mn-field__textarea" placeholder="Short description shown to customers…" rows={2} />
                </div>

                <div className="mn-avail-row">
                  <div>
                    <p className="mn-avail-row__label">Availability</p>
                    <p className="mn-avail-row__sub">Manual override — independent of stock</p>
                  </div>
                  <div className="mn-avail-row__right">
                    <span className={`mn-badge${form.is_available ? ' mn-badge--ok' : ' mn-badge--off'}`}>
                      {form.is_available ? 'Available' : 'Unavailable'}
                    </span>
                    <Toggle checked={form.is_available} onChange={set('is_available')} label="Toggle availability" />
                  </div>
                </div>
              </>
            ) : (
              <div className="mn-field">
                <p className="mn-field__label">Linked Ingredients</p>
                <p className="mn-field__hint">Stock deducted automatically when item is ordered</p>
                <IngredientLinker inventoryItems={inventoryItems} linked={linked} onChange={setLinked} />
              </div>
            )}

            {error && (
              <p className="mn-modal__error" role="alert">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </p>
            )}
          </div>
        </form>

        <div className="mn-modal__footer">
          <button type="button" className="mn-btn mn-btn--ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button type="submit" form="mn-form" className="mn-btn mn-btn--primary" disabled={loading} aria-busy={loading}>
            {loading ? <span className="mn-spinner" aria-label="Saving…" /> : isEdit ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ item, onClose, onConfirm }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="mn-modal-overlay" onClick={onClose}>
      <div className="mn-confirm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="mn-confirm-title">
        <div className="mn-confirm__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
          </svg>
        </div>
        <h3 id="mn-confirm-title" className="mn-confirm__title">Remove Menu Item</h3>
        <p className="mn-confirm__msg">Remove <strong>{item.name}</strong> from the menu? This cannot be undone.</p>
        <div className="mn-confirm__actions">
          <button className="mn-btn mn-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="mn-btn mn-btn--danger" onClick={onConfirm}>Remove</button>
        </div>
      </div>
    </div>
  );
}

// ─── Menu item card (mobile / grid) ───────────────────────────────────────────
function MenuItemCard({ item, onEdit, onDelete, onToggle, toggling }) {
  return (
    <article className="mn-card">
      <div className="mn-card__photo">
        {item.image_url
          ? <img src={item.image_url} alt={item.name} className="mn-card__img" loading="lazy" />
          : <div className="mn-card__no-img" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                <circle cx="9" cy="9" r="2"/><polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
        }
        <span className="mn-card__cat-tag">{item.category_name}</span>
      </div>

      <div className="mn-card__body">
        <div className="mn-card__top-row">
          <h3 className="mn-card__name">{item.name}</h3>
          <span className="mn-card__price">₱{Number(item.price).toFixed(0)}</span>
        </div>
        {item.description && <p className="mn-card__desc">{item.description}</p>}

        <div className="mn-card__footer">
          <span className={`mn-badge${item.is_available ? ' mn-badge--ok' : ' mn-badge--off'}`}>
            {item.is_available ? 'Available' : 'Unavailable'}
          </span>
          <Toggle checked={item.is_available} onChange={() => onToggle(item.id, item.is_available)} disabled={toggling === item.id} label="Toggle availability" />
        </div>

        <div className="mn-card__actions">
          <button className="mn-btn mn-btn--secondary mn-btn--sm mn-card__edit" onClick={() => onEdit(item)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          <button className="mn-btn mn-btn--ghost mn-btn--sm mn-card__del" onClick={() => onDelete(item)} aria-label={`Delete ${item.name}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/><path d="M8 6V4h8v2"/>
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Table row (desktop) ──────────────────────────────────────────────────────
function MenuItemRow({ item, onEdit, onDelete, onToggle, toggling }) {
  return (
    <tr className="mn-table__row">
      <td className="mn-table__td">
        <div className="mn-table__item-cell">
          <div className="mn-table__thumb">
            {item.image_url
              ? <img src={item.image_url} alt="" className="mn-table__thumb-img" loading="lazy" />
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><polyline points="21 15 16 10 5 21"/>
                </svg>
            }
          </div>
          <div>
            <p className="mn-table__name">{item.name}</p>
            {item.description && <p className="mn-table__desc">{item.description}</p>}
          </div>
        </div>
      </td>
      <td className="mn-table__td">
        <span className="mn-badge mn-badge--cat">{item.category_name}</span>
      </td>
      <td className="mn-table__td mn-table__td--bold">₱{Number(item.price).toFixed(0)}</td>
      <td className="mn-table__td">
        <Toggle checked={item.is_available} onChange={() => onToggle(item.id, item.is_available)} disabled={toggling === item.id} label="Toggle availability" />
      </td>
      <td className="mn-table__td mn-table__td--right">
        <div className="mn-table__actions">
          <button className="mn-btn mn-btn--ghost mn-btn--xs" onClick={() => onEdit(item)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          <button className="mn-btn mn-btn--ghost mn-btn--xs mn-btn--del" onClick={() => onDelete(item)} aria-label={`Delete ${item.name}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/><path d="M8 6V4h8v2"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MenuPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterAvail, setFilterAvail] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [modal, setModal] = useState(null);      // null | { mode: 'add'|'edit', item? }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toggling, setToggling] = useState(null); // item id being toggled
  const { msg: toastMsg, type: toastType, show: showToast } = useToast();

  const fetchAll = useCallback(async () => {
    try {
      setError('');
      const [menuRes, invRes] = await Promise.all([staffMenuAPI.getAll(), inventoryAPI.getAll()]);
      setCategories(menuRes.data.categories);
      setItems(menuRes.data.items);
      setInventoryItems(invRes.data.items || []);
    } catch { setError('Failed to load menu. Please try again.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Real-time socket sync
  useEffect(() => {
    const socket = getSocket();
    const handler = (updated) => setItems((prev) => prev.map((i) => i.id === updated.id ? { ...i, ...updated } : i));
    socket.on('menu_update', handler);
    return () => socket.off('menu_update', handler);
  }, []);

  const stats = useMemo(() => ({
    total: items.length,
    available: items.filter((i) => i.is_available).length,
    unavailable: items.filter((i) => !i.is_available).length,
    categories: categories.length,
  }), [items, categories]);

  const filtered = useMemo(() => {
    let r = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    if (filterCat !== 'all') r = r.filter((i) => String(i.category_id) === filterCat);
    if (filterAvail === 'available') r = r.filter((i) => i.is_available);
    if (filterAvail === 'unavailable') r = r.filter((i) => !i.is_available);
    return r;
  }, [items, search, filterCat, filterAvail]);

  const handleSave = async (payload, id) => {
    if (id) {
      await staffMenuAPI.update(id, payload);
      showToast('Menu item updated.');
    } else {
      await staffMenuAPI.create(payload);
      showToast('Menu item added.');
    }
    await fetchAll();
  };

  const handleToggle = async (id, current) => {
    setToggling(id);
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, is_available: !current } : i));
    try {
      await staffMenuAPI.setAvailability(id, !current);
      showToast(!current ? 'Item marked available.' : 'Item marked unavailable.');
    } catch {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, is_available: current } : i));
      showToast('Failed to update availability.', 'error');
    } finally { setToggling(null); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await staffMenuAPI.remove(deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      showToast('Item removed.');
    } catch { showToast('Failed to remove item.', 'error'); }
    finally { setDeleteTarget(null); }
  };

  if (error && !loading) return (
    <div className="mn-error">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <p>{error}</p>
      <button className="mn-btn mn-btn--primary" onClick={fetchAll}>Try again</button>
    </div>
  );

  return (
    <div className="mn-root">
      {toastMsg && <div className={`mn-toast mn-toast--${toastType}`} role="status" aria-live="polite">{toastMsg}</div>}

      {/* Header */}
      <div className="mn-page-header">
        <div>
          <h1 className="mn-page-title">Menu Management</h1>
          <p className="mn-page-sub">Add, edit, and manage item availability in real time</p>
        </div>
        <div className="mn-page-header__actions">
          <button className="mn-btn mn-btn--ghost mn-btn--icon" onClick={fetchAll} aria-label="Refresh">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M8 16H3v5"/>
            </svg>
          </button>
          <button className="mn-btn mn-btn--primary" onClick={() => setModal({ mode: 'add' })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Item
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mn-stats">
        {[
          { label: 'Total Items', value: stats.total, mod: '' },
          { label: 'Available', value: stats.available, mod: '--ok' },
          { label: 'Unavailable', value: stats.unavailable, mod: '--muted' },
          { label: 'Categories', value: stats.categories, mod: '' },
        ].map(({ label, value, mod }) => (
          <div key={label} className="mn-stat-card">
            <span className="mn-stat-card__label">{label}</span>
            <span className={`mn-stat-card__value${mod}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mn-filters">
        <div className="mn-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu items…" className="mn-search__input" aria-label="Search menu items" />
        </div>

        <div className="mn-filters__selects">
          <select className="mn-select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
          <select className="mn-select" value={filterAvail} onChange={(e) => setFilterAvail(e.target.value)} aria-label="Filter by availability">
            <option value="all">All status</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>

          {/* View toggle — desktop only */}
          <div className="mn-view-toggle" role="group" aria-label="View mode">
            {['grid', 'table'].map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)} className={`mn-view-toggle__btn${viewMode === mode ? ' mn-view-toggle__btn--active' : ''}`} aria-pressed={viewMode === mode} aria-label={`${mode} view`}>
                {mode === 'grid'
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                }
                <span className="mn-view-toggle__label">{mode}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content: always cards on mobile, grid or table on desktop */}
      {loading ? (
        <div className="mn-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="mn-skeleton-card" aria-hidden="true" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mn-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/>
            <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
          </svg>
          <p>{search ? 'No items match your search.' : 'No menu items yet.'}</p>
          {!search && (
            <button className="mn-btn mn-btn--primary" onClick={() => setModal({ mode: 'add' })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add first item
            </button>
          )}
        </div>
      ) : viewMode === 'grid' || window.innerWidth < 1024 ? (
        // Mobile always grid; desktop follows viewMode
        <div className="mn-grid">
          {filtered.map((item) => (
            <MenuItemCard key={item.id} item={item} onEdit={(i) => setModal({ mode: 'edit', item: i })} onDelete={setDeleteTarget} onToggle={handleToggle} toggling={toggling} />
          ))}
        </div>
      ) : (
        <div className="mn-table-wrap">
          <table className="mn-table" aria-label="Menu items">
            <thead>
              <tr>
                <th className="mn-table__th">Item</th>
                <th className="mn-table__th">Category</th>
                <th className="mn-table__th">Price</th>
                <th className="mn-table__th">Availability</th>
                <th className="mn-table__th mn-table__th--right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <MenuItemRow key={item.id} item={item} onEdit={(i) => setModal({ mode: 'edit', item: i })} onDelete={setDeleteTarget} onToggle={handleToggle} toggling={toggling} />
              ))}
            </tbody>
          </table>
          <div className="mn-table__footer">
            Showing <strong>{filtered.length}</strong> of <strong>{items.length}</strong> items
          </div>
        </div>
      )}

      {/* Modals */}
      {modal && (
        <MenuItemModal
          item={modal.item}
          categories={categories}
          inventoryItems={inventoryItems}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog item={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
      )}
    </div>
  );
}