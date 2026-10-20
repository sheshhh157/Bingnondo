import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authClient } from '../../services/apiClient';
import AuthBrandPanel from './AuthBrandPanel';
import '../../styles/Login.css';

const GENERIC_NOTICE = 'If that email is registered, a reset code has been sent.';

const HEADINGS = {
  email: {
    title: <>Forgot your<br />password?</>,
    sub: "Enter your account email and we'll send a 6-digit reset code.",
  },
  code: {
    title: <>Enter your<br />reset code</>,
    sub: null,
  },
  done: {
    title: <>Password<br />updated</>,
    sub: 'Sign in with your new password.',
  },
};

export default function ForgotPassword() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({ otp: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const otpRef = useRef(null);

  useEffect(() => {
    if (step === 'code') otpRef.current?.focus();
  }, [step]);

  const heading = HEADINGS[step];

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
  };

  const handleOtpChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
    setForm((prev) => ({ ...prev, otp: digits }));
    if (error) setError('');
  };

  const describeError = (err, fallback) => {
    if (!err.response) {
      return "Can't reach the server. Check your connection and that you're on the same network, then try again.";
    }
    return err.response.data?.message || fallback;
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    const normalized = email.trim();
    if (!normalized) { setError('Please enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true); setError('');
    try {
      await authClient.forgotPassword(normalized);
      setEmail(normalized);
      setNotice(GENERIC_NOTICE);
      setStep('code');
    } catch (err) {
      setError(describeError(err, 'Could not send the reset code. Try again.'));
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    setLoading(true); setError(''); setNotice('');
    try {
      await authClient.forgotPassword(email);
      setNotice(GENERIC_NOTICE);
    } catch (err) {
      setError(describeError(err, 'Could not send the reset code. Try again.'));
    } finally { setLoading(false); }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(form.otp)) { setError('Enter the 6-digit code from your email.'); return; }
    if (form.newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (form.newPassword !== form.confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      await authClient.resetPassword({
        email,
        otp: form.otp,
        newPassword: form.newPassword,
        confirmPassword: form.confirmPassword,
      });
      setStep('done');
    } catch (err) {
      setError(describeError(err, 'Could not reset the password. Try again.'));
    } finally { setLoading(false); }
  };

  const backToEmail = () => {
    setStep('email'); setError(''); setNotice('');
    setForm({ otp: '', newPassword: '', confirmPassword: '' });
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
              Account Recovery
            </span>
            <h1 className="login-form__title">{heading.title}</h1>
            {step === 'code' ? (
              <p className="login-form__sub login-form__sub--email">Code sent to <strong>{email}</strong></p>
            ) : (
              <p className="login-form__sub">{heading.sub}</p>
            )}
          </div>

          {step === 'email' && (
            <form className="login-form" onSubmit={handleEmailSubmit} noValidate>
              <div className="login-field">
                <label htmlFor="fp-email" className="login-field__label">Email address</label>
                <div className="login-field__wrap">
                  <span className="login-field__icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </span>
                  <input
                    id="fp-email" name="email" type="email" autoComplete="email"
                    className="login-field__input"
                    placeholder="you@bingnondo.com"
                    value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                    aria-required="true"
                    aria-describedby={error ? 'fp-error' : undefined}
                  />
                </div>
              </div>

              {error && (
                <p id="fp-error" className="login-form__error" role="alert">
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
                  <span className="login-form__spinner" aria-label="Sending reset code…" />
                ) : (
                  <>
                    Send reset code
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}

          {step === 'code' && (
            <form className="login-form" onSubmit={handleResetSubmit} noValidate>
              {notice && (
                <p className="login-form__notice" role="status">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  {notice}
                </p>
              )}

              <div className="login-field">
                <label htmlFor="fp-otp" className="login-field__label">6-digit code</label>
                <div className="login-field__wrap">
                  <span className="login-field__icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                    </svg>
                  </span>
                  <input
                    id="fp-otp" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code"
                    className="login-field__input login-field__input--otp"
                    placeholder="000000" maxLength={6}
                    ref={otpRef}
                    value={form.otp} onChange={handleOtpChange}
                    aria-required="true"
                    aria-describedby={error ? 'fp-error' : undefined}
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="fp-new" className="login-field__label">New password</label>
                <div className="login-field__wrap">
                  <span className="login-field__icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                  <input
                    id="fp-new" name="newPassword" type="password" autoComplete="new-password"
                    className="login-field__input"
                    placeholder="Min. 8 characters"
                    value={form.newPassword} onChange={handleChange}
                    aria-required="true"
                    aria-describedby={error ? 'fp-error' : undefined}
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="fp-confirm" className="login-field__label">Confirm new password</label>
                <div className="login-field__wrap">
                  <span className="login-field__icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                  <input
                    id="fp-confirm" name="confirmPassword" type="password" autoComplete="new-password"
                    className="login-field__input"
                    placeholder="Repeat your new password"
                    value={form.confirmPassword} onChange={handleChange}
                    aria-required="true"
                    aria-describedby={error ? 'fp-error' : undefined}
                  />
                </div>
              </div>

              {error && (
                <p id="fp-error" className="login-form__error" role="alert">
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
                  <span className="login-form__spinner" aria-label="Resetting password…" />
                ) : (
                  <>
                    Reset password
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </>
                )}
              </button>

              <div className="login-form__resend">
                Didn&apos;t get the code?{' '}
                <button type="button" className="login-form__linkbtn" onClick={handleResend} disabled={loading}>
                  Resend
                </button>
              </div>

              <div className="login-form__aux">
                <button type="button" className="login-form__linkbtn" onClick={backToEmail}>
                  Use a different email
                </button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <div className="login-form">
              <div className="login-form__success" role="status">
                <span className="login-form__success-icon" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="16 9 11 15 8 12"/>
                  </svg>
                </span>
                <p>Your password has been changed. The old password no longer works.</p>
              </div>

              <Link to="/login" className="login-form__submit login-form__submit--link">
                Back to sign in
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
            </div>
          )}

          <p className="login-form__footer">
            Remembered it? <Link to="/login" className="login-form__link">Back to sign in</Link>
          </p>

        </div>
      </div>

    </div>
  );
}
