import { useEffect } from 'react';

/**
 * Sets `data-modal-open` on <body> while a modal is open.
 * NotificationBell.css watches this attribute to hide the floating bell
 * whenever any modal/dialog is active — including portaled ones.
 *
 * Usage: call this inside any modal component, passing your `open` boolean.
 *   useModalBodyFlag(open);
 */
export function useModalBodyFlag(open) {
  useEffect(() => {
    if (!open) return;
    document.body.setAttribute('data-modal-open', 'true');
    return () => {
      document.body.removeAttribute('data-modal-open');
    };
  }, [open]);
}