/**
 * DashboardSwitcher
 * 
 * Props:
 *   variant="dark"  — for dark sidebars/headers (Staff, Kitchen, Cashier) — default
 *   variant="light" — for light sidebars/headers (Manager)
 *   context="header"  — dropdown opens downward, position:absolute — default
 *   context="sidebar" — dropdown opens via position:fixed to escape overflow:hidden clipping
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/DashboardSwitcher.css';

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

function PinModal({ open, targetLabel, onConfirm, onCancel, loading, error, variant }) {
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
      <div className={`ds-pin-modal ds-pin-modal--${variant}`} role="dialog" aria-modal="true" aria-labelledby="ds-pin-title">
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

export default function DashboardSwitcher({ variant = 'dark', context = 'header' }) {
  const { user, switchOptions, switchDashboard } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen]           = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pinTarget, setPinTarget] = useState(null);
  const [pinError, setPinError]   = useState('');
  const [dropPos, setDropPos]     = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef();
  const dropRef    = useRef();

  // For sidebar context: calculate fixed position when opening
  function calcFixedPos() {
    if (context !== 'sidebar' || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropPos({
      // align top with trigger, open to the RIGHT of the sidebar
      top:  rect.top,
      left: rect.right + 8,
      width: 200,
    });
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => {
      const wrapEl = context === 'sidebar' ? triggerRef.current : dropRef.current;
      if (!wrapEl?.contains(e.target) && !dropRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, context]);

  if (!switchOptions || switchOptions.length === 0) return null;

  function handleTrigger() {
    if (!open) calcFixedPos();
    setOpen(o => !o);
  }

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

  const isSidebar = context === 'sidebar';

  const dropdown = open && (
    <div
      ref={dropRef}
      className={`ds-dropdown ds-dropdown--${variant}${isSidebar ? ' ds-dropdown--fixed' : ''}`}
      role="listbox"
      aria-label="Available dashboards"
      style={isSidebar ? { top: dropPos.top, left: dropPos.left, width: dropPos.width } : undefined}
    >
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
  );

  return (
    <>
      <div className={`ds-wrap ds-wrap--${variant}`} ref={isSidebar ? triggerRef : dropRef}>
        <button
          ref={isSidebar ? triggerRef : undefined}
          className={`ds-trigger ds-trigger--${variant}${open ? ' ds-trigger--open' : ''}`}
          onClick={handleTrigger}
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

        {/* header context: dropdown is inside the wrap (position:absolute) */}
        {!isSidebar && dropdown}
      </div>

      {/* sidebar context: dropdown is portaled outside sidebar via position:fixed */}
      {isSidebar && dropdown}

      <PinModal
        open={!!pinTarget}
        targetLabel={DASHBOARD_LABELS[pinTarget?.dashboard] || pinTarget?.dashboard}
        onConfirm={pin => doSwitch(pinTarget.dashboard, pin)}
        onCancel={() => { setPinTarget(null); setPinError(''); }}
        loading={switching}
        error={pinError}
        variant={variant}
      />
    </>
  );
}