import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthBrandPanel from './AuthBrandPanel';
import '../../styles/Login.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

      // Rider → /rider/active
      if (userData.type === 'rider') {
        navigate('/rider/active', { replace: true });
        return;
      }

      // Staff → role-based redirect
      const routes = {
        cashier:       '/cashier',
        kitchen_staff: '/kitchen',
        admin:         '/admin',
      };
      navigate(routes[userData.role] || '/', { replace: true });
    } catch (err) {
      if (!err.response) {
        setError("Can't reach the server. Check your connection and that you're on the same network, then try again.");
        return;
      }
      const msg = err.response.data?.message || 'Invalid credentials. Try again.';
      setError(msg.includes('suspended') ? 'Account suspended. Contact your administrator.' : msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="login-root">

      <AuthBrandPanel />

      {/* ── RIGHT: Form panel ─────────────────────────────────── */}
      <div className="login-form-panel">
        <div className="login-form-panel__inner">

          <div className="login-form__header">
            <span className="login-form__role-badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Staff &amp; Rider Portal
            </span>
            <h1 className="login-form__title">Sign in to<br />your station</h1>
            <p className="login-form__sub">Bingnondo Cafe — Internal System</p>
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
                <input
                  id="email" name="email" type="email" autoComplete="email"
                  className="login-field__input"
                  placeholder="you@bingnondo.com"
                  value={form.email} onChange={handleChange}
                  aria-required="true"
                  aria-describedby={error ? 'login-error' : undefined}
                />
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
                <input
                  id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  className="login-field__input login-field__input--has-toggle"
                  placeholder="••••••••"
                  value={form.password} onChange={handleChange}
                  aria-required="true"
                  aria-describedby={error ? 'login-error' : undefined}
                />
                <button
                  type="button"
                  className="login-field__toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="login-form__aux">
              <Link to="/forgot-password" className="login-form__link">Forgot password?</Link>
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
            Having trouble? Contact your <strong>administrator</strong>.
          </p>

        </div>
      </div>

    </div>
  );
}
