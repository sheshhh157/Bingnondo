import { useState, useEffect, useRef } from 'react';
import { getRiderProfile, updateRiderProfile } from '../../services/riderApi';
import { uploadAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
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
  const { logout, updateUser } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getRiderProfile();
        setProfile(res.rider);
        setForm({
          first_name: res.rider.first_name || '',
          middle_name: res.rider.middle_name || '',
          last_name: res.rider.last_name || '',
          plate_number: res.rider.plate_number || '',
          vehicle_type: res.rider.vehicle_type || '',
          mobile_number: res.rider.mobile_number || '',
        });
      } catch {
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
      updateUser(res.rider);
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
      first_name: profile?.first_name || '',
      middle_name: profile?.middle_name || '',
      last_name: profile?.last_name || '',
      plate_number: profile?.plate_number || '',
      vehicle_type: profile?.vehicle_type || '',
      mobile_number: profile?.mobile_number || '',
    });
    setEditing(false);
    setError('');
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Profile photo must be JPG, PNG, or WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is too large. Maximum size is 5MB.');
      return;
    }

    setUploadingPhoto(true);
    setError('');
    try {
      const { data } = await uploadAPI.uploadRiderProfileImage(file);
      setProfile((current) => ({ ...current, ...data.rider }));
      updateUser(data.rider);
      setSuccess('Profile photo updated.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
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
        <div className="rp-avatar-wrap">
          <div className="rp-avatar" aria-hidden="true">
            {profile?.full_name?.charAt(0)?.toUpperCase() || 'R'}
            {profile?.profile_image_url && (
              <img src={profile.profile_image_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            )}
          </div>
          <input
            ref={photoInputRef}
            className="rp-photo-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChange}
            aria-label="Choose profile photo"
          />
          <button
            type="button"
            className="rp-photo-button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? 'Uploading…' : profile?.profile_image_url ? 'Change photo' : 'Add photo'}
          </button>
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
            <span className="rp-field__label">First Name</span>
            <span className="rp-field__value">{profile?.first_name || '—'}</span>
          </div>
          <div className="rp-field">
            <span className="rp-field__label">Middle Name</span>
            <span className="rp-field__value">{profile?.middle_name || '—'}</span>
          </div>
          <div className="rp-field">
            <span className="rp-field__label">Last Name</span>
            <span className="rp-field__value">{profile?.last_name || '—'}</span>
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
          <h3 className="rp-section__label">Personal, Vehicle & Contact</h3>
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
              <label htmlFor="rp-first-name" className="rp-form-field__label">First Name</label>
              <input
                id="rp-first-name"
                type="text"
                className="rp-form-field__input"
                value={form.first_name}
                onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                maxLength={100}
                required
              />
            </div>
            <div className="rp-form-field">
              <label htmlFor="rp-middle-name" className="rp-form-field__label">Middle Name <span>(Optional)</span></label>
              <input
                id="rp-middle-name"
                type="text"
                className="rp-form-field__input"
                value={form.middle_name}
                onChange={(e) => setForm((p) => ({ ...p, middle_name: e.target.value }))}
                maxLength={100}
              />
            </div>
            <div className="rp-form-field">
              <label htmlFor="rp-last-name" className="rp-form-field__label">Last Name</label>
              <input
                id="rp-last-name"
                type="text"
                className="rp-form-field__input"
                value={form.last_name}
                onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                maxLength={100}
                required
              />
            </div>
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
      <button className="rp-btn rp-btn--danger rp-btn--full" onClick={() => setLogoutOpen(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign Out
      </button>

      <ConfirmDialog
        open={logoutOpen}
        title="Sign out?"
        message="You'll be returned to the login screen. Any unsaved changes will be lost."
        confirmLabel="Sign out"
        cancelLabel="Stay"
        tone="danger"
        onConfirm={logout}
        onCancel={() => setLogoutOpen(false)}
      />
    </div>
  );
}