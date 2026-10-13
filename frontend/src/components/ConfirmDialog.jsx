import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/ConfirmDialog.css';

const TONE_ICON = {
  danger: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  primary: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.66 1c0 2-3 2.5-3 4"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  const confirmBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (opener && opener.focus) opener.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="cfm-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="presentation"
    >
      <div
        className="cfm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cfm-title"
        aria-describedby={message ? 'cfm-message' : undefined}
      >
        <span className={`cfm__icon cfm__icon--${tone}`} aria-hidden="true">
          {TONE_ICON[tone] || TONE_ICON.danger}
        </span>
        <h2 id="cfm-title" className="cfm__title">{title}</h2>
        {message && <p id="cfm-message" className="cfm__message">{message}</p>}
        <div className="cfm__actions">
          <button type="button" className="cfm__btn cfm__btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmBtnRef}
            className={`cfm__btn cfm__btn--${tone}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
