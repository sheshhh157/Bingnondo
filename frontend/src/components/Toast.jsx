import { useEffect } from 'react';

// ToastContainer — fixed stack of dismissible toasts.
// toast shape: { id, title, desc, variant: 'default'|'success'|'warning'|'danger' }

// A nested ternary stopped scaling once a fourth tone landed, so the modifier
// class is looked up by name instead.
const TONE_CLASS = {
  success: ' ui-toast--success',
  warning: ' ui-toast--warning',
  danger: ' ui-toast--danger',
};

export default function ToastContainer({ toasts, onDismiss, autoDismissMs = 5000 }) {
  return (
    <div className="ui-toast-container" aria-live="polite">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          toast={t}
          onDismiss={() => onDismiss(t.id)}
          autoDismissMs={autoDismissMs}
          variant={t.variant || 'default'}
        />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss, autoDismissMs, variant }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [onDismiss, autoDismissMs]);

  // Only `success` means "done", so it alone gets the checkmark. The default
  // tone is plain information ("New order #12", "Being prepared") and gets a
  // neutral dot — a checkmark there would claim something completed.
  return (
    <div className={`ui-toast${TONE_CLASS[variant] || ''}`} role="status">
      <span className="ui-toast__icon" aria-hidden="true">
        {variant === 'success' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        ) : variant === 'warning' || variant === 'danger' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4" fill="currentColor"/>
          </svg>
        )}
      </span>
      <div className="ui-toast__body">
        <span className="ui-toast__title">{toast.title}</span>
        {toast.desc && <span className="ui-toast__desc">{toast.desc}</span>}
      </div>
      <button className="ui-toast__close" onClick={onDismiss} aria-label="Dismiss notification">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
