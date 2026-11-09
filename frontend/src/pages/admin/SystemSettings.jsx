import { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI, uploadAPI } from '../../services/api';
import { Spinner, Btn, Field, TextInput, PasswordInput, PageHeader, Modal, ConfirmModal, Badge } from './adminShared';
import { useAdminToast } from './useAdminToast';
import {
  LIMITS,
  validateShortName,
  validateText,
  validateAmount,
  sanitizeProductName,
  sanitizeInteger,
  sanitizeDecimal,
} from '../../utils/validation';
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

  // Real-time rename error (excludes the row being renamed from duplicate check).
  const renameError = validateShortName(editVal, {
    label: 'Category name',
    max: LIMITS.shortName,
    list: categories,
    getValue: (c) => c.name,
    excludeId: editingId,
  });

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
    if (!t || renameError) return;
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
                    <input
                      className={`ap-input${renameError ? ' ap-input--error' : ''}`}
                      value={editVal}
                      onChange={e => setEditVal(sanitizeProductName(e.target.value, LIMITS.shortName))}
                      onKeyDown={e=>{ if(e.key==='Escape'){ e.preventDefault(); cancelEdit(); } }}
                      maxLength={LIMITS.shortName}
                      autoFocus
                      disabled={busyId===c.id}
                      aria-label={`Rename ${c.name}`}
                      aria-describedby={renameError ? `cat-rename-err-${c.id}` : undefined}
                    />
                    {renameError && (
                      <p id={`cat-rename-err-${c.id}`} className="ap-field-error" role="alert"
                        style={{fontSize:'0.75rem', color:'var(--color-danger)', marginTop:3}}>
                        {renameError}
                      </p>
                    )}
                  </div>
                  <Btn variant="gold" size="sm" type="submit"
                    disabled={busyId===c.id || !editVal.trim() || !!renameError}
                    loading={busyId===c.id}>Save</Btn>
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
function AddCategoryModal({ open, onClose, onAdd, categories = [] }) {
  const [name, setName]       = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving]   = useState(false);

  // Real-time derived error.
  const liveError = validateShortName(name, {
    label: 'Category name',
    max: LIMITS.shortName,
    list: categories,
    getValue: (c) => c.name,
  });

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (liveError || saving) return;
    setSaving(true);
    const ok = await onAdd(name.trim());
    setSaving(false);
    if (ok !== false) { setName(''); setTouched(false); onClose(); }
  }

  function close() {
    if (saving) return;
    setName(''); setTouched(false);
    onClose();
  }

  const displayError = touched ? liveError : '';

  return (
    <Modal open={open} onClose={close} title="Add category" width={400}>
      <form onSubmit={submit}>
        <Field label="Category name" id="cat-name" error={displayError}
          hint={`Letters, digits, spaces allowed · max ${LIMITS.shortName} chars`}>
          <TextInput id="cat-name" value={name} maxLength={LIMITS.shortName}
            onChange={e => { setName(sanitizeProductName(e.target.value, LIMITS.shortName)); setTouched(true); }}
            onBlur={() => setTouched(true)}
            error={displayError}
            placeholder="e.g. Rice Meals" autoFocus />
        </Field>
        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={close} disabled={saving}>Cancel</Btn>
          <Btn variant="gold" type="submit" loading={saving}>Add category</Btn>
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

function VariantGroupModal({ group, onClose, onSaved, toast, variantGroups = [] }) {
  const [name, setName]             = useState(group?.name ?? '');
  const [maxOptions, setMaxOptions] = useState(String(group?.max_options ?? 3));
  const [touched, setTouched]       = useState({});
  const [saving, setSaving]         = useState(false);
  const [serverError, setServerError] = useState('');

  // Real-time derived errors.
  const maxNum = Number(maxOptions);
  const liveErrors = {
    name: validateShortName(name, {
      label: 'Variant name',
      max: LIMITS.shortName,
      list: variantGroups,
      getValue: (g) => g.name,
      excludeId: group?.id ?? null,
    }),
    maxOptions: (() => {
      const raw = maxOptions.trim();
      if (!raw) return 'Max options is required.';
      if (!/^\d+$/.test(raw)) return 'Max options must be a whole number.';
      if (maxNum < 1 || maxNum > 10) return 'Max options must be between 1 and 10.';
      return '';
    })(),
  };

  const touch = (k) => setTouched(t => ({ ...t, [k]: true }));
  const err   = (k) => (touched[k] ? liveErrors[k] : '');

  async function save(e) {
    e.preventDefault();
    setTouched({ name: true, maxOptions: true });
    if (Object.values(liveErrors).some(Boolean)) return;
    setSaving(true); setServerError('');
    try {
      const res = group
        ? await adminAPI.updateVariantGroup(group.id, name.trim(), maxNum)
        : await adminAPI.createVariantGroup(name.trim(), maxNum);
      const saved = res.data?.data ?? res.data;
      onSaved(saved);
      toast.success(group ? `Variant "${saved.name}" saved.` : `Variant "${saved.name}" created.`);
      onClose();
    } catch (e2) {
      setServerError(e2?.response?.data?.message || e2?.message || 'Failed to save variant.');
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title={group ? `Edit variant — ${group.name}` : 'Add variant'} width={440}>
      <form onSubmit={save}>
        <Field label="Variant name" id="vg-name" error={err('name')}
          hint={`Letters, digits, spaces allowed · max ${LIMITS.shortName} chars`}>
          <TextInput id="vg-name" value={name} maxLength={LIMITS.shortName}
            onChange={e => { setName(sanitizeProductName(e.target.value, LIMITS.shortName)); touch('name'); }}
            onBlur={() => touch('name')}
            error={err('name')}
            placeholder="e.g. Flavor, Solo / Sharing, Hot / Cold" autoFocus />
        </Field>
        <Field label="Max options" id="vg-max" error={err('maxOptions')}
          hint="Whole number between 1 and 10 — numbers only">
          <TextInput id="vg-max" value={maxOptions}
            onChange={e => { setMaxOptions(sanitizeInteger(e.target.value, 2)); touch('maxOptions'); }}
            onBlur={() => touch('maxOptions')}
            error={err('maxOptions')}
            inputMode="numeric"
            aria-label="Maximum number of options" />
        </Field>
        <p className="ap-variant-note">
          Option names and prices are entered per menu item in Menu Management — this group only sets
          the maximum number of options an item may offer.
        </p>
        {serverError && <p className="ap-variant-error" role="alert">{serverError}</p>}
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

// ── Payment QR codes ─────────────────────────────────────────────────
// The image goes straight to Cloudinary; only its URL/public_id are stored
// with the account name and number in the database.
function QrCodeModal({ code, onClose, onSaved, toast }) {
  const isEdit = !!code;
  const [name, setName] = useState(code?.name ?? '');
  const [number, setNumber] = useState(code?.number ?? '');
  const [isActive, setIsActive] = useState(code ? !!code.is_active : true);
  const [displayOrder, setDisplayOrder] = useState(String(code?.display_order ?? 0));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(code?.image_url ?? '');
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const objectUrlRef = useRef(null);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const liveErrors = {
    name: validateText(name, { label: 'Account name', max: 100 }),
    number: validateText(number, { label: 'Account number', max: 50 }),
    image: preview ? '' : 'Upload a QR code image.',
    displayOrder: (() => {
      const raw = displayOrder.trim();
      if (!raw) return '';
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 9999) return 'Display order must be between 0 and 9999.';
      return '';
    })(),
  };

  const touch = (k) => setTouched(t => ({ ...t, [k]: true }));
  const err = (k) => (touched[k] ? liveErrors[k] : '');

  function pickFile(f) {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setServerError('Only image files are allowed (JPG, PNG, WEBP).');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setServerError('Image is too large. Maximum size is 5MB.');
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(f);
    objectUrlRef.current = url;
    setFile(f);
    setPreview(url);
    setServerError('');
    touch('image');
  }

  async function submit(e) {
    e.preventDefault();
    setTouched({ name: true, number: true, image: true, displayOrder: true });
    if (Object.values(liveErrors).some(Boolean)) return;

    setSaving(true);
    setServerError('');

    let uploadedPublicId = null;
    try {
      let imageUrl = code?.image_url ?? null;
      let imagePublicId = code?.image_public_id ?? null;

      if (file) {
        const { data } = await uploadAPI.uploadQrImage(file);
        imageUrl = data.url;
        imagePublicId = data.public_id;
        uploadedPublicId = data.public_id;
      }

      const payload = {
        name: name.trim(),
        number: number.trim(),
        image_url: imageUrl,
        image_public_id: imagePublicId,
        is_active: isActive,
        display_order: Number(displayOrder) || 0,
      };

      const res = isEdit
        ? await adminAPI.updatePaymentQrCode(code.id, payload)
        : await adminAPI.createPaymentQrCode(payload);
      const saved = res.data?.data ?? res.data;

      onSaved(saved);
      toast.success(isEdit ? 'QR code updated.' : 'QR code added.');
      onClose();
    } catch (e2) {
      // The upload may have succeeded even when saving the record failed.
      if (uploadedPublicId) {
        uploadAPI.deleteQrImage(uploadedPublicId).catch(() => { /* non-critical */ });
      }
      setServerError(e2?.response?.data?.message || e2?.message || 'Failed to save QR code.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? `Edit QR code — ${code.name}` : 'Add payment QR code'} width={480}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="QR code image" id="qr-image" error={err('image')}
          hint="JPG, PNG or WEBP · max 5MB. The image uploads directly to the cloud.">
          <div
            className="sys-qr-upload"
            role="button"
            tabIndex={0}
            aria-label="Upload QR code image"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
          >
            {preview ? (
              <img src={preview} alt="QR code preview" className="sys-qr-upload__img" />
            ) : (
              <div className="sys-qr-upload__placeholder">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/>
                </svg>
                <span><strong>Click to upload</strong> the QR code image</span>
                <span className="sys-qr-upload__hint">JPG, PNG · max 5MB</span>
              </div>
            )}
            <input
              ref={fileRef}
              id="qr-image"
              type="file"
              accept="image/*"
              className="sys-qr-upload__input"
              onChange={(e) => { pickFile(e.target.files[0]); e.target.value = ''; }}
            />
          </div>
        </Field>

        <Field label="Account name" id="qr-name" error={err('name')}
          hint="Shown to customers beside the QR code, e.g. the GCash account holder.">
          <TextInput id="qr-name" value={name} maxLength={100}
            onChange={(e) => { setName(sanitizeProductName(e.target.value, 100)); touch('name'); }}
            onBlur={() => touch('name')}
            error={err('name')}
            placeholder="e.g. Bingnondo Cafe / Juan Dela Cruz"
            autoFocus />
        </Field>

        <Field label="Account number" id="qr-number" error={err('number')}
          hint="The mobile number or account number tied to the QR code.">
          <TextInput id="qr-number" value={number} maxLength={50}
            onChange={(e) => { setNumber(e.target.value.replace(/[\r\n]/g, '').slice(0, 50)); touch('number'); }}
            onBlur={() => touch('number')}
            error={err('number')}
            inputMode="numeric"
            placeholder="e.g. 0917 123 4567" />
        </Field>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 130px' }}>
            <Field label="Display order" id="qr-order" error={err('displayOrder')} hint="Lower shows first.">
              <TextInput id="qr-order" value={displayOrder} inputMode="numeric"
                onChange={(e) => { setDisplayOrder(sanitizeInteger(e.target.value, 4)); touch('displayOrder'); }}
                onBlur={() => touch('displayOrder')}
                error={err('displayOrder')} />
            </Field>
          </div>
          <label className="ap-switch-row" style={{ flex: 1, paddingTop: 18 }}>
            <span className="ap-switch-row__text">
              <span className="ap-switch-row__label">Show at checkout</span>
              <span className="ap-switch-row__desc">Customers see this QR code when paying with GCash.</span>
            </span>
            <span className="ap-switch">
              <input type="checkbox" checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                aria-label="Show this QR code at checkout" />
              <span className="ap-switch__track" aria-hidden="true"><span className="ap-switch__thumb" /></span>
            </span>
          </label>
        </div>

        {serverError && <p className="ap-variant-error" role="alert">{serverError}</p>}

        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="gold" type="submit" loading={saving}>{isEdit ? 'Save QR code' : 'Add QR code'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function defaultEsp32ServerUrl() {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return window.location.origin;
}

function Esp32WifiModal({ device, onClose, onSaved, toast }) {
  const [ssid, setSsid] = useState(device?.ssid || '');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState(device?.server_url || defaultEsp32ServerUrl());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function close() {
    if (saving) return;
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    if (saving) return;

    const nextSsid = ssid.trim();
    const nextUrl = serverUrl.trim().replace(/\/+$/, '');
    if (!nextSsid) { setError('Wi-Fi name is required.'); return; }
    if (!/^https?:\/\/.+/i.test(nextUrl)) {
      setError('Server URL must start with http:// or https://.');
      return;
    }
    if (!device?.ssid && !password) {
      setError('Password is required for the first Wi-Fi setup.');
      return;
    }
    if (password && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (device?.ssid && nextSsid !== device.ssid && !password) {
      setError('Enter the Wi-Fi password when changing the network name.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = { ssid: nextSsid, server_url: nextUrl };
      if (password) payload.password = password;
      const res = await adminAPI.saveEsp32Wifi(device.device_code, payload);
      toast.success(res.data?.message || 'Wi-Fi config saved.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to save Wi-Fi config.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={close} title={`Configure ${device?.device_code || 'ESP32'}`} width={460}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Wi-Fi name (SSID)" id="esp32-ssid"
          hint={device?.ssid ? undefined : 'The kitchen network the ESP32 should join.'}>
          <TextInput id="esp32-ssid" value={ssid} maxLength={32}
            onChange={e => setSsid(e.target.value)} autoFocus placeholder="Kitchen Wi-Fi" />
        </Field>
        <Field label="Wi-Fi password" id="esp32-password"
          hint={device?.ssid ? 'Leave blank to keep the current password.' : 'Required for the first setup. 8-64 characters.'}>
          <PasswordInput id="esp32-password" value={password} maxLength={64}
            onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Server URL" id="esp32-server-url" hint="Example: http://192.168.1.10:5000">
          <TextInput id="esp32-server-url" value={serverUrl} maxLength={200}
            onChange={e => setServerUrl(e.target.value)} placeholder="http://192.168.1.10:5000" />
        </Field>
        {error && <span className="ap-field-error">{error}</span>}
        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={close} disabled={saving}>Cancel</Btn>
          <Btn variant="gold" type="submit" loading={saving} disabled={!ssid.trim() || !serverUrl.trim()}>
            Save Wi-Fi
          </Btn>
        </div>
      </form>
    </Modal>
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
  const [qrCodes, setQrCodes]       = useState([]);
  const [qrModal, setQrModal]       = useState(null);   // null | { code: null | code }
  const [deleteQr, setDeleteQr]     = useState(null);
  const [deletingQr, setDeletingQr] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState({ enabled: false, amount: '0' });
  const [savingFee, setSavingFee]   = useState(false);
  const [esp32Devices, setEsp32Devices] = useState([]);
  const [esp32Edit, setEsp32Edit] = useState(null);
  const [esp32Busy, setEsp32Busy] = useState({});
  const [esp32TestResult, setEsp32TestResult] = useState({});
  const [esp32History, setEsp32History] = useState([]);
  const [esp32HistoryDevice, setEsp32HistoryDevice] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [hoursRes, catsRes, notifRes, variantsRes, esp32Res, qrRes, feeRes] = await Promise.all([
        adminAPI.getBusinessHours(),
        adminAPI.listCategories(),
        adminAPI.getNotificationSettings(),
        adminAPI.listVariantGroups(),
        adminAPI.listEsp32Devices(),
        // These two are new tables/settings — fall back to safe defaults so
        // the rest of the page still loads on a database without migration 028.
        adminAPI.listPaymentQrCodes().catch(() => ({ data: { data: [] } })),
        adminAPI.getDeliveryFee().catch(() => ({ data: { data: { enabled: false, amount: 0 } } })),
      ]);
      const hoursData = hoursRes.data?.data ?? hoursRes.data ?? [];
      const catsData  = catsRes.data?.data  ?? catsRes.data  ?? [];
      const notifData = notifRes.data?.data ?? notifRes.data ?? {};
      const esp32Data = esp32Res.data?.data ?? esp32Res.data ?? [];
      const qrData    = qrRes.data?.data ?? qrRes.data ?? [];
      const feeData   = feeRes.data?.data ?? feeRes.data ?? {};
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
      setEsp32Devices(Array.isArray(esp32Data) ? esp32Data : []);
      setQrCodes(Array.isArray(qrData) ? qrData : []);
      setDeliveryFee({
        enabled: !!feeData.enabled,
        amount: String(feeData.amount ?? 0),
      });
    } catch { toast.error('Failed to load settings.'); }
    finally { setLoading(false); }
  }, [toast]);

  // Fetch-on-mount: the sync setLoading inside `loadAll` is intentional.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(()=>{ loadAll(); },[loadAll]);

  const refreshEsp32Devices = useCallback(async () => {
    try {
      const res = await adminAPI.listEsp32Devices();
      const data = res.data?.data ?? res.data ?? [];
      setEsp32Devices(Array.isArray(data) ? data : []);
    } catch { toast.error('Failed to refresh ESP32 devices.'); }
  }, [toast]);

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

  function handleQrSaved(saved) {
    setQrCodes(prev => {
      const exists = prev.some(q => q.id === saved.id);
      const next = exists
        ? prev.map(q => (q.id === saved.id ? saved : q))
        : [...prev, saved];
      return next.sort((a, b) => (a.display_order - b.display_order) || (a.id - b.id));
    });
  }

  async function handleDeleteQr() {
    if (!deleteQr) return;
    setDeletingQr(true);
    try {
      await adminAPI.deletePaymentQrCode(deleteQr.id);
      setQrCodes(prev => prev.filter(q => q.id !== deleteQr.id));
      toast.success(`QR code "${deleteQr.name}" removed.`);
      setDeleteQr(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to delete QR code.');
    } finally {
      setDeletingQr(false);
    }
  }

  async function saveDeliveryFee() {
    const raw = String(deliveryFee.amount ?? '').trim();
    // Treat an empty field or a trailing decimal point ("0.") as a whole number.
    const amountStr = (raw === '' ? '0' : raw).replace(/\.$/, '');
    const amountError = validateAmount(amountStr, { label: 'Delivery fee', min: 0 });
    if (amountError) {
      toast.error(amountError);
      return;
    }

    setSavingFee(true);
    try {
      const res = await adminAPI.saveDeliveryFee({
        enabled: deliveryFee.enabled,
        amount: Number(amountStr),
      });
      const saved = res.data?.data ?? res.data;
      setDeliveryFee({ enabled: !!saved.enabled, amount: String(saved.amount ?? 0) });
      toast.success('Delivery fee saved.');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to save delivery fee.');
    } finally {
      setSavingFee(false);
    }
  }

  async function handleResendEsp32(device) {
    setEsp32Busy(prev => ({ ...prev, [device.device_code]: true }));
    try {
      const res = await adminAPI.resendEsp32Wifi(device.device_code);
      toast.success(res.data?.message || 'Wi-Fi config re-sent.');
      await refreshEsp32Devices();
    } catch(err) {
      toast.error(err?.response?.data?.message || 'Resend failed.');
    } finally {
      setEsp32Busy(prev => { const next = { ...prev }; delete next[device.device_code]; return next; });
    }
  }

  async function handleTestEsp32(device) {
    const url = device.server_url || defaultEsp32ServerUrl();
    setEsp32Busy(prev => ({ ...prev, [device.device_code]: true }));
    setEsp32TestResult(prev => ({ ...prev, [device.device_code]: undefined }));
    try {
      const res = await adminAPI.testEsp32Connection(device.device_code, url);
      if (res.data?.reachable) {
        setEsp32TestResult(prev => ({ ...prev, [device.device_code]: { kind: 'success', message: `Reachable (HTTP ${res.data.status})` } }));
        toast.success('Server URL reachable.');
      } else {
        setEsp32TestResult(prev => ({ ...prev, [device.device_code]: { kind: 'error', message: res.data?.error || 'Not reachable.' } }));
        toast.error('Server URL not reachable.');
      }
    } catch(err) {
      setEsp32TestResult(prev => ({ ...prev, [device.device_code]: { kind: 'error', message: err?.response?.data?.message || err.message || 'Test failed.' } }));
      toast.error('Test connection failed.');
    } finally {
      setEsp32Busy(prev => { const next = { ...prev }; delete next[device.device_code]; return next; });
    }
  }

  async function openEsp32History(device) {
    try {
      const res = await adminAPI.esp32ConfigHistory(device.device_code);
      setEsp32History(res.data?.data ?? res.data ?? []);
      setEsp32HistoryDevice(device);
    } catch(err) {
      toast.error(err?.response?.data?.message || 'Failed to load history.');
    }
  }

  function closeEsp32History() {
    setEsp32History([]);
    setEsp32HistoryDevice(null);
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
          sub="Store-level configuration: operating hours, payment QR codes, delivery fee, categories, variants, and notifications."
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

        {/* Payment QR codes */}
        <Section
          title="Payment QR codes"
          subtitle="Upload the GCash (or other e-wallet) QR codes customers scan at checkout. The account name and number are shown beside the image."
          action={<Btn variant="gold" size="sm" icon={<PlusIcon />} onClick={() => setQrModal({ code: null })}>Add QR code</Btn>}
        >
          {qrCodes.length === 0 ? (
            <p className="sys-subsection__hint">No QR codes yet. Add one so customers can pay.</p>
          ) : (
            <div className="ap-list-rows">
              {qrCodes.map(code => (
                <div key={code.id} className="ap-list-row">
                  <div className="sys-qr-row">
                    <img src={code.image_url} alt={`${code.name} QR code`} className="sys-qr-thumb" />
                    <div className="ap-list-row__info" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                      <span className="ap-list-row__name">{code.name}</span>
                      <span className="ap-list-row__meta">{code.number}</span>
                      <Badge type={code.is_active ? 'active' : 'inactive'} label={code.is_active ? 'Active' : 'Hidden'} />
                    </div>
                  </div>
                  <div className="ap-list-row__actions">
                    <button type="button" className="ap-icon-btn" onClick={() => setQrModal({ code })}
                      aria-label={`Edit ${code.name}`} title={`Edit ${code.name}`}><PencilIcon /></button>
                    <button type="button" className="ap-icon-btn ap-icon-btn--danger" onClick={() => setDeleteQr(code)}
                      aria-label={`Delete ${code.name}`} title={`Delete ${code.name}`}><TrashIcon /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Delivery fee */}
        <Section
          title="Delivery fee"
          subtitle="Added to online/mobile orders at checkout. Counter orders are not charged."
          action={<Btn variant="gold" size="sm" onClick={saveDeliveryFee} loading={savingFee}>Save fee</Btn>}
        >
          <label className="ap-switch-row">
            <span className="ap-switch-row__text">
              <span className="ap-switch-row__label">Charge a delivery fee</span>
              <span className="ap-switch-row__desc">When off, online orders are charged the food subtotal only.</span>
            </span>
            <span className="ap-switch">
              <input type="checkbox" checked={deliveryFee.enabled}
                onChange={(e) => setDeliveryFee(v => ({ ...v, enabled: e.target.checked }))}
                aria-label="Charge a delivery fee" />
              <span className="ap-switch__track" aria-hidden="true"><span className="ap-switch__thumb" /></span>
            </span>
          </label>
          <div style={{ maxWidth: 260, marginTop: 10 }}>
            <Field label="Delivery fee amount" id="delivery-fee"
              hint="Up to 2 decimal places. Applies to online orders only.">
              <TextInput id="delivery-fee" value={deliveryFee.amount} inputMode="decimal" prefix="₱"
                disabled={!deliveryFee.enabled}
                onChange={(e) => setDeliveryFee(v => ({ ...v, amount: sanitizeDecimal(e.target.value) }))}
                placeholder="0.00" />
            </Field>
          </div>
        </Section>

        {/* ESP32 Wi‑Fi */}
        <Section
          title="ESP32 Wi‑Fi"
          subtitle="Push the kitchen Wi‑Fi and server URL to the device. First-time setup still uses the Bingnondo-XXXX access point."
        >
          {esp32Devices.length === 0 ? (
            <p className="sys-subsection__hint">No ESP32 devices registered.</p>
          ) : (
            <div className="ap-list-rows">
              {esp32Devices.map(device => {
                const configured = !!device.ssid;
                const applied = configured
                  && Number(device.version) > 0
                  && Number(device.applied_version) >= Number(device.version);
                return (
                  <div key={device.device_code} className="ap-list-row">
                    <div className="ap-list-row__info">
                      <span className="ap-list-row__name">{device.device_code}</span>
                      <Badge
                        type={device.status === 'online' ? 'online' : 'offline'}
                        label={device.status === 'online' ? 'Online' : 'Offline'}
                      />
                      <span className="sys-usage">
                        {configured ? `Wi-Fi: ${device.ssid}` : 'Wi-Fi not configured'}
                        {configured && Number(device.version) > 0
                          ? ` · ${applied ? 'applied' : 'waiting for device'}`
                          : ''}
                      </span>
                      {device.last_error && (
                        <span className="sys-usage" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                          ⚠ {device.last_error}
                        </span>
                      )}
                      {esp32TestResult[device.device_code] && (
                        <span className="sys-usage" style={{ color: esp32TestResult[device.device_code].kind === 'success' ? 'var(--color-success)' : 'var(--color-primary)', fontWeight: 600 }}>
                          {esp32TestResult[device.device_code].kind === 'success' ? '✓ ' : '✗ '}{esp32TestResult[device.device_code].message}
                        </span>
                      )}
                    </div>
                    <div className="ap-list-row__actions">
                      <Btn variant="ghost" size="sm" onClick={() => setEsp32Edit(device)}>Configure</Btn>
                      {configured && (
                        <Btn variant="ghost" size="sm"
                          onClick={() => handleTestEsp32(device)}
                          disabled={esp32Busy[device.device_code]}
                          title="Test server URL">
                          {esp32Busy[device.device_code] ? <Spinner size={12} /> : 'Test'}
                        </Btn>
                      )}
                      {(configured && !applied) || device.last_error ? (
                        <Btn variant="gold" size="sm"
                          onClick={() => handleResendEsp32(device)}
                          disabled={esp32Busy[device.device_code]}
                          title="Re-send config to device">
                          {esp32Busy[device.device_code] ? <Spinner size={12} /> : 'Resend'}
                        </Btn>
                      ) : null}
                      <Btn variant="ghost" size="sm"
                        onClick={() => openEsp32History(device)}
                        title="Config history">
                        📜
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
        categories={categories}
      />

      {esp32Edit && (
        <Esp32WifiModal
          key={esp32Edit.device_code}
          device={esp32Edit}
          onClose={()=>setEsp32Edit(null)}
          onSaved={refreshEsp32Devices}
          toast={toast}
        />
      )}

      {esp32HistoryDevice && (
        <Modal open onClose={closeEsp32History} title={`Config history — ${esp32HistoryDevice.device_code}`} width={560}>
          {esp32History.length === 0 ? (
            <p className="sys-subsection__hint">No config changes recorded yet.</p>
          ) : (
            <div className="ap-list-rows">
              {esp32History.map((entry, i) => {
                const details = typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details;
                return (
                  <div key={i} className="ap-list-row">
                    <div className="ap-list-row__info">
                      <span className="ap-list-row__name">{entry.action}</span>
                      <span className="sys-usage">{details.device_code || ''}</span>
                      <span className="sys-usage">
                        {details.version ? `v${details.version}` : ''}
                        {details.action === 'resend' ? ' · resent' : ''}
                      </span>
                      <span className="sys-usage" style={{ fontSize: '0.72rem', color: 'var(--color-muted-foreground)' }}>
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {qrModal && (
        <QrCodeModal
          key={qrModal.code?.id ?? 'new'}
          code={qrModal.code}
          onClose={() => setQrModal(null)}
          onSaved={handleQrSaved}
          toast={toast}
        />
      )}

      <ConfirmModal
        open={!!deleteQr}
        onClose={() => setDeleteQr(null)}
        onConfirm={handleDeleteQr}
        loading={deletingQr}
        title="Delete QR code"
        message={`Delete the "${deleteQr?.name}" QR code? The image is removed from the cloud too. This action is logged.`}
        confirmLabel="Delete"
        variant="danger"
      />

      {variantModal && (
        <VariantGroupModal
          group={variantModal.group}
          onClose={()=>setVariantModal(null)}
          onSaved={handleVariantSaved}
          toast={toast}
          variantGroups={variantGroups}
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
