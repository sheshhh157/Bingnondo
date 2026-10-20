import { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import { Spinner, Btn, Field, TextInput, PageHeader, Modal, ConfirmModal } from './adminShared';
import { useAdminToast } from './useAdminToast';
import '../../styles/AdminPage.css';

const PlusIcon = ({ size = 13, stroke = 2.5 } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M10 11v6M14 11v6"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const TagIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><circle cx="7" cy="7" r="1.2"/>
  </svg>
);

const GridIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const ChevronIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

// ── Section wrapper ──────────────────────────────────────────────────
function Section({ title, subtitle, action, children }) {
  return (
    <div className="ap-card">
      <div className="ap-card__head">
        <div>
          <div className="ap-card__title">{title}</div>
          {subtitle && <div className="ap-card__sub">{subtitle}</div>}
        </div>
        {action}
      </div>
      <div className="ap-card__body">{children}</div>
    </div>
  );
}

// ── Business Hours ────────────────────────────────────────────────────
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function BusinessHours({ hours, onChange }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {DAYS.map(day => {
        const slot = hours[day] || { open:'08:00', close:'22:00', closed:false };
        return (
          <div key={day} className="ap-hours-row">
            <div className="ap-hours-day">{day.slice(0,3)}</div>
            <input type="time" disabled={slot.closed} value={slot.open}
              onChange={e=>onChange(day,{...slot,open:e.target.value})}
              aria-label={`${day} open`}
              className="ap-input" style={{opacity:slot.closed?0.38:1}}/>
            <input type="time" disabled={slot.closed} value={slot.close}
              onChange={e=>onChange(day,{...slot,close:e.target.value})}
              aria-label={`${day} close`}
              className="ap-input" style={{opacity:slot.closed?0.38:1}}/>
            <label className="ap-hours-check">
              <input type="checkbox" checked={slot.closed}
                onChange={e=>onChange(day,{...slot,closed:e.target.checked})}/>
              Closed
            </label>
          </div>
        );
      })}
    </div>
  );
}

// ── Category manager ─────────────────────────────────────────────────
// Full CRUD over the master category list: add, inline rename, delete, and
// toggle which global variant groups the category offers.
// categories: [{ id, name, item_count, variant_group_ids }]

