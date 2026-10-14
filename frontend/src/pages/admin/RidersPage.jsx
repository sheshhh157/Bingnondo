import { useState, useEffect, useCallback } from 'react';
import { adminRidersAPI } from '../../services/api';
import {
  Spinner, Btn, Field, TextInput, PasswordInput,
  Modal, ConfirmModal, PageHeader, Pagination,
} from './adminShared';
import { useAdminToast } from './useAdminToast';
import FilterModal, { FilterTrigger, FilterInline } from '../../components/MobileFilter';
import DeliveriesTab from './DeliveriesTab';
import '../../styles/AdminPage.css';
import '../../styles/RidersPage.css';

// ── constants ─────────────────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'bicycle',    label: 'Bicycle'    },
  { value: 'e_bike',     label: 'E-Bike'     },
  { value: 'car',        label: 'Car'         },
  { value: 'van',        label: 'Van'         },
];

const STATUS_OPTIONS = [
  { value: 'all',        label: 'All Riders'  },
  { value: 'available',  label: 'Available'   },
  { value: 'on_delivery', label: 'On Delivery' },
  { value: 'inactive',   label: 'Inactive'    },
];

// ── Vehicle Icon SVG ──────────────────────────────────────────────────────────
function VehicleIcon({ type, size = 20 }) {
  if (type === 'motorcycle' || type === 'e_bike') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
        <path d="M15 6h-3l-1 4H7l2-4h3"/><path d="M9 10l3 4 3-4"/>
      </svg>
    );
  }
  if (type === 'bicycle') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/>
        <path d="M5 17L9 5l3 5 3-3 1 3"/><path d="M12 10l7 7"/>
      </svg>
    );
  }
  if (type === 'van') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="7" width="16" height="10" rx="1"/><path d="M17 9h3l3 4v3h-3"/>
        <circle cx="6.5" cy="17.5" r="1.5"/><circle cx="18.5" cy="17.5" r="1.5"/>
      </svg>
    );
  }
  // car (default)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2"/>
      <circle cx="9" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>
    </svg>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function RiderStatusBadge({ status }) {
  const map = {
    available:   { cls: 'rd-badge--available',   label: 'Available'    },
    on_delivery: { cls: 'rd-badge--on-delivery',  label: 'On Delivery'  },
    inactive:    { cls: 'rd-badge--inactive',     label: 'Inactive'     },
  };
  const { cls, label } = map[status] || map['inactive'];
  return (
    <span className={`rd-badge ${cls}`}>
      <span className="rd-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

// ── Rider Avatar ──────────────────────────────────────────────────────────────
function RiderAvatar({ name, status }) {
  const initials = (name || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className={`rd-avatar rd-avatar--${status || 'inactive'}`} aria-hidden="true">
      {initials}
    </div>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar({ riders }) {
  const total     = riders.length;
  const available = riders.filter(r => r.status === 'available').length;
  const onDel     = riders.filter(r => r.status === 'on_delivery').length;
  const inactive  = riders.filter(r => r.status === 'inactive').length;

  return (
    <div className="rd-stats">
      <div className="rd-stat rd-stat--total">
        <div className="rd-stat__icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div>
          <div className="rd-stat__value">{total}</div>
          <div className="rd-stat__label">Total Riders</div>
        </div>
      </div>
      <div className="rd-stat rd-stat--available">
        <div className="rd-stat__icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>
          <div className="rd-stat__value">{available}</div>
          <div className="rd-stat__label">Available</div>
        </div>
      </div>
      <div className="rd-stat rd-stat--on-delivery">
        <div className="rd-stat__icon" aria-hidden="true">
          <VehicleIcon type="motorcycle" size={16} />
        </div>
        <div>
          <div className="rd-stat__value">{onDel}</div>
          <div className="rd-stat__label">On Delivery</div>
        </div>
      </div>
      <div className="rd-stat rd-stat--inactive">
        <div className="rd-stat__icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
        </div>
        <div>
          <div className="rd-stat__value">{inactive}</div>
          <div className="rd-stat__label">Inactive</div>
        </div>
      </div>
    </div>
  );
}

// ── Rider Form Modal ──────────────────────────────────────────────────────────
function RiderFormModal({ open, onClose, onSave, initial = null, loading }) {
  const isEdit = Boolean(initial);
  // Initialised from `initial` on mount; the parent remounts this modal via
  // `key` whenever the open/edit target changes, so no reset effect is needed.
  const [form, setForm]   = useState(() => initial
    ? { full_name: initial.full_name || '', mobile_number: initial.mobile_number || '', email: initial.email || '', plate_number: initial.plate_number || '', vehicle_type: initial.vehicle_type || 'motorcycle', notes: initial.notes || '', temp_password: '' }
    : { full_name: '', mobile_number: '', email: '', plate_number: '', vehicle_type: 'motorcycle', notes: '', temp_password: '' });
  const [errors, setErrors] = useState({});

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.full_name.trim())         e.full_name      = 'Full name is required.';
    if (!form.mobile_number.trim())     e.mobile_number  = 'Mobile number is required.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email format.';
    if (!isEdit && !form.temp_password) e.temp_password  = 'Temporary password is required.';
    if (!isEdit && form.temp_password && form.temp_password.length < 8) e.temp_password = 'Password must be at least 8 characters.';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Rider' : 'Add New Rider'} width={540}>
      <form onSubmit={e => { e.preventDefault(); handleSubmit(); }}>

        {/* Vehicle type picker — visual pill row */}
        <Field label="Vehicle Type" id="rd-vehicle-type">
          <div className="rd-vehicle-pills" role="group" aria-label="Vehicle type">
            {VEHICLE_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`rd-vehicle-pill${form.vehicle_type === value ? ' rd-vehicle-pill--active' : ''}`}
                onClick={() => set('vehicle_type', value)}
                aria-pressed={form.vehicle_type === value}
              >
                <VehicleIcon type={value} size={15} />
                {label}
              </button>
            ))}
          </div>
        </Field>

        <div className="rd-form-grid">
          <Field label="Full Name *" id="rd-name" error={errors.full_name}>
            <TextInput
              id="rd-name"
              placeholder="e.g. Juan Dela Cruz"
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              error={errors.full_name}
              autoComplete="off"
              autoFocus
            />
          </Field>

          <Field label="Mobile Number *" id="rd-mobile" error={errors.mobile_number}>
            <TextInput
              id="rd-mobile"
              placeholder="+63 9XX XXX XXXX"
              value={form.mobile_number}
              onChange={e => set('mobile_number', e.target.value)}
              error={errors.mobile_number}
              autoComplete="off"
            />
          </Field>

          <Field label="Email Address" id="rd-email" error={errors.email} hint="Used for login — leave blank if rider won't use the app.">
            <TextInput
              id="rd-email"
              type="email"
              placeholder="rider@email.com"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              error={errors.email}
              autoComplete="off"
            />
          </Field>

          <Field label="Plate Number" id="rd-plate" hint="Optional — for reference only.">
            <TextInput
              id="rd-plate"
              placeholder="e.g. ABC 1234"
              value={form.plate_number}
              onChange={e => set('plate_number', e.target.value)}
              style={{ textTransform: 'uppercase' }}
              autoComplete="off"
            />
          </Field>
        </div>

        <Field label="Notes" id="rd-notes" hint="Internal notes visible only to Admin.">
          <textarea
            id="rd-notes"
            className="ap-input"
            rows={2}
            placeholder="Any relevant notes…"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </Field>

        {!isEdit && (
          <Field label="Temporary Password *" id="rd-pass" error={errors.temp_password} hint="Rider uses this on first login. Min. 8 characters.">
            <PasswordInput
              id="rd-pass"
              placeholder="Minimum 8 characters"
              value={form.temp_password}
              onChange={e => set('temp_password', e.target.value)}
              error={errors.temp_password}
              autoComplete="new-password"
            />
          </Field>
        )}

        <div className="ap-divider" />

        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" loading={loading}>
            {isEdit ? 'Save Changes' : 'Add Rider'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ open, onClose, onSave, rider, loading }) {
  const [pw, setPw]     = useState('');
  const [err, setErr]   = useState('');

  const handleSave = () => {
    if (!pw) { setErr('Password is required.'); return; }
    if (pw.length < 8) { setErr('Must be at least 8 characters.'); return; }
    onSave(pw);
  };

  return (
    <Modal open={open} onClose={onClose} title="Reset Rider Password" width={420}>
      <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
        <div className="rd-reset-rider">
          <RiderAvatar name={rider?.full_name} status={rider?.status} />
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-foreground)' }}>{rider?.full_name}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-muted-foreground)', marginTop: 2 }}>{rider?.mobile_number}</div>
          </div>
        </div>
        <Field label="New Password" id="rd-reset-pw" error={err} hint="Min. 8 characters. Rider must use this on next login.">
          <PasswordInput
            id="rd-reset-pw"
            placeholder="New password"
            value={pw}
            onChange={e => { setPw(e.target.value); setErr(''); }}
            error={err}
            autoComplete="new-password"
            autoFocus
          />
        </Field>
        <div className="ap-modal__footer">
          <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
          <Btn variant="primary" type="submit" loading={loading}>Reset Password</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Rider Detail Drawer ───────────────────────────────────────────────────────
