import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Login.css';
import logo from '../../assets/logo.png';
import bgLandscape from '../../assets/bg-landscape.svg';
import bgDragon from '../../assets/bg-dragon.svg';

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
      const routes = { cashier: '/cashier', kitchen_staff: '/kitchen', staff: '/staff', owner: '/owner', admin: '/admin' };
      navigate(routes[userData.role] || '/');
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid credentials. Try again.';
      setError(msg.includes('suspended') ? 'Account suspended. Contact your administrator.' : msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="login-root">

      {/* ── LEFT: Brand panel ─────────────────────────────────────── */}
      <div className="login-brand" aria-hidden="true">

        {/* SVG decorators — landscape fills bottom, dragon flies in sky */}
        <div className="login-brand__deco" aria-hidden="true">
          {/* Landscape: tree + mountains + birds across full left panel */}
          <img
            src={bgLandscape}
            alt=""
            className="login-brand__landscape"
            draggable="false"
          />
          {/* Dragon: small, positioned upper-right of brand panel like flying */}
          <img
            src={bgDragon}
            alt=""
            className="login-brand__dragon"
            draggable="false"
          />
        </div>

        {/* Decorative: concentric ink circles top-right */}
        <div className="login-brand__ink-circle" aria-hidden="true" />

        {/* Decorative: bottom-left glow pool */}
        <div className="login-brand__shadow-pool" aria-hidden="true" />

        {/* Decorative: vertical column lines */}
        <div className="login-brand__columns" aria-hidden="true">
          <div className="login-brand__col-line" />
          <div className="login-brand__col-line" />
          <div className="login-brand__col-line" />
        </div>

        {/* Main content sits above the decorators */}
        <div className="login-brand__inner">
          <div className="login-brand__logo">
            <img
              src={logo}
              alt="Bingnondo Cafe"
              className="login-brand__lucky-cat"
            />
          </div>

          <div className="login-brand__text-group">
            <div className="login-brand__charm">
              <div className="login-brand__charm-bar" />
              <p className="login-brand__tagline">
                Every great dish<br />starts at the counter.
              </p>
            </div>

            <div className="login-brand__rule" />

            <div className="login-brand__tickets">
              <Ticket label="Counter Orders" />
              <Ticket label="Quick Checkout" />
              <Ticket label="Real-time Kitchen" />
            </div>
          </div>
        </div>

        {/* Bottom-right 3×3 dot lattice */}
        <div className="login-brand__lattice" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="login-brand__dot" />
          ))}
        </div>
      </div>

      {/* ── RIGHT: Form panel ─────────────────────────────────────── */}
      <div className="login-form-panel">
        <div className="login-form-panel__inner">

          <div className="login-form__header">
            <span className="login-form__role-badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Staff Portal
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
                  id="password" name="password" type="password" autoComplete="current-password"
                  className="login-field__input"
                  placeholder="••••••••"
                  value={form.password} onChange={handleChange}
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