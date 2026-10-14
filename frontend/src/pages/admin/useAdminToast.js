import { useMemo } from 'react';
import { useToast } from '../../context/ToastContext';

// ── Toast adapter (single shared stack) ──────────────────────────────────
// Delegates the admin pages' success/error/info sugar to the app-wide
// ToastProvider so every toast renders through one global container.
export function useAdminToast() {
  const { toast } = useToast();
  // Memoise the adapter so `toast` keeps a stable identity across renders.
  // Callers can then safely list it in useCallback/useEffect deps — an
  // unstable object here previously caused refetch loops.
  return useMemo(() => ({
    toast: {
      success: m => toast({ title: m }),
      error: m => toast({ title: m, variant: 'danger' }),
      info: m => toast({ title: m }),
    },
  }), [toast]);
}
