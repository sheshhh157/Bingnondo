import { useEffect, useState } from 'react';
import { authClient } from '../../services/apiClient';
import { uploadAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import '../../styles/StaffProfile.css';

const EMPTY_FORM = {
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function roleLabel(role) {
  return ({
    cashier: 'Cashier',
    kitchen_staff: 'Kitchen Staff',
    admin: 'Administrator',
  })[role] || role || '—';
}

export default function StaffProfile() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!photoPreview) return undefined;
    return () => URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  useEffect(() => {
    let active = true;
    authClient.profile()
      .then(({ profile: data }) => {
        if (!active) return;
        setProfile(data);
        setForm({
          first_name: data.first_name || '',
          middle_name: data.middle_name || '',
          last_name: data.last_name || '',
          email: data.email || '',
        });
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.message || 'Could not load your profile.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setError('');
    setSuccess('');
    try {
      const { profile: updated } = await authClient.updateProfile(form);
      setProfile(updated);
      setForm({
        first_name: updated.first_name || '',
        middle_name: updated.middle_name || '',
        last_name: updated.last_name || '',
        email: updated.email || '',
      });
      updateUser(updated);
      setEditing(false);
      setSuccess('Profile updated successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const cancelEdit = () => {
    setForm({
      first_name: profile?.first_name || '',
      middle_name: profile?.middle_name || '',
      last_name: profile?.last_name || '',
      email: profile?.email || '',
    });
    setEditing(false);
    setError('');
  };

  const handlePasswordSave = async (event) => {
    event.preventDefault();
    setSavingPassword(true);
    setError('');
    setSuccess('');
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError('New passwords do not match.');
      setSavingPassword(false);
      return;
    }
    try {
      await authClient.changePassword(passwordForm);
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setSuccess('Password changed successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change your password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be 5 MB or smaller.');
      return;
    }

    setError('');
    setSuccess('');
    setUploadingPhoto(true);
    setPhotoPreview(URL.createObjectURL(file));
    try {
      const { data } = await uploadAPI.uploadStaffProfileImage(file);
      const updatedProfile = data.profile;
      setProfile((current) => ({ ...current, ...updatedProfile }));
      updateUser(updatedProfile);
      setSuccess('Profile photo updated.');
    } catch (err) {
      setPhotoPreview('');
      setError(err.response?.data?.message || 'Could not upload your profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return <div className="staff-profile__loading" role="status">Loading profile…</div>;
  }

  return (
    <div className="staff-profile">
      <header className="staff-profile__header">
        <div>
          <h1>My Profile</h1>
          <p>View and update your account information.</p>
        </div>
        {profile && !editing && (
          <button type="button" className="staff-profile__button staff-profile__button--primary" onClick={() => setEditing(true)}>
            Edit profile
          </button>
        )}
      </header>

      {error && <div className="staff-profile__notice staff-profile__notice--error" role="alert">{error}</div>}
      {success && <div className="staff-profile__notice staff-profile__notice--success" role="status">{success}</div>}

      {profile && (
        <>
          <section className="staff-profile__card" aria-labelledby="staff-profile-account-heading">
            <div className="staff-profile__identity">
              <span className="staff-profile__avatar" aria-hidden="true">
                {(photoPreview || profile.profile_image_url)
                  ? <img src={photoPreview || profile.profile_image_url} alt="" />
                  : profile.full_name?.[0]?.toUpperCase() || '?'}
              </span>
              <div>
                <h2>{profile.full_name}</h2>
                <p>{roleLabel(profile.role)}</p>
                <label className="staff-profile__photo-button">
                  {uploadingPhoto ? 'Uploading…' : profile.profile_image_url ? 'Change photo' : 'Add profile photo'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoChange}
                    disabled={uploadingPhoto}
                    aria-label="Upload profile photo"
                  />
                </label>
              </div>
              <span className={`staff-profile__status staff-profile__status--${profile.status}`}>
                {profile.status || 'Unknown'}
              </span>
            </div>

            <div className="staff-profile__section">
              <h2 id="staff-profile-account-heading">Account information</h2>
              {editing ? (
                <form className="staff-profile__form" onSubmit={handleProfileSave}>
                  <label>
                    First name
                    <input
                      required
                      maxLength={100}
                      value={form.first_name}
                      onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))}
                    />
                  </label>
                  <label>
                    Middle name
                    <input
                      maxLength={100}
                      value={form.middle_name}
                      onChange={(event) => setForm((current) => ({ ...current, middle_name: event.target.value }))}
                    />
                  </label>
                  <label>
                    Last name
                    <input
                      required
                      maxLength={100}
                      value={form.last_name}
                      onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))}
                    />
                  </label>
                  <label className="staff-profile__field--wide">
                    Email address
                    <input
                      required
                      type="email"
                      maxLength={254}
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    />
                  </label>
                  <div className="staff-profile__actions staff-profile__field--wide">
                    <button type="button" className="staff-profile__button" onClick={cancelEdit} disabled={savingProfile}>
                      Cancel
                    </button>
                    <button type="submit" className="staff-profile__button staff-profile__button--primary" disabled={savingProfile}>
                      {savingProfile ? 'Saving…' : 'Save profile'}
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="staff-profile__details">
                  <div><dt>Full name</dt><dd>{profile.full_name || '—'}</dd></div>
                  <div><dt>Email</dt><dd>{profile.email || '—'}</dd></div>
                  <div><dt>Role</dt><dd>{roleLabel(profile.role)}</dd></div>
                  <div><dt>Account status</dt><dd>{profile.status || '—'}</dd></div>
                  <div><dt>Account created</dt><dd>{formatDate(profile.created_at)}</dd></div>
                  <div><dt>Last updated</dt><dd>{formatDate(profile.updated_at)}</dd></div>
                </dl>
              )}
            </div>
          </section>

          <section className="staff-profile__card" aria-labelledby="staff-profile-password-heading">
            <div className="staff-profile__section">
              <h2 id="staff-profile-password-heading">Change password</h2>
              <p className="staff-profile__hint">Enter your current password to set a new one. Use at least 8 characters.</p>
              <form className="staff-profile__form" onSubmit={handlePasswordSave}>
                <label>
                  Current password
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={passwordForm.current_password}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
                  />
                </label>
                <label>
                  New password
                  <input
                    required
                    minLength={8}
                    type="password"
                    autoComplete="new-password"
                    value={passwordForm.new_password}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    required
                    minLength={8}
                    type="password"
                    autoComplete="new-password"
                    value={passwordForm.confirm_password}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, confirm_password: event.target.value }))}
                  />
                </label>
                <div className="staff-profile__actions staff-profile__field--wide">
                  <button type="submit" className="staff-profile__button staff-profile__button--primary" disabled={savingPassword}>
                    {savingPassword ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
