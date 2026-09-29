import { createContext, useContext, useMemo, useState } from 'react';
import ToastContainer from '../components/Toast';

// Global toast stack — a lightweight channel for transient feedback (e.g.
// "Refreshed") without threading props through pages. Renders the shared
// ToastContainer, which auto-dismisses each toast after a few seconds.
const ToastContext = createContext(null);

let _toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // Keep at most 5 toasts on screen; during an order burst the 5s
  // auto-dismiss can't keep up, so the stack trims instead of flooding.
  const push = (t) => setToasts((prev) => [...prev, { id: ++_toastId, ...t }].slice(-5));
  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const value = useMemo(
    () => ({ toast: (t) => push(t), dismiss }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}