function RiderDetailDrawer({ rider, open, onClose, onEdit, onToggleStatus, onResetPassword, readOnly = false }) {
  if (!rider) return null;

  const created = rider.created_at
    ? new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(rider.created_at))
    : '—';
  const lastLogin = rider.last_login
    ? new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(rider.last_login))
    : 'Never';

  return (
    <>
      {open && <div className="rd-drawer-scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`rd-drawer${open ? ' rd-drawer--open' : ''}`} role="complementary" aria-label="Rider details">
        <div className="rd-drawer__head">
          <button className="rd-drawer__close" onClick={onClose} aria-label="Close detail panel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="rd-drawer__profile">
          <div className="rd-drawer__avatar-wrap">
            <RiderAvatar name={rider.full_name} status={rider.status} />
            <div className={`rd-drawer__status-ring rd-drawer__status-ring--${rider.status}`} aria-hidden="true" />
          </div>
          <div className="rd-drawer__name">{rider.full_name}</div>
          <RiderStatusBadge status={rider.status} />
        </div>

        <div className="rd-drawer__vehicle-card">
          <div className="rd-drawer__vehicle-icon" aria-hidden="true">
            <VehicleIcon type={rider.vehicle_type} size={22} />
          </div>
          <div>
            <div className="rd-drawer__vehicle-type">{VEHICLE_TYPES.find(v => v.value === rider.vehicle_type)?.label || 'Vehicle'}</div>
            {rider.plate_number && (
              <div className="rd-drawer__plate">{rider.plate_number}</div>
            )}
          </div>
        </div>

        <div className="rd-drawer__info-grid">
          <div className="rd-drawer__info-row">
            <span className="rd-drawer__info-key">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.64 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17z"/></svg>
              Mobile
            </span>
            <span className="rd-drawer__info-val">{rider.mobile_number}</span>
          </div>
          {rider.email && (
            <div className="rd-drawer__info-row">
              <span className="rd-drawer__info-key">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Email
              </span>
              <span className="rd-drawer__info-val rd-drawer__info-val--mono">{rider.email}</span>
            </div>
          )}
          <div className="rd-drawer__info-row">
            <span className="rd-drawer__info-key">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Registered
            </span>
            <span className="rd-drawer__info-val">{created}</span>
          </div>
          <div className="rd-drawer__info-row">
            <span className="rd-drawer__info-key">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Last Login
            </span>
            <span className="rd-drawer__info-val">{lastLogin}</span>
          </div>
        </div>

        {rider.notes && (
          <div className="rd-drawer__notes">
            <div className="rd-drawer__notes-label">Notes</div>
            <div className="rd-drawer__notes-body">{rider.notes}</div>
          </div>
        )}

        {!readOnly && (<div className="rd-drawer__actions">
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => onEdit(rider)}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
          >
            Edit Details
          </Btn>
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => onResetPassword(rider)}
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
          >
            Reset Password
          </Btn>
          {rider.status !== 'on_delivery' && (
            <Btn
              variant={rider.status === 'inactive' ? 'ghost' : 'danger'}
              size="sm"
              onClick={() => onToggleStatus(rider)}
              icon={rider.status === 'inactive'
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              }
            >
              {rider.status === 'inactive' ? 'Reactivate Rider' : 'Deactivate Rider'}
            </Btn>
          )}
          {rider.status === 'on_delivery' && (
            <div className="rd-drawer__on-del-notice">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Status locked — rider is currently on a delivery.
            </div>
          )}
        </div>
        )}
      </aside>
    </>
  );
}