// Compact disclosure replacing the old chip row: collapses to a one-line
// summary ("3 of 5 variants") and expands inline to a toggle checklist, so a
// category row stays short no matter how many variant groups exist.
function CategoryVariantSelect({ groups, selectedIds, onToggle, disabled, categoryName }) {
  const [open, setOpen] = useState(false);
  const selected = selectedIds || [];
  const count = groups.filter(g => selected.includes(g.id)).length;
  const summary = groups.length === 0
    ? 'No variants'
    : count === 0
      ? 'None selected'
      : `${count} of ${groups.length} variant${groups.length === 1 ? '' : 's'}`;
  const panelId = `sys-var-panel-${categoryName.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className={`sys-var-select${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="sys-var-select__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); } }}
      >
        <span className="sys-var-select__label">Variant groups</span>
        <span className="sys-var-select__summary">{summary}</span>
        <span className="sys-var-select__chevron"><ChevronIcon /></span>
      </button>
      <div className="sys-var-select__panel" id={panelId} role="listbox" aria-multiselectable="true">
        <div className="sys-var-select__panel-inner">
          {groups.map(g => {
            const on = selected.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                role="option"
                aria-selected={on}
                className={`sys-var-opt${on ? ' is-on' : ''}`}
                disabled={disabled}
                onClick={() => onToggle(g.id, on)}
                title={on ? `${g.name} is offered — click to hide` : `${g.name} is not offered — click to offer`}
              >
                <span className="sys-var-opt__box">{on && <CheckIcon />}</span>
                <span className="sys-var-opt__name">{g.name}</span>
                <span className="sys-var-opt__meta">{g.max_options} option{g.max_options === 1 ? '' : 's'} max</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CategoryManager({ categories, variantGroups, onRemove, onRename, onToggleVariants, busyToggleId }) {
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function startEdit(c) {
    setEditingId(c.id);
    setEditVal(c.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditVal('');
  }

  async function commitEdit(c) {
    const t = editVal.trim();
    if (!t) return;
    if (t === c.name) { cancelEdit(); return; }
    setBusyId(c.id);
    const ok = await onRename(c, t);
    setBusyId(null);
    if (ok !== false) cancelEdit();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await onRemove(deleteTarget);
    setDeleting(false);
    if (ok !== false) setDeleteTarget(null);
  }

  return (
    <div className="ap-list">
      {categories.length === 0
        ? (
          <div className="sys-empty">
            <span className="sys-empty__icon"><GridIcon /></span>
            <p className="sys-empty__title">No categories yet</p>
            <p className="sys-empty__text">Use Add category to create the first one, then toggle which variant groups it offers.</p>
          </div>
        )
        : (
          <div className="ap-list-rows">
            {categories.map(c => editingId === c.id
              ? (
                <form key={c.id} className="ap-list-row ap-list-row--editing"
                  onSubmit={e=>{e.preventDefault(); commitEdit(c);}}>
                  <div className="ap-input-row" style={{flex:1}}>
                    <input className="ap-input" value={editVal}
                      onChange={e=>setEditVal(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Escape'){ e.preventDefault(); cancelEdit(); } }}
                      maxLength={100} autoFocus disabled={busyId===c.id}
                      aria-label={`Rename ${c.name}`}/>
                  </div>
                  <Btn variant="gold" size="sm" type="submit"
                    disabled={busyId===c.id || !editVal.trim()} loading={busyId===c.id}>Save</Btn>
                  <Btn variant="ghost" size="sm"
                    onClick={cancelEdit} disabled={busyId===c.id}>Cancel</Btn>
                </form>
              )
              : (
                <div key={c.id} className="ap-list-row ap-list-row--category">
                  <div className="ap-list-row__info">
                    <div className="ap-cat-head">
                      <span className="ap-list-row__name">{c.name}</span>
                      <span className="sys-pill">{c.item_count} item{c.item_count === 1 ? '' : 's'}</span>
                    </div>
                    {variantGroups.length === 0
                      ? <p className="sys-hint-inline">Add a variant group above to offer it here.</p>
                      : (
                        <CategoryVariantSelect
                          groups={variantGroups}
                          selectedIds={c.variant_group_ids}
                          onToggle={(gid, on) => onToggleVariants(c, gid, !on)}
                          disabled={busyToggleId === c.id}
                          categoryName={c.name}
                        />
                      )}
                  </div>
                  <div className="ap-list-row__actions">
                    <button type="button" className="ap-icon-btn"
                      onClick={()=>startEdit(c)} disabled={busyId===c.id}
                      aria-label={`Rename ${c.name}`} title={`Rename ${c.name}`}><PencilIcon /></button>
                    <button type="button" className="ap-icon-btn ap-icon-btn--danger"
                      onClick={()=>setDeleteTarget(c)}
                      disabled={busyId===c.id || c.item_count > 0}
                      aria-label={`Delete ${c.name}`}
                      title={c.item_count > 0
                        ? 'Reassign or delete its menu items first'
                        : `Delete ${c.name}`}><TrashIcon /></button>
                  </div>
                </div>
              ))}
          </div>
        )
      }
      <ConfirmModal
        open={!!deleteTarget}
        onClose={()=>setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete category"
        message={`Delete the "${deleteTarget?.name}" category? This cannot be undone. This action is logged.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}

// ── Add category modal ───────────────────────────────────────────────
function AddCategoryModal({ open, onClose, onAdd }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const t = name.trim();
    if (!t || saving) return;
    setSaving(true);
    const ok = await onAdd(t);
    setSaving(false);
    if (ok !== false) { setName(''); onClose(); }
  }

  function close() {
    if (saving) return;
    setName('');
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Add category" width={400}>
      <form onSubmit={submit}>
        <Field label="Category name" id="cat-name">
          <TextInput id="cat-name" value={name} maxLength={100}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Rice Meals" autoFocus />
        </Field>
        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={close} disabled={saving}>Cancel</Btn>
          <Btn variant="gold" type="submit" loading={saving} disabled={!name.trim()}>Add category</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Item variants (reusable variant groups) ──────────────────────────
// A group is just a name and a maximum number of options. Option names and
// prices are entered per menu item in Menu Management.
function validateVariantGroup(name, maxOptions) {
  if (!name) return 'Variant name is required.';
  if (name.length > 100) return 'Variant names must be 100 characters or fewer.';
  if (!Number.isInteger(maxOptions) || maxOptions < 1 || maxOptions > 10) {
    return 'Max options must be a whole number between 1 and 10.';
  }
  return null;
}

function VariantGroupList({ groups, usageOf, onEdit, onDelete, flashId }) {
  if (groups.length === 0) {
    return (
      <div className="sys-empty">
        <span className="sys-empty__icon"><TagIcon /></span>
        <p className="sys-empty__title">No variants yet</p>
        <p className="sys-empty__text">
          Add groups like Flavor or Solo / Sharing. Each is just a name and a maximum option count.
        </p>
      </div>
    );
  }
  return (
    <div className="ap-list-rows">
      {groups.map(g => {
        const used = usageOf(g.id);
        return (
          <div key={g.id} className={`ap-list-row ap-list-row--group${g.id === flashId ? ' is-flash' : ''}`}>
            <div className="ap-list-row__info">
              <span className="ap-list-row__name">{g.name}</span>
              <span className="sys-pill">{g.max_options} option{g.max_options === 1 ? '' : 's'} max</span>
              <span className="sys-usage">
                {used === 0
                  ? 'Not linked to a category'
                  : `Used by ${used} categor${used === 1 ? 'y' : 'ies'}`}
              </span>
            </div>
            <div className="ap-list-row__actions">
              <button type="button" className="ap-icon-btn" onClick={()=>onEdit(g)}
                aria-label={`Edit ${g.name}`} title={`Edit ${g.name}`}><PencilIcon /></button>
              <button type="button" className="ap-icon-btn ap-icon-btn--danger" onClick={()=>onDelete(g)}
                aria-label={`Delete ${g.name}`} title={`Delete ${g.name}`}><TrashIcon /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VariantGroupModal({ group, onClose, onSaved, toast }) {
  const [name, setName]             = useState(group?.name ?? '');
  const [maxOptions, setMaxOptions] = useState(String(group?.max_options ?? 3));
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  async function save(e) {
    e.preventDefault();
    const cleanName = name.trim();
    const maxNum = Number(maxOptions);
    const err = validateVariantGroup(cleanName, maxNum);
    if (err) { setError(err); return; }
    setSaving(true); setError('');
    try {
      const res = group
        ? await adminAPI.updateVariantGroup(group.id, cleanName, maxNum)
        : await adminAPI.createVariantGroup(cleanName, maxNum);
      const saved = res.data?.data ?? res.data;
      onSaved(saved);
      toast.success(group ? `Variant "${saved.name}" saved.` : `Variant "${saved.name}" created.`);
      onClose();
    } catch (e2) {
      setError(e2?.response?.data?.message || e2?.message || 'Failed to save variant.');
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={group ? `Edit variant — ${group.name}` : 'Add variant'} width={440}>
      <form onSubmit={save}>
        <Field label="Variant name" id="vg-name">
          <TextInput id="vg-name" value={name} maxLength={100}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Flavor, Solo / Sharing, Hot / Cold" autoFocus />
        </Field>
        <Field label="Max options" id="vg-max">
          <input id="vg-max" className="ap-input" type="number" min={1} max={10} step={1}
            value={maxOptions}
            onChange={e => setMaxOptions(e.target.value)}
            aria-label="Maximum number of options" />
        </Field>
        <p className="ap-variant-note">
          Option names and prices are entered per menu item in Menu Management — this group only sets
          the maximum number of options an item may offer.
        </p>
        {error && <p className="ap-variant-error" role="alert">{error}</p>}
        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="gold" type="submit" loading={saving}>{group ? 'Save variant' : 'Add variant'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Notification visibility ───────────────────────────────────────────
const NOTIFICATION_CATEGORY_META = [
  { id: 'orders',     label: 'Orders',          desc: 'New and cancelled orders' },
  { id: 'payments',   label: 'Payments',        desc: 'GCash receipts uploaded, verified, or rejected' },
  { id: 'deliveries', label: 'Deliveries',      desc: 'Rider assignments and completed deliveries' },
  { id: 'inventory',  label: 'Inventory',       desc: 'Low/out-of-stock items, restocks, and adjustments' },
  { id: 'kitchen',    label: 'Kitchen',         desc: 'Buzzer alerts triggered by the kitchen device' },
  { id: 'customers',  label: 'Customers',       desc: 'Violations flagged and restriction updates' },
  { id: 'system',     label: 'Staff & system',  desc: 'Administrative actions and settings changes' },
];

function NotificationSettings({ categories, onChange }) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:2}}>
      {NOTIFICATION_CATEGORY_META.map(c => (
        <label key={c.id} className="ap-switch-row">
          <span className="ap-switch-row__text">
            <span className="ap-switch-row__label">{c.label}</span>
            <span className="ap-switch-row__desc">{c.desc}</span>
          </span>
          <span className="ap-switch">
            <input type="checkbox"
              checked={categories[c.id] ?? true}
              onChange={e=>onChange(c.id, e.target.checked)}
              aria-label={`Show ${c.label} notifications`}/>
            <span className="ap-switch__track" aria-hidden="true"><span className="ap-switch__thumb"/></span>
          </span>
        </label>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────
export default function SystemSettings() {
  const { toast } = useAdminToast();
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [hours, setHours]           = useState({});
  const [categories, setCategories] = useState([]);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [variantGroups, setVariantGroups] = useState([]);
  const [variantFlashId, setVariantFlashId] = useState(null);
  const [variantModal, setVariantModal] = useState(null);   // null | { group: null | group }
  const [deleteVariant, setDeleteVariant] = useState(null);
  const [deletingVariant, setDeletingVariant] = useState(false);
  const [busyToggleId, setBusyToggleId] = useState(null);
  const [notifCats, setNotifCats]   = useState({});
  const [savingNotifs, setSavingNotifs] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [hoursRes, catsRes, notifRes, variantsRes] = await Promise.all([
        adminAPI.getBusinessHours(),
        adminAPI.listCategories(),
        adminAPI.getNotificationSettings(),
        adminAPI.listVariantGroups(),
      ]);
      const hoursData = hoursRes.data?.data ?? hoursRes.data ?? [];
      const catsData  = catsRes.data?.data  ?? catsRes.data  ?? [];
      const notifData = notifRes.data?.data ?? notifRes.data ?? {};
      // Convert array from backend [ {day_of_week, day_label, open_time, close_time, is_closed} ]
      // to the shape BusinessHours component expects: { Monday: { open, close, closed } }
      const hoursMap = {};
      hoursData.forEach(row => {
        hoursMap[row.day_label] = {
          open:   row.open_time  ? row.open_time.slice(0,5)  : '08:00',
          close:  row.close_time ? row.close_time.slice(0,5) : '22:00',
          closed: row.is_closed,
        };
      });
      setHours(hoursMap);
      setCategories(catsData.map(c => ({
        id: c.id,
        name: c.name,
        item_count: c.item_count ?? 0,
        variant_group_ids: c.variant_group_ids ?? [],
      })));
      setVariantGroups(variantsRes.data?.data ?? variantsRes.data ?? []);
      setNotifCats(notifData.categories ?? {});
    } catch { toast.error('Failed to load settings.'); }
    finally { setLoading(false); }
  }, [toast]);

  // Fetch-on-mount: the sync setLoading inside `loadAll` is intentional.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(()=>{ loadAll(); },[loadAll]);

  async function saveHours() {
    setSaving(true);
    try {
      // Convert local { Monday: { open, close, closed } } back to backend format
      const DAY_TO_DOW = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };
      const payload = Object.entries(hours).map(([day, slot]) => ({
        day_of_week: DAY_TO_DOW[day],
        open_time:   slot.closed ? null : slot.open,
        close_time:  slot.closed ? null : slot.close,
        is_closed:   slot.closed,
      }));
      await adminAPI.saveBusinessHours(payload);
      toast.success('Business hours saved.');
    } catch(err) { toast.error(err?.response?.data?.message || err.message || 'Save failed.'); }
    finally { setSaving(false); }
  }

  async function saveNotifications() {
    setSavingNotifs(true);
    try {
      const payload = Object.fromEntries(
        NOTIFICATION_CATEGORY_META.map(c => [c.id, notifCats[c.id] ?? true])
      );
      const res = await adminAPI.saveNotificationSettings(payload);
      const saved = res.data?.data?.categories ?? payload;
      setNotifCats(saved);
      toast.success('Notification settings saved.');
    } catch(err) { toast.error(err?.response?.data?.message || err.message || 'Save failed.'); }
    finally { setSavingNotifs(false); }
  }

  async function handleAddCategory(name) {
    try {
      const res = await adminAPI.createCategory(name);
      const cat = res.data?.data ?? res.data;
      setCategories(prev => [...prev, { id: cat.id, name: cat.name, item_count: 0, variant_group_ids: [] }]);
      toast.success(`Category "${cat.name}" added.`);
      return true;
    } catch(err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to add category.');
      return false;
    }
  }

  async function handleUpdateCategory(cat, name) {
    try {
      const res = await adminAPI.updateCategory(cat.id, name);
      const updated = res.data?.data ?? res.data ?? { id: cat.id, name };
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name: updated.name } : c));
      toast.success(`Category renamed to "${updated.name}".`);
      return true;
    } catch(err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to update category.');
      return false;
    }
  }

  async function handleToggleCategoryVariants(cat, groupId, on) {
    const current = cat.variant_group_ids || [];
    const next = on
      ? [...current, groupId]
      : current.filter(id => id !== groupId);

    setBusyToggleId(cat.id);
    setCategories(prev => prev.map(c => (
      c.id === cat.id ? { ...c, variant_group_ids: next } : c
    )));
    try {
      const res = await adminAPI.setCategoryVariants(cat.id, next);
      const updated = res.data?.data ?? res.data;
      if (updated?.variant_group_ids) {
        setCategories(prev => prev.map(c => (
          c.id === cat.id ? { ...c, variant_group_ids: updated.variant_group_ids } : c
        )));
      }
    } catch (err) {
      // Revert on failure
      setCategories(prev => prev.map(c => (
        c.id === cat.id ? { ...c, variant_group_ids: current } : c
      )));
      toast.error(err?.response?.data?.message || err.message || 'Failed to update category variants.');
    } finally {
      setBusyToggleId(null);
    }
  }

  function handleVariantSaved(saved) {
    setVariantGroups(prev => (
      prev.some(g => g.id === saved.id)
        ? prev.map(g => (g.id === saved.id ? saved : g))
        : [...prev, saved]
    ));
    setVariantFlashId(saved.id);
    setTimeout(() => setVariantFlashId(cur => (cur === saved.id ? null : cur)), 1200);
  }

  async function handleDeleteVariant() {
    if (!deleteVariant) return;
    setDeletingVariant(true);
    try {
      await adminAPI.deleteVariantGroup(deleteVariant.id);
      setVariantGroups(prev => prev.filter(g => g.id !== deleteVariant.id));
      setCategories(prev => prev.map(c => ({
        ...c,
        variant_group_ids: (c.variant_group_ids || []).filter(id => id !== deleteVariant.id),
      })));
      toast.success(`Variant "${deleteVariant.name}" removed.`);
      setDeleteVariant(null);
    } catch(err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to remove variant.');
    } finally { setDeletingVariant(false); }
  }

  async function handleRemoveCategory(cat) {
    try {
      await adminAPI.deleteCategory(cat.id);
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      toast.success(`Category "${cat.name}" removed.`);
      return true;
    } catch(err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to remove category.');
      return false;
    }
  }

  if (loading) return <div className="ap-page sys-page"><div className="ap-loading"><Spinner size={24}/></div></div>;

  return (
    <>
      <div className="ap-page sys-page">

        <PageHeader
          title="System Settings"
          sub="Store-level configuration: operating hours, the master category and variant lists, and notifications."
        />

        {/* Business Hours */}
        <Section title="Business hours" subtitle="Controls when online ordering is available"
          action={<Btn variant="gold" size="sm" onClick={saveHours} loading={saving}>Save hours</Btn>}>
          <BusinessHours hours={hours} onChange={(day,slot)=>setHours(h=>({...h,[day]:slot}))}/>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" subtitle="Choose which system events appear in the Overview notification bell"
          action={<Btn variant="gold" size="sm" onClick={saveNotifications} loading={savingNotifs}>Save notifications</Btn>}>
          <NotificationSettings
            categories={notifCats}
            onChange={(id, checked)=>setNotifCats(v=>({...v,[id]:checked}))}
          />
        </Section>

        {/* Menu categories & variants */}
        <Section
          title="Menu categories & variants"
          subtitle="Define variant groups once, attach them to categories, then set the option names and prices per item in Menu Management."
        >
          <div className="sys-mv-grid">
            <div className="sys-subsection">
              <div className="sys-subsection__head">
                <div className="sys-subsection__head-title">
                  <span className="sys-subsection__title">Item variants</span>
                  <span className="sys-subsection__count">{variantGroups.length}</span>
                </div>
                <Btn variant="gold" size="sm" icon={<PlusIcon />}
                  onClick={()=>setVariantModal({ group: null })}>Add variant</Btn>
              </div>
              <p className="sys-subsection__hint">
                Each group is a name and a maximum number of options. Option names
                and prices are entered per menu item.
              </p>
                  <VariantGroupList
                    groups={variantGroups}
                    usageOf={(id)=>categories.filter(c => (c.variant_group_ids || []).includes(id)).length}
                    onEdit={(g)=>setVariantModal({ group: g })}
                    onDelete={setDeleteVariant}
                    flashId={variantFlashId}
                  />
            </div>

            <div className="sys-subsection">
              <div className="sys-subsection__head">
                <div className="sys-subsection__head-title">
                  <span className="sys-subsection__title">Categories</span>
                  <span className="sys-subsection__count">{categories.length}</span>
                </div>
                <Btn variant="gold" size="sm" icon={<PlusIcon />}
                  onClick={()=>setAddCatOpen(true)}>Add category</Btn>
              </div>
              <p className="sys-subsection__hint">
                Click a variant chip to offer or hide that group for the category.
              </p>
              <CategoryManager
                categories={categories}
                variantGroups={variantGroups}
                onRename={handleUpdateCategory}
                onRemove={handleRemoveCategory}
                onToggleVariants={handleToggleCategoryVariants}
                busyToggleId={busyToggleId}
              />
            </div>
          </div>
        </Section>
      </div>

      <AddCategoryModal
        open={addCatOpen}
        onClose={()=>setAddCatOpen(false)}
        onAdd={handleAddCategory}
      />

      {variantModal && (
        <VariantGroupModal
          group={variantModal.group}
          onClose={()=>setVariantModal(null)}
          onSaved={handleVariantSaved}
          toast={toast}
        />
      )}

      <ConfirmModal
        open={!!deleteVariant}
        onClose={()=>setDeleteVariant(null)}
        onConfirm={handleDeleteVariant}
        loading={deletingVariant}
        title="Delete variant"
        message={`Delete the "${deleteVariant?.name}" variant? Its options are removed too. This action is logged.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </>
  );
}
