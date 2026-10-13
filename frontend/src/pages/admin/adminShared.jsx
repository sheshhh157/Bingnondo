import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext';

// ── Toast adapter (single shared stack) ──────────────────────────────────
// Delegates the admin pages' success/error/info sugar to the app-wide
// ToastProvider so every toast renders through one global container.
export function useAdminToast() {
  const { toast } = useToast();
  return {
    toast: {
      success: m => toast({ title: m }),
      error: m => toast({ title: m, variant: 'danger' }),
      info: m => toast({ title: m }),
    },
  };
}

// ── SpinSkeleton / button etc — small primitives ─────────────────────────
export function Spinner({ size = 16 }) {
  return (
    <svg className="ap-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="var(--color-border-strong)" strokeWidth="2.5"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="var(--color-gold)" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

export function Badge({ type, label }) {
  return (
    <span className={`ap-badge ap-badge--${type}`}>
      <span className="ap-badge__dot" aria-hidden="true"/>
      {label}
    </span>
  );
}

export function Btn({ variant = 'ghost', size = 'md', icon, children, disabled, loading, onClick, type = 'button', className = '', ...props }) {
  return (
    <button
      type={type}
      className={`ap-btn ap-btn--${variant} ap-btn--${size} ${className}`.trim()}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? <Spinner size={13}/> : icon ? <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span> : null}
      {children}
    </button>
  );
}

export function Field({ label, id, error, hint, children }) {
  return (
    <div className="ap-input-wrap">
      {label && <label className="ap-label" htmlFor={id}>{label}</label>}
      {children}
      {hint && <span className="ap-field-hint">{hint}</span>}
      {error && <span className="ap-field-error">{error}</span>}
    </div>
  );
}

export function TextInput({ id, error, prefix, suffix, ...props }) {
  return (
    <div className="ap-input-row">
      {prefix && <span className="ap-input-prefix" aria-hidden="true">{prefix}</span>}
      <input
        id={id}
        className={`ap-input${prefix ? ' ap-input--prefix' : ''}${suffix ? ' ap-input--suffix' : ''}${error ? ' ap-input--error' : ''}`}
        {...props}
      />
      {suffix && <span className="ap-input-suffix">{suffix}</span>}
    </div>
  );
}

export function PasswordInput({ id, error, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="ap-input-row">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className={`ap-input ap-input--suffix${error ? ' ap-input--error' : ''}`}
        {...props}
      />
      <button type="button" className="ap-input-suffix ap-input-suffix--btn" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        )}
      </button>
    </div>
  );
}

export function AppSelect({ id, error, children, ...props }) {
  return (
    <select id={id} className={`ap-select${error ? ' ap-input--error' : ''}`} {...props}>{children}</select>
  );
}

export function Modal({ open, onClose, title, width = 520, headingId = 'modal-title', children }) {
  const ref = useRef();
  const prevFocus = useRef(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement;
    const dialog = ref.current;

    const onKey = e => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter(el => !el.disabled && el.offsetParent !== null);
      if (focusables.length === 0) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    const m = dialog.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (m) { if (!m.disabled) m.focus(); }
    else if (dialog) dialog.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      if (prevFocus.current && prevFocus.current.focus) prevFocus.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="ap-overlay" ref={ref} onClick={e => e.target === ref.current && onClose()} role="presentation">
      <div className="ap-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1}>
        <div className="ap-modal__head">
          <span className="ap-modal__title" id={headingId}>{title}</span>
          <button className="ap-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="ap-modal__body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, loading, title, message, confirmLabel = 'Confirm', variant = 'danger' }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={400}>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted-foreground)', lineHeight: 1.6, margin: 0 }}>{message}</p>
      <div className="ap-modal__footer">
        <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
        <Btn variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

// Compact windowed page list: always shows first/last, ±1 around the current
// page, and an ellipsis for the gaps.
function pageList(current, total) {
  const pages = [];
  const delta = 1;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }
  return pages;
}

export function Pagination({ page = 1, total = 1, onPage, label = 'Pagination' }) {
  if (total <= 1) return null;
  return (
    <nav className="ap-pager" aria-label={label}>
      <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">←</Btn>
      {pageList(page, total).map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} className="ap-pager__ellipsis" aria-hidden="true">…</span>
          : <Btn key={p} variant={p === page ? 'gold' : 'ghost'} size="sm" onClick={() => onPage(p)} aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined}>{p}</Btn>
      )}
      <Btn variant="ghost" size="sm" disabled={page >= total} onClick={() => onPage(page + 1)} aria-label="Next page">→</Btn>
    </nav>
  );
}

// ── Page header (shared pattern) ──────────────────────────────────────────
export function PageHeader({ title, chip, sub, action }) {
  return (
    <div className="ap-page__header">
      <div>
        <div className="ap-page-head__top">
          <h1 className="ap-page__title">{title}</h1>
          {chip != null && chip !== '' && <span className="ap-count-chip">{chip}</span>}
        </div>
        {sub && <p className="ap-page__sub">{sub}</p>}
      </div>
      {action && <div className="ap-page__actions">{action}</div>}
    </div>
  );
}

// ── Labelled row action (icon + label; icon-only below 1100px) ─────────────
export function RowAction({ icon, label, tooltip, srLabel, onClick, disabled, variant = 'default' }) {
  return (
    <button
      className={`ap-row-btn ap-row-action ap-row-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={tooltip || srLabel || label}
      aria-label={srLabel || label}
    >
      {icon}
      {label && <span className="ap-row-action__label">{label}</span>}
    </button>
  );
}