// ── Rider Row ─────────────────────────────────────────────────────────────────
function RiderRow({ rider, onSelect, isSelected }) {
  const vehicleLabel = VEHICLE_TYPES.find(v => v.value === rider.vehicle_type)?.label || '—';
  return (
    <tr
      className={`rd-table-row${isSelected ? ' rd-table-row--selected' : ''}`}
      onClick={() => onSelect(rider)}
      style={{ cursor: 'pointer' }}
    >
      <td>
        <div className="ap-member">
          <RiderAvatar name={rider.full_name} status={rider.status} />
          <div className="ap-member__info">
            <span className="ap-member__name" title={rider.full_name}>{rider.full_name}</span>
            <span className="ap-member__email" title={rider.mobile_number}>{rider.mobile_number}</span>
          </div>
        </div>
      </td>
      <td>
        <div className="rd-vehicle-cell">
          <VehicleIcon type={rider.vehicle_type} size={14} />
          <span>{vehicleLabel}</span>
          {rider.plate_number && (
            <span className="rd-plate-chip">{rider.plate_number}</span>
          )}
        </div>
      </td>
      <td>
        <span title={rider.email || undefined} style={{ display: 'inline-block', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom', fontSize: '0.8125rem', color: 'var(--color-muted-foreground)', fontFamily: 'monospace' }}>
          {rider.email || '—'}
        </span>
      </td>
      <td><RiderStatusBadge status={rider.status} /></td>
      <td className="rd-table__sel-indicator" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </td>
    </tr>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function RidersPage({ readOnly = false }) {
  const [tab, setTab] = useState(readOnly ? 'deliveries' : 'riders');

  return (
    <div className="ap-page ap-page--wide rd-page">
      <div className="rd-tabs" role="tablist" aria-label="Riders and deliveries">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'riders'}
          className={`rd-tab${tab === 'riders' ? ' rd-tab--active' : ''}`}
          onClick={() => setTab('riders')}
        >
          Riders
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'deliveries'}
          className={`rd-tab${tab === 'deliveries' ? ' rd-tab--active' : ''}`}
          onClick={() => setTab('deliveries')}
        >
          Deliveries
        </button>
      </div>

      {tab === 'riders'
        ? <RidersTab readOnly={readOnly} />
        : <DeliveriesTab />}
    </div>
  );
}

// ── Riders Tab ────────────────────────────────────────────────────────────────
function RidersTab({ readOnly = false }) {
  const { toast } = useAdminToast();

  // data
  const [riders,    setRiders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [total,     setTotal]     = useState(0);

  // filters / pagination
  const [search,    setSearch]    = useState('');
  const [statusF,   setStatusF]   = useState('all');
  const [page,      setPage]      = useState(1);
  const LIMIT = 15;

  // UI state
  const [selected,  setSelected]  = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // modals
  const [formOpen,  setFormOpen]  = useState(false);
  const [editRider, setEditRider] = useState(null);
  const [formSaving, setFormSaving] = useState(false);

  const [resetOpen,  setResetOpen]  = useState(false);
  const [resetRider, setResetRider] = useState(null);
  const [resetSaving, setResetSaving] = useState(false);

  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [confirmRider, setConfirmRider] = useState(null);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [filterOpen,    setFilterOpen]    = useState(false);

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchRiders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminRidersAPI.getAll({ page, limit: LIMIT, search: search || undefined, status: statusF !== 'all' ? statusF : undefined });
      setRiders(res.data || []);
      setTotal(res.total || 0);
    } catch {
      toast.error('Failed to load riders.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusF, toast]);

  // Fetch-on-mount: the sync setLoading inside `fetchRiders` is intentional.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { fetchRiders(); }, [fetchRiders]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleSelectRow = (rider) => {
    setSelected(rider);
    setDrawerOpen(true);
  };

  const handleAddNew = () => {
    setEditRider(null);
    setFormOpen(true);
  };

  const handleEdit = (rider) => {
    setEditRider(rider);
    setFormOpen(true);
    setDrawerOpen(false);
  };

  const handleFormSave = async (data) => {
    setFormSaving(true);
    try {
      if (editRider) {
        await adminRidersAPI.update(editRider.id, data);
        toast.success('Rider updated successfully.');
        if (selected?.id === editRider.id) setSelected(s => ({ ...s, ...data }));
      } else {
        await adminRidersAPI.create(data);
        toast.success('Rider added successfully.');
      }
      setFormOpen(false);
      fetchRiders();
    } catch (err) {
      const msg = err?.message || (editRider ? 'Failed to update rider.' : 'Failed to create rider.');
      toast.error(msg);
    } finally {
      setFormSaving(false);
    }
  };

  const handleResetPassword = (rider) => {
    setResetRider(rider);
    setResetOpen(true);
    setDrawerOpen(false);
  };

  const handleResetSave = async (newPassword) => {
    setResetSaving(true);
    try {
      await adminRidersAPI.resetPassword(resetRider.id, newPassword);
      toast.success('Password reset successfully.');
      setResetOpen(false);
    } catch {
      toast.error('Failed to reset password.');
    } finally {
      setResetSaving(false);
    }
  };

  const handleToggleStatus = (rider) => {
    setConfirmRider(rider);
    setConfirmOpen(true);
    setDrawerOpen(false);
  };

  const handleConfirmToggle = async () => {
    if (!confirmRider) return;
    setConfirmSaving(true);
    const newStatus = confirmRider.status === 'inactive' ? 'available' : 'inactive';
    try {
      await adminRidersAPI.updateStatus(confirmRider.id, newStatus);
      toast.success(`Rider ${newStatus === 'inactive' ? 'deactivated' : 'reactivated'}.`);
      setConfirmOpen(false);
      if (selected?.id === confirmRider.id) setSelected(s => ({ ...s, status: newStatus }));
      fetchRiders();
    } catch {
      toast.error('Failed to update rider status.');
    } finally {
      setConfirmSaving(false);
    }
  };

  // ── pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // ── render ─────────────────────────────────────────────────────────────────
  const isEmpty = !loading && riders.length === 0;

  const filterFields = (
    <div className="rd-filter-pills" role="group" aria-label="Filter by status">
      {STATUS_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`rd-filter-pill${statusF === value ? ' rd-filter-pill--active' : ''}`}
          onClick={() => { setStatusF(value); setPage(1); }}
          aria-pressed={statusF === value}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <PageHeader
        title="Rider Management"
        chip={`${total} rider${total === 1 ? '' : 's'}`}
        sub="Register, manage, and monitor delivery riders."
        action={readOnly ? null : <Btn variant="primary" onClick={handleAddNew} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}>Add Rider</Btn>}
      />

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      <StatsBar riders={riders} />

      {/* ── Main card ───────────────────────────────────────────────────── */}
      <div className="ap-card rd-main-card">
        {/* toolbar */}
        <div className="ap-card__head">
          <div className="ap-toolbar" style={{ width: '100%' }}>
            <div className="ap-toolbar__filters">
            {/* search */}
            <div style={{ flex: 1, minWidth: 0, maxWidth: 340 }}>
              <TextInput
                placeholder="Search by name, mobile, plate…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                prefix={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
                aria-label="Search riders"
              />
            </div>
            {/* status filter — pill tabs */}
            <FilterTrigger open={filterOpen} onClick={() => setFilterOpen(true)} active={statusF !== 'all'} label="Filter riders by status" />
            <FilterInline>{filterFields}</FilterInline>
            </div>
          </div>
        </div>

        {/* table */}
        <div className="ap-table-wrap">
          {loading ? (
            <div className="ap-loading"><Spinner size={24} /></div>
          ) : isEmpty ? (
            <div className="ap-empty">
              <div className="rd-empty-icon" aria-hidden="true">
                <VehicleIcon type="motorcycle" size={32} />
              </div>
              <div className="ap-empty__title">{search || statusF !== 'all' ? 'No riders match your filter.' : 'No riders yet.'}</div>
              <div className="ap-empty__sub">{!search && statusF === 'all' && (readOnly ? 'No riders have been registered yet.' : 'Add your first rider to get started.')}</div>
              {!readOnly && !search && statusF === 'all' && (
                <Btn variant="primary" size="sm" onClick={handleAddNew} style={{ marginTop: 12 }}>
                  Add First Rider
                </Btn>
              )}
            </div>
          ) : (
            <table className="ap-table rd-table" aria-label="Riders list">
              <thead>
                <tr>
                  <th scope="col">Rider</th>
                  <th scope="col">Vehicle</th>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th style={{ width: 32 }} aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {riders.map(r => (
                  <RiderRow
                    key={r.id}
                    rider={r}
                    onSelect={handleSelectRow}
                    isSelected={selected?.id === r.id && drawerOpen}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* footer */}
        {!loading && !isEmpty && (
          <div className="ap-table-foot">
            <span className="ap-table-foot__info">
              Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} of {total} rider{total !== 1 ? 's' : ''}
            </span>
            <Pagination page={page} total={totalPages} onPage={setPage} label="Riders pagination" />
          </div>
        )}
      </div>

      {/* ── Detail Drawer ─────────────────────────────────────────────────── */}
      <RiderDetailDrawer
        rider={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEdit={handleEdit}
        onToggleStatus={handleToggleStatus}
        onResetPassword={handleResetPassword}
        readOnly={readOnly}
      />

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <RiderFormModal
        key={formOpen ? `edit-${editRider?.id ?? 'new'}` : 'form-closed'}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleFormSave}
        initial={editRider}
        loading={formSaving}
      />

      <ResetPasswordModal
        key={resetOpen ? `reset-${resetRider?.id ?? 'new'}` : 'reset-closed'}
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onSave={handleResetSave}
        rider={resetRider}
        loading={resetSaving}
      />

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmToggle}
        title={confirmRider?.status === 'inactive' ? 'Reactivate Rider' : 'Deactivate Rider'}
        message={
          confirmRider?.status === 'inactive'
            ? `Reactivate ${confirmRider?.full_name}? They will appear in the available riders list and can log in again.`
            : `Deactivate ${confirmRider?.full_name}? They will be hidden from the assignment dropdown and cannot log in.`
        }
        confirmLabel={confirmRider?.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
        variant={confirmRider?.status === 'inactive' ? 'ghost' : 'danger'}
        loading={confirmSaving}
      />

      <FilterModal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter riders">
        {filterFields}
      </FilterModal>
    </>
  );
}