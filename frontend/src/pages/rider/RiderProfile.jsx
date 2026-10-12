import { useState, useEffect } from 'react';
import { getRiderProfile, updateRiderProfile } from '../../services/riderApi';
import { useAuth } from '../../context/AuthContext';
import '../../styles/RiderProfile.css';

function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}
function IconSave() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function IconX() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

const VEHICLE_TYPES = ['Motorcycle', 'Bicycle', 'E-bike', 'Car', 'Other'];

export default function RiderProfile() {
  const { logout } = useAuth();
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await getRiderProfile();
        setProfile(res.rider);
        setForm({
          plate_number: res.rider.plate_number || '',
          vehicle_type: res.rider.vehicle_type || '',
          mobile_number: res.rider.mobile_number || '',
        });
      } catch (err) {
        setError('Failed to load profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await updateRiderProfile(form);
      setProfile((prev) => ({ ...prev, ...res.rider }));
      setEditing(false);
      setSuccess('Profile updated.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setForm({
      plate_number: profile?.plate_number || '',
      vehicle_type: profile?.vehicle_type || '',
      mobile_number: profile?.mobile_number || '',
    });
    setEditing(false);
    setError('');
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  if (loading) {
    return (
      <div className="rp-loading" role="status" aria-live="polite">
        <div className="rp-skel rp-skel--avatar" />
        <div className="rp-skel rp-skel--line" />
        <div className="rp-skel rp-skel--line rp-skel--short" />
      </div>
    );
  }

  return (
    <div className="rp-root">
      <header className="rp-header">
        <h1 className="rp-header__title">Profile</h1>
      </header>

      {error && (
        <div className="rp-alert rp-alert--error" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}
      {success && (
        <div className="rp-alert rp-alert--success" role="status" aria-live="polite">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {success}
        </div>
      )}

      {/* ── Avatar + name card ── */}
      <div className="rp-avatar-card">
        <div className="rp-avatar" aria-hidden="true">
          {profile?.full_name?.charAt(0)?.toUpperCase() || 'R'}
        </div>
        <div className="rp-avatar-card__info">
          <h2 className="rp-avatar-card__name">{profile?.full_name}</h2>
          <span className="rp-avatar-card__email">{profile?.email}</span>
          <span className={`rp-status-pill rp-status-pill--${profile?.status}`}>
            {profile?.status === 'available' ? 'Available'
              : profile?.status === 'on_delivery' ? 'On Delivery'
              : 'Inactive'}
          </span>
        </div>
      </div>

      {/* ── Read-only info ── */}
      <div className="rp-section">
        <h3 className="rp-section__label">Account Info</h3>
        <div className="rp-fields">
          <div className="rp-field">
            <span className="rp-field__label">Full Name</span>
            <span className="rp-field__value">{profile?.full_name || '—'}</span>
          </div>
          <div className="rp-field">
            <span className="rp-field__label">Email</span>
            <span className="rp-field__value">{profile?.email || '—'}</span>
          </div>
          <div className="rp-field">
            <span className="rp-field__label">Last Login</span>
            <span className="rp-field__value">{formatDate(profile?.last_login)}</span>
          </div>
        </div>
      </div>

      {/* ── Editable info ── */}
      <div className="rp-section">
        <div className="rp-section__head">
          <h3 className="rp-section__label">Vehicle & Contact</h3>
          {!editing && (
            <button className="rp-btn rp-btn--ghost rp-btn--sm" onClick={() => setEditing(true)}>
              <IconEdit />
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="rp-edit-form">
            <div className="rp-form-field">
              <label htmlFor="rp-mobile" className="rp-form-field__label">Mobile Number</label>
              <input
                id="rp-mobile"
                type="tel"
                inputMode="tel"
                className="rp-form-field__input"
                value={form.mobile_number}
                onChange={(e) => setForm((p) => ({ ...p, mobile_number: e.target.value }))}
                maxLength={11}
              />
            </div>
            <div className="rp-form-field">
              <label htmlFor="rp-plate" className="rp-form-field__label">Plate Number</label>
              <input
                id="rp-plate"
                type="text"
                className="rp-form-field__input"
                value={form.plate_number}
                onChange={(e) => setForm((p) => ({ ...p, plate_number: e.target.value }))}
                placeholder="e.g. ABC 1234"
              />
            </div>
            <div className="rp-form-field">
              <label htmlFor="rp-vehicle" className="rp-form-field__label">Vehicle Type</label>
              <select
                id="rp-vehicle"
                className="rp-form-field__input rp-form-field__select"
                value={form.vehicle_type}
                onChange={(e) => setForm((p) => ({ ...p, vehicle_type: e.target.value }))}
              >
                <option value="">Select type</option>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="rp-edit-actions">
              <button className="rp-btn rp-btn--ghost" onClick={cancelEdit} disabled={saving}>
                <IconX /> Cancel
              </button>
              <button className="rp-btn rp-btn--primary" onClick={handleSave} disabled={saving} aria-busy={saving}>
                {saving
                  ? <span className="rp-spinner" aria-label="Saving" />
                  : <><IconSave /> Save Changes</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="rp-fields">
            <div className="rp-field">
              <span className="rp-field__label">Mobile Number</span>
              <span className="rp-field__value">{profile?.mobile_number || '—'}</span>
            </div>
            <div className="rp-field">
              <span className="rp-field__label">Plate Number</span>
              <span className="rp-field__value">{profile?.plate_number || '—'}</span>
            </div>
            <div className="rp-field">
              <span className="rp-field__label">Vehicle Type</span>
              <span className="rp-field__value">{profile?.vehicle_type || '—'}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Sign out ── */}
      <button className="rp-btn rp-btn--danger rp-btn--full" onClick={logout}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign Out
      </button>
    </div>
  );
}