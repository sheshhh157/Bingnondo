import { useState, useEffect, useCallback } from 'react';
import { adminRidersAPI } from '../../services/api';
import '../../styles/AdminPage.css';

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastId = 0;

function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'info') => {
    const id = ++_toastId;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  const dismiss = id => setToasts(p => p.filter(t => t.id !== id));
  return { toasts, dismiss, toast: { success: m => push(m,'success'), error: m => push(m,'error'), info: m => push(m,'info') } };
}

function Toasts({ toasts, dismiss }) {
  const icons = { success: '✓', error: '✕', info: 'i' };
  return (
    <div className="ap-toast-stack" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`ap-toast ap-toast--${t.type}`}>
          <span className="ap-toast__icon">{icons[t.type]}</span>
          <span className="ap-toast__msg">{t.msg}</span>
          <button className="ap-toast__dismiss" onClick={() => dismiss(t.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}

function Spinner({ size = 16 }) {
  return (
    <svg className="ap-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="#2E2B22" strokeWidth="2.5"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="#C9963C" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function StatusBadge({ status }) {
  const map = {
    available:   { label: 'Available',    cls: 'ap-badge--active' },
    on_delivery: { label: 'On delivery',  cls: 'ap-badge--warning' },
    inactive:    { label: 'Inactive',     cls: 'ap-badge--inactive' },
  };
  const { label, cls } = map[status] || { label: status, cls: '' };
  return (
    <span className={`ap-badge ${cls}`}>
      <span className="ap-badge__dot" aria-hidden="true"/>
      {label}
    </span>
  );
}

// ── Rider Form (create / edit) ────────────────────────────────────────────────
function RiderFormModal({ rider, onClose, onSaved, toast }) {
  const isEdit = Boolean(rider);

  const [form, setForm] = useState({
    full_name:    rider?.full_name    || '',
    mobile_number: rider?.mobile_number || '',
    email:         rider?.email        || '',
    plate_number:  rider?.plate_number || '',
    vehicle_type:  rider?.vehicle_type || '',
    notes:         rider?.notes        || '',
    password:      '',
  });
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState({});

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.full_name.trim())     e.full_name    = 'Name is required.';
    if (!form.mobile_number.trim()) e.mobile_number = 'Mobile number is required.';
    if (!isEdit && !form.password)  e.password     = 'Password is required for new riders.';
    if (form.password && form.password.length < 8) e.password = 'Minimum 8 characters.';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      const payload = {
        full_name:     form.full_name.trim(),
        mobile_number: form.mobile_number.trim(),
        email:         form.email.trim() || undefined,
        plate_number:  form.plate_number.trim() || undefined,
        vehicle_type:  form.vehicle_type.trim() || undefined,
        notes:         form.notes.trim() || undefined,
      };
      if (form.password) payload.password = form.password;

      if (isEdit) {
        await adminRidersAPI.update(rider.id, payload);
        toast.success('Rider updated.');
      } else {
        await adminRidersAPI.create(payload);
        toast.success('Rider created.');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Save failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ap-overlay" onClick={onClose}>
      <div className="ap-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="rider-modal-title">
        <div className="ap-modal__header">
          <h2 id="rider-modal-title" className="ap-modal__title">
            {isEdit ? 'Edit Rider' : 'Add Rider'}
          </h2>
          <button className="ap-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="ap-modal__body" onSubmit={handleSubmit} noValidate>
          <div className="ap-form-grid">
            {/* Full name */}
            <div className="ap-form-field">
              <label className="ap-form-label">Full name *</label>
              <input
                className={`ap-form-input${errors.full_name ? ' ap-form-input--error' : ''}`}
                value={form.full_name}
                onChange={set('full_name')}
                placeholder="e.g. Juan dela Cruz"
                autoFocus
              />
              {errors.full_name && <p className="ap-form-error">{errors.full_name}</p>}
            </div>

            {/* Mobile */}
            <div className="ap-form-field">
              <label className="ap-form-label">Mobile number *</label>
              <input
                className={`ap-form-input${errors.mobile_number ? ' ap-form-input--error' : ''}`}
                value={form.mobile_number}
                onChange={set('mobile_number')}
                placeholder="e.g. 09171234567"
                type="tel"
              />
              {errors.mobile_number && <p className="ap-form-error">{errors.mobile_number}</p>}
            </div>

            {/* Email */}
            <div className="ap-form-field">
              <label className="ap-form-label">Email <span className="ap-form-optional">(optional)</span></label>
              <input
                className="ap-form-input"
                value={form.email}
                onChange={set('email')}
                placeholder="rider@email.com"
                type="email"
              />
            </div>

            {/* Password */}
            <div className="ap-form-field">
              <label className="ap-form-label">
                Password {isEdit ? <span className="ap-form-optional">(leave blank to keep)</span> : '*'}
              </label>
              <input
                className={`ap-form-input${errors.password ? ' ap-form-input--error' : ''}`}
                value={form.password}
                onChange={set('password')}
                placeholder={isEdit ? 'New password (optional)' : 'Min. 8 characters'}
                type="password"
                autoComplete="new-password"
              />
              {errors.password && <p className="ap-form-error">{errors.password}</p>}
            </div>

            {/* Plate */}
            <div className="ap-form-field">
              <label className="ap-form-label">Plate number <span className="ap-form-optional">(optional)</span></label>
              <input
                className="ap-form-input"
                value={form.plate_number}
                onChange={set('plate_number')}
                placeholder="e.g. ABC 1234"
              />
            </div>

            {/* Vehicle type */}
            <div className="ap-form-field">
              <label className="ap-form-label">Vehicle type <span className="ap-form-optional">(optional)</span></label>
              <input
                className="ap-form-input"
                value={form.vehicle_type}
                onChange={set('vehicle_type')}
                placeholder="e.g. Motorcycle, Bicycle"
              />
            </div>

            {/* Notes — full width */}
            <div className="ap-form-field ap-form-field--full">
              <label className="ap-form-label">Notes <span className="ap-form-optional">(optional)</span></label>
              <textarea
                className="ap-form-input ap-form-textarea"
                value={form.notes}
                onChange={set('notes')}
                placeholder="Internal notes about this rider"
                rows={2}
              />
            </div>
          </div>

          <div className="ap-modal__footer">
            <button type="button" className="ap-btn ap-btn--ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="ap-btn ap-btn--primary" disabled={loading} aria-busy={loading}>
              {loading ? <Spinner /> : isEdit ? 'Save changes' : 'Add rider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ rider, onClose, toast }) {
  const [password, setPassword]   = useState('');
  const [confirm,  setConfirm]    = useState('');
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('Minimum 8 characters.'); return; }
    if (password !== confirm)  { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      await adminRidersAPI.resetPassword(rider.id, password);
      toast.success(`Password reset for ${rider.full_name}.`);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Reset failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="ap-overlay" onClick={onClose}>
      <div className="ap-modal ap-modal--sm" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ap-modal__header">
          <h2 className="ap-modal__title">Reset Password</h2>
          <button className="ap-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="ap-modal__body" onSubmit={handleSubmit} noValidate>
          <p className="ap-modal__desc">Set a new password for <strong>{rider.full_name}</strong>.</p>
          <div className="ap-form-field">
            <label className="ap-form-label">New password *</label>
            <input
              className="ap-form-input"
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className="ap-form-field">
            <label className="ap-form-label">Confirm password *</label>
            <input
              className="ap-form-input"
              type="password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(''); }}
              placeholder="Re-enter new password"
              autoComplete="new-password"
            />
          </div>
          {error && <p className="ap-form-error">{error}</p>}
          <div className="ap-modal__footer">
            <button type="button" className="ap-btn ap-btn--ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="ap-btn ap-btn--primary" disabled={loading} aria-busy={loading}>
              {loading ? <Spinner /> : 'Reset password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Confirm Status Modal ──────────────────────────────────────────────────────
function ConfirmStatusModal({ rider, targetStatus, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const isDeactivate = targetStatus === 'inactive';

  const handle = async () => {
    setLoading(true);
    try { await onConfirm(); onClose(); }
    catch { /* toast handled upstream */ }
    finally { setLoading(false); }
  };

  return (
    <div className="ap-overlay" onClick={onClose}>
      <div className="ap-modal ap-modal--sm ap-modal--confirm" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`ap-confirm__icon ap-confirm__icon--${isDeactivate ? 'danger' : 'success'}`} aria-hidden="true">
          {isDeactivate ? '⚠' : '✓'}
        </div>
        <h3 className="ap-confirm__title">
          {isDeactivate ? 'Deactivate Rider?' : 'Activate Rider?'}
        </h3>
        <p className="ap-confirm__msg">
          {isDeactivate
            ? `${rider.full_name} will no longer appear in the assignment dropdown.`
            : `${rider.full_name} will be available for delivery assignments.`
          }
        </p>
        <div className="ap-confirm__actions">
          <button className="ap-btn ap-btn--ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className={`ap-btn ${isDeactivate ? 'ap-btn--danger' : 'ap-btn--primary'}`}
            onClick={handle}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? <Spinner /> : isDeactivate ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RidersPage() {
  const [riders,       setRiders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [search,       setSearch]       = useState('');
  const [formModal,    setFormModal]    = useState(null); // null | { rider?: obj }
  const [resetModal,   setResetModal]   = useState(null); // rider obj
  const [statusModal,  setStatusModal]  = useState(null); // { rider, targetStatus }

  const { toasts, dismiss, toast } = useToast();

  const fetchRiders = useCallback(async () => {
    try {
      setError('');
      const data = await adminRidersAPI.getAll();
      setRiders(data?.riders || data?.data?.riders || []);
    } catch (err) {
      setError('Failed to load riders. Please try again.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRiders(); }, [fetchRiders]);

  const handleStatusChange = async (rider, targetStatus) => {
    try {
      await adminRidersAPI.updateStatus(rider.id, targetStatus);
      toast.success(
        targetStatus === 'inactive'
          ? `${rider.full_name} deactivated.`
          : `${rider.full_name} activated.`
      );
      await fetchRiders();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Status update failed.');
    }
  };

  const filtered = riders.filter(r => {
    const q = search.toLowerCase();
    return !q ||
      r.full_name.toLowerCase().includes(q) ||
      r.mobile_number.includes(q) ||
      (r.email?.toLowerCase().includes(q)) ||
      (r.plate_number?.toLowerCase().includes(q));
  });

  const counts = {
    available:   riders.filter(r => r.status === 'available').length,
    on_delivery: riders.filter(r => r.status === 'on_delivery').length,
    inactive:    riders.filter(r => r.status === 'inactive').length,
  };

  return (
    <div className="ap-page">
      <Toasts toasts={toasts} dismiss={dismiss} />

      {/* Header */}
      <div className="ap-page__header">
        <div>
          <h1 className="ap-page__title">Riders</h1>
          <p className="ap-page__sub">Manage rider accounts and credentials</p>
        </div>
        <button className="ap-btn ap-btn--primary" onClick={() => setFormModal({})}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add rider
        </button>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div className="ap-stats-row">
          <div className="ap-stat-chip ap-stat-chip--green">
            <span className="ap-stat-chip__val">{counts.available}</span>
            <span className="ap-stat-chip__label">Available</span>
          </div>
          <div className="ap-stat-chip ap-stat-chip--amber">
            <span className="ap-stat-chip__val">{counts.on_delivery}</span>
            <span className="ap-stat-chip__label">On delivery</span>
          </div>
          <div className="ap-stat-chip">
            <span className="ap-stat-chip__val">{counts.inactive}</span>
            <span className="ap-stat-chip__label">Inactive</span>
          </div>
          <div className="ap-stat-chip">
            <span className="ap-stat-chip__val">{riders.length}</span>
            <span className="ap-stat-chip__label">Total</span>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="ap-search-bar">
        <svg className="ap-search-bar__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="ap-search-bar__input"
          placeholder="Search by name, mobile, email, plate…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search riders"
        />
        {search && (
          <button className="ap-search-bar__clear" onClick={() => setSearch('')} aria-label="Clear search">✕</button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="ap-error-banner" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
          <button className="ap-btn ap-btn--ghost ap-btn--xs" onClick={fetchRiders}>Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="ap-table-wrap">
        <table className="ap-table" aria-label="Riders list">
          <thead>
            <tr>
              <th className="ap-table__th">Name</th>
              <th className="ap-table__th">Mobile</th>
              <th className="ap-table__th">Email</th>
              <th className="ap-table__th">Vehicle</th>
              <th className="ap-table__th">Status</th>
              <th className="ap-table__th ap-table__th--right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} aria-hidden="true">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="ap-table__td">
                      <div className="ap-skeleton" style={{ width: `${45 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="ap-empty">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/>
                      <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                    </svg>
                    <p>{search ? 'No riders match your search.' : 'No riders yet. Add the first one.'}</p>
                  </div>
                </td>
              </tr>
            ) : filtered.map(rider => (
              <tr key={rider.id} className="ap-table__row">
                <td className="ap-table__td">
                  <div>
                    <p className="ap-table__primary">{rider.full_name}</p>
                    {rider.plate_number && (
                      <p className="ap-table__secondary">{rider.plate_number}</p>
                    )}
                  </div>
                </td>
                <td className="ap-table__td ap-table__td--mono">{rider.mobile_number}</td>
                <td className="ap-table__td">{rider.email || <span className="ap-table__none">—</span>}</td>
                <td className="ap-table__td">
                  {rider.vehicle_type
                    ? <span>{rider.vehicle_type}</span>
                    : <span className="ap-table__none">—</span>
                  }
                </td>
                <td className="ap-table__td"><StatusBadge status={rider.status} /></td>
                <td className="ap-table__td ap-table__td--right">
                  <div className="ap-table__actions">
                    <button
                      className="ap-btn ap-btn--ghost ap-btn--xs"
                      onClick={() => setFormModal({ rider })}
                    >
                      Edit
                    </button>
                    <button
                      className="ap-btn ap-btn--ghost ap-btn--xs"
                      onClick={() => setResetModal(rider)}
                    >
                      Reset pw
                    </button>
                    {rider.status !== 'on_delivery' && (
                      <button
                        className={`ap-btn ap-btn--xs ${rider.status === 'inactive' ? 'ap-btn--primary' : 'ap-btn--ghost ap-btn--danger-ghost'}`}
                        onClick={() => setStatusModal({
                          rider,
                          targetStatus: rider.status === 'inactive' ? 'available' : 'inactive',
                        })}
                      >
                        {rider.status === 'inactive' ? 'Activate' : 'Deactivate'}
                      </button>
                    )}
                    {rider.status === 'on_delivery' && (
                      <span className="ap-table__note">On delivery</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && filtered.length > 0 && (
          <div className="ap-table__footer">
            Showing <strong>{filtered.length}</strong> of <strong>{riders.length}</strong> riders
          </div>
        )}
      </div>

      {/* Modals */}
      {formModal && (
        <RiderFormModal
          rider={formModal.rider || null}
          onClose={() => setFormModal(null)}
          onSaved={fetchRiders}
          toast={toast}
        />
      )}

      {resetModal && (
        <ResetPasswordModal
          rider={resetModal}
          onClose={() => setResetModal(null)}
          toast={toast}
        />
      )}

      {statusModal && (
        <ConfirmStatusModal
          rider={statusModal.rider}
          targetStatus={statusModal.targetStatus}
          onClose={() => setStatusModal(null)}
          onConfirm={() => handleStatusChange(statusModal.rider, statusModal.targetStatus)}
        />
      )}
    </div>
  );
}