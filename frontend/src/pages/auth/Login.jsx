import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Login.css';

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
    if (!form.email || !form.password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const userData = await login(form);
      if (userData.role === 'cashier') navigate('/cashier');
      else if (userData.role === 'kitchen_staff') navigate('/kitchen');
      else if (userData.role === 'staff') navigate('/staff');
      else if (userData.role === 'owner') navigate('/owner');
      else if (userData.role === 'admin') navigate('/admin');
      else navigate('/');
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid credentials. Try again.';
      if (msg.includes('suspended')) setError('Account suspended. Contact your administrator.');
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">
      {/* Left — Brand panel */}
      <div className="login-brand" aria-hidden="true">
        <div className="login-brand__inner">
          <div className="login-brand__logo">
            <BingnondoMark />
          </div>
          <p className="login-brand__tagline">Every great dish<br />starts at the counter.</p>
          <div className="login-brand__tickets">
            <Ticket label="Counter Orders" />
            <Ticket label="Quick Checkout" />
            <Ticket label="Real-time Kitchen" />
          </div>
        </div>
        <div className="login-brand__grid" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} className="login-brand__dot" />
          ))}
        </div>
      </div>

      {/* Right — Form panel */}
      <div className="login-form-panel">
        <div className="login-form-panel__inner">
          <div className="login-form__header">
            <span className="login-form__role-badge">Staff Portal</span>
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
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  className="login-field__input"
                  placeholder="you@bingnondo.com"
                  value={form.email}
                  onChange={handleChange}
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
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="login-field__input"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  aria-required="true"
                  aria-describedby={error ? 'login-error' : undefined}
                />
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

            <button
              type="submit"
              className="login-form__submit"
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? (
                <span className="login-form__spinner" aria-label="Signing in…" />
              ) : (
                <>
                  Sign in
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

// ─── Sub-components ────────────────────────────────────────────────────────

function BingnondoMark() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Bingnondo Cafe logo mark">
      <rect width="56" height="56" rx="16" fill="white" fillOpacity="0.15"/>
      <path d="M14 20C14 17.8 15.8 16 18 16H26C29.3 16 32 18.7 32 22C32 23.5 31.4 24.9 30.4 25.9C32.5 26.9 34 29.1 34 31.6C34 35.1 31.1 38 27.6 38H18C15.8 38 14 36.2 14 34V20Z" fill="white"/>
      <circle cx="38" cy="22" r="6" fill="white" fillOpacity="0.5"/>
      <path d="M20 24H25C26.7 24 28 22.7 28 21C28 19.3 26.7 18 25 18H20V24Z" fill="#DC2626"/>
      <path d="M20 32H27C28.7 32 30 30.7 30 29C30 27.3 28.7 26 27 26H20V32Z" fill="#DC2626"/>
    </svg>
  );
}

function Ticket({ label }) {
  return (
    <div className="login-ticket">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      {label}
    </div>
  );
}