/**
 * DashboardSwitcher — no external CSS file, styles are injected via <style> tag.
 * Drop this single file into src/components/ and it works standalone.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const STYLES = `
@keyframes ds-spin { to { transform: rotate(360deg); } }
@keyframes ds-drop-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
@keyframes ds-fade-in { from { opacity:0; } to { opacity:1; } }
@keyframes ds-modal-in { from { opacity:0; transform:scale(0.96) translateY(6px); } to { opacity:1; transform:scale(1) translateY(0); } }

.ds-wrap { position:relative; display:inline-flex; align-items:center; }

.ds-trigger {
  display:inline-flex; align-items:center; gap:6px;
  padding:6px 10px;
  background:rgba(255,255,255,0.07);
  border:1px solid rgba(255,255,255,0.12);
  border-radius:8px;
  color:rgba(232,224,212,0.75);
  font-size:0.75rem; font-family:var(--font-body,sans-serif); font-weight:500;
  cursor:pointer; transition:background 0.15s,color 0.15s,border-color 0.15s;
  white-space:nowrap;
}
.ds-trigger:hover:not(:disabled) { background:rgba(255,255,255,0.12); color:rgba(232,224,212,1); border-color:rgba(255,255,255,0.2); }
.ds-trigger--open { background:rgba(255,255,255,0.13); color:#e8e0d4; border-color:rgba(201,150,60,0.4); }
.ds-trigger:disabled { opacity:0.5; cursor:not-allowed; }
.ds-trigger__label { letter-spacing:0.01em; }
.ds-caret { transition:transform 0.15s; }
.ds-caret--up { transform:rotate(180deg); }
.ds-spinner { animation:ds-spin 0.7s linear infinite; }

.ds-dropdown {
  position:absolute; top:calc(100% + 6px); right:0; min-width:180px;
  background:#1e1c17; border:1px solid rgba(255,255,255,0.12);
  border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.45);
  z-index:999; overflow:hidden; animation:ds-drop-in 0.12s ease;
}
.ds-dropdown__header {
  padding:8px 12px 6px; font-size:0.625rem; font-weight:600;
  letter-spacing:0.08em; text-transform:uppercase;
  color:rgba(232,224,212,0.35); border-bottom:1px solid rgba(255,255,255,0.07); margin-bottom:4px;
}
.ds-dropdown__item {
  display:flex; align-items:center; gap:10px; width:100%; padding:9px 12px;
  background:none; border:none; color:rgba(232,224,212,0.8);
  font-size:0.8125rem; font-family:var(--font-body,sans-serif);
  cursor:pointer; transition:background 0.12s; text-align:left;
}
.ds-dropdown__item:hover:not(:disabled) { background:rgba(255,255,255,0.07); color:#e8e0d4; }
.ds-dropdown__item:disabled { opacity:0.4; cursor:default; }
.ds-dropdown__icon { display:flex; align-items:center; color:rgba(201,150,60,0.7); flex-shrink:0; }
.ds-dropdown__name { flex:1; font-weight:500; }
.ds-dropdown__pin-badge { display:flex; align-items:center; color:rgba(232,224,212,0.35); flex-shrink:0; }
.ds-dropdown__current { font-size:0.625rem; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:rgba(201,150,60,0.6); flex-shrink:0; }

.ds-pin-overlay {
  position:fixed; inset:0; background:rgba(0,0,0,0.6);
  display:flex; align-items:center; justify-content:center;
  z-index:1200; backdrop-filter:blur(2px); animation:ds-fade-in 0.12s ease;
}
.ds-pin-modal {
  background:#1e1c17; border:1px solid rgba(255,255,255,0.12);
  border-radius:14px; width:100%; max-width:340px;
  box-shadow:0 20px 60px rgba(0,0,0,0.6); animation:ds-modal-in 0.15s ease;
}
.ds-pin-modal__head {
  display:flex; align-items:center; justify-content:space-between;
  padding:16px 18px 12px; border-bottom:1px solid rgba(255,255,255,0.08);
}
.ds-pin-modal__title { font-size:0.875rem; font-weight:600; color:#e8e0d4; line-height:1.35; }
.ds-pin-modal__close {
  background:none; border:none; color:rgba(232,224,212,0.4);
  cursor:pointer; font-size:0.875rem; padding:2px 4px; border-radius:4px; transition:color 0.12s;
}
.ds-pin-modal__close:hover { color:#e8e0d4; }
.ds-pin-modal__sub { font-size:0.75rem; color:rgba(232,224,212,0.45); padding:10px 18px 0; margin:0; line-height:1.5; }
.ds-pin-input {
  display:block; width:calc(100% - 36px); margin:14px 18px 0;
  padding:10px 14px; background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.12); border-radius:8px;
  color:#e8e0d4; font-size:1.125rem; letter-spacing:0.25em;
  font-family:var(--font-body,sans-serif); text-align:center;
  transition:border-color 0.15s; outline:none;
}
.ds-pin-input:focus { border-color:rgba(201,150,60,0.5); }
.ds-pin-input--error { border-color:rgba(239,68,68,0.6); }
.ds-pin-modal__error { font-size:0.75rem; color:#f87171; padding:6px 18px 0; margin:0; }
.ds-pin-modal__actions { display:flex; justify-content:flex-end; gap:8px; padding:16px 18px; }
.ds-pin-btn {
  padding:8px 16px; border-radius:8px; font-size:0.8125rem; font-weight:600;
  font-family:var(--font-body,sans-serif); cursor:pointer;
  transition:background 0.15s,opacity 0.15s; border:none;
}
.ds-pin-btn:disabled { opacity:0.45; cursor:not-allowed; }
.ds-pin-btn--ghost { background:rgba(255,255,255,0.07); color:rgba(232,224,212,0.7); border:1px solid rgba(255,255,255,0.1); }
.ds-pin-btn--ghost:hover:not(:disabled) { background:rgba(255,255,255,0.12); }
.ds-pin-btn--primary { background:#c9963c; color:#1a1712; }
.ds-pin-btn--primary:hover:not(:disabled) { background:#d9a84c; }
`;

const DASHBOARD_HOME = {
  cashier:       '/cashier',
  kitchen_staff: '/kitchen',
  staff:         '/staff/inventory',
  owner:         '/manager/dashboard',
};

const DASHBOARD_LABELS = {
  cashier:       'Cashier',
  kitchen_staff: 'Kitchen',
  staff:         'Staff',
  owner:         'Manager',
};

function DashboardIcon({ role, size = 14 }) {
  const icons = {
    cashier: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    kitchen_staff: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/>
      </svg>
    ),
    staff: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      </svg>
    ),
    owner: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  };
  return icons[role] || null;
}

function PinModal({ open, targetLabel, onConfirm, onCancel, loading, error }) {
  const [pin, setPin] = useState('');
  const inputRef = useRef();

  useEffect(() => {
    if (open) { setPin(''); setTimeout(() => inputRef.current?.focus(), 80); }
  }, [open]);

  if (!open) return null;

  function handleKey(e) {
    if (e.key === 'Enter' && pin.length >= 4) onConfirm(pin);
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div className="ds-pin-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="ds-pin-modal" role="dialog" aria-modal="true" aria-labelledby="ds-pin-title">
        <div className="ds-pin-modal__head">
          <span className="ds-pin-modal__title" id="ds-pin-title">
            Enter PIN to switch to {targetLabel}
          </span>
          <button className="ds-pin-modal__close" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>
        <p className="ds-pin-modal__sub">This dashboard requires a PIN to access.</p>
        <input
          ref={inputRef}
          className={`ds-pin-input${error ? ' ds-pin-input--error' : ''}`}
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter PIN"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={handleKey}
          autoComplete="off"
          aria-label="Dashboard switch PIN"
        />
        {error && <p className="ds-pin-modal__error">{error}</p>}
        <div className="ds-pin-modal__actions">
          <button className="ds-pin-btn ds-pin-btn--ghost" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            className="ds-pin-btn ds-pin-btn--primary"
            onClick={() => onConfirm(pin)}
            disabled={loading || pin.length < 4}
          >
            {loading ? 'Switching…' : 'Switch'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardSwitcher() {
  const { user, switchOptions, switchDashboard } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen]           = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pinTarget, setPinTarget] = useState(null);
  const [pinError, setPinError]   = useState('');
  const dropRef = useRef();

  // Inject styles once
  useEffect(() => {
    const id = 'ds-styles';
    if (!document.getElementById(id)) {
      const tag = document.createElement('style');
      tag.id = id;
      tag.textContent = STYLES;
      document.head.appendChild(tag);
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (!dropRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!switchOptions || switchOptions.length === 0) return null;

  async function handleSelect(option) {
    setOpen(false);
    if (option.requires_pin) {
      setPinTarget(option);
      setPinError('');
      return;
    }
    await doSwitch(option.dashboard, null);
  }

  async function doSwitch(dashboard, pin) {
    setSwitching(true);
    try {
      await switchDashboard(dashboard, pin);
      setPinTarget(null);
      navigate(DASHBOARD_HOME[dashboard] || '/');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Switch failed.';
      if (pinTarget) setPinError(msg);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <>
      <div className="ds-wrap" ref={dropRef}>
        <button
          className={`ds-trigger${open ? ' ds-trigger--open' : ''}`}
          onClick={() => setOpen(o => !o)}
          disabled={switching}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Switch dashboard"
          title="Switch dashboard"
        >
          {switching ? (
            <svg className="ds-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".25"/>
              <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          )}
          <span className="ds-trigger__label">Switch</span>
          <svg className={`ds-caret${open ? ' ds-caret--up' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {open && (
          <div className="ds-dropdown" role="listbox" aria-label="Available dashboards">
            <div className="ds-dropdown__header">Switch dashboard</div>
            {switchOptions.map(option => (
              <button
                key={option.dashboard}
                className="ds-dropdown__item"
                role="option"
                aria-selected={option.dashboard === user?.role}
                onClick={() => handleSelect(option)}
                disabled={option.dashboard === user?.role}
              >
                <span className="ds-dropdown__icon">
                  <DashboardIcon role={option.dashboard} />
                </span>
                <span className="ds-dropdown__name">
                  {DASHBOARD_LABELS[option.dashboard] || option.dashboard}
                </span>
                {option.requires_pin && (
                  <span className="ds-dropdown__pin-badge" title="PIN required">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </span>
                )}
                {option.dashboard === user?.role && (
                  <span className="ds-dropdown__current">Current</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <PinModal
        open={!!pinTarget}
        targetLabel={DASHBOARD_LABELS[pinTarget?.dashboard] || pinTarget?.dashboard}
        onConfirm={pin => doSwitch(pinTarget.dashboard, pin)}
        onCancel={() => { setPinTarget(null); setPinError(''); }}
        loading={switching}
        error={pinError}
      />
    </>
  );
}