import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/MobileFilter.css';

export function FilterTrigger({ open, onClick, active = false, label = 'Filters' }) {
  return (
    <button
      type="button"
      className={`mf-trigger${active ? ' mf-trigger--active' : ''}`}
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={label}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="7" y1="12" x2="17" y2="12" />
        <line x1="10" y1="18" x2="14" y2="18" />
      </svg>
      {active && <span className="mf-trigger__dot" aria-hidden="true" />}
    </button>
  );
}

export function FilterInline({ children }) {
  return <div className="mf-inline">{children}</div>;
}

export default function FilterModal({ open, onClose, title = 'Filters', children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = dialogRef.current.querySelectorAll(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.prototype.filter.call(nodes, (n) => !n.disabled && n.offsetParent !== null);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const first = dialogRef.current && dialogRef.current.querySelector('select, input, button');
      if (first) first.focus();
    }, 0);

    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (opener && opener.focus) opener.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="mf-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div className="mf-modal" role="dialog" aria-modal="true" aria-label={title} ref={dialogRef}>
        <div className="mf-modal__head">
          <h2 className="mf-modal__title">{title}</h2>
          <button type="button" className="mf-modal__close" onClick={onClose} aria-label="Close filters">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="mf-modal__body">{children}</div>
        <div className="mf-modal__foot">
          <button type="button" className="mf-modal__done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
