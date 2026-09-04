import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../../styles/Login.css';
import logo from '../../assets/logo.png';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { setError('Please fill in all fields.'); return; }
    setLoading(true); setError('');
    try {
      const userData = await login(form);
      navigate(userData.role === 'owner' ? '/manager/dashboard' : '/manager/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials. Try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="login-root">
      {/* ── LEFT: Brand panel ─────────────────────────────── */}
      <div className="login-brand" aria-hidden="true">
        <div className="login-brand__deco" aria-hidden="true" />
        <div className="login-brand__ink-circle" aria-hidden="true" />
        <div className="login-brand__shadow-pool" aria-hidden="true" />
        <div className="login-brand__columns" aria-hidden="true">
          <div className="login-brand__col-line" />
          <div className="login-brand__col-line" />
          <div className="login-brand__col-line" />
        </div>
        <div className="login-brand__inner">
          <div className="login-brand__logo">
            <img src={logo} alt="Bingnondo Cafe" className="login-brand__lucky-cat" draggable="false" />
          </div>
          <div className="login-brand__text-group">
            <div className="login-brand__charm">
              <div className="login-brand__charm-bar" />
              <p className="login-brand__tagline">
                See the whole house<br />at a glance.
              </p>
            </div>
            <div className="login-brand__rule" />
            <div className="login-brand__tickets">
              <Ticket label="Live Analytics" />
              <Ticket label="Sales Reports" />
              <Ticket label="Operational Oversight" />
            </div>
          </div>
        </div>
        <div className="login-brand__lattice" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="login-brand__dot" />
          ))}
        </div>
      </div>

      {/* ── RIGHT: Form panel ─────────────────────────────── */}
      <div className="login-form-panel">
        <div className="login-form-panel__inner">
          <div className="login-form__header">
            <span className="login-form__role-badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Manager Portal
            </span>
            <h1 className="login-form__title">Sign in to<br />your dashboard</h1>
            <p className="login-form__sub">Bingnondo Cafe — Operational View</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="email" className="login-field__label">Email address</label>
              <div className="login-field__wrap">
                <span className="login-field__icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                </span>
                <input id="email" name="email" type="email" autoComplete="email"
                  className="login-field__input" placeholder="you@bingnondo.com"
                  value={form.email} onChange={handleChange}
                  aria-required="true" aria-describedby={error ? 'login-error' : undefined} />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password" className="login-field__label">Password</label>
              <div className="login-field__wrap">
                <span className="login-field__icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input id="password" name="password" type="password" autoComplete="current-password"
                  className="login-field__input" placeholder="••••••••"
                  value={form.password} onChange={handleChange}
                  aria-required="true" aria-describedby={error ? 'login-error' : undefined} />
              </div>
            </div>

            {error && (
              <p id="login-error" className="login-form__error" role="alert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </p>
            )}

            <button type="submit" className="login-form__submit" disabled={loading} aria-busy={loading}>
              {loading ? (
                <span className="login-form__spinner" aria-label="Signing in…" />
              ) : (
                <>
                  Sign in
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <p className="login-form__footer">
            Demo access: <strong>manager@bingnondo.com</strong> / <strong>manager123</strong>
          </p>
        </div>
      </div>
    </div>
  );
}

function Ticket({ label }) {
  return (
    <div className="login-ticket">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      {label}
    </div>
  );
}
