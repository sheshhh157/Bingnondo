import { useCallback, useRef, useState } from 'react';

const DRAFT_VERSION = 1;
const DRAFT_PREFIX = 'bingnondo:form-draft';

export function createSessionDraftKey(user, formId, recordId = 'new') {
  const userId = user?.id ?? user?.staff_id ?? user?.email;
  if (userId == null || userId === '') return null;

  const role = user.role ?? user.type ?? 'user';
  return [DRAFT_PREFIX, role, userId, formId, recordId]
    .map((part) => encodeURIComponent(String(part)))
    .join(':');
}

function readDraft(key, initialValue) {
  if (!key || typeof window === 'undefined') {
    return { value: initialValue, restored: false, error: '' };
  }

  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return { value: initialValue, restored: false, error: '' };

    const parsed = JSON.parse(stored);
    if (
      parsed?.version !== DRAFT_VERSION ||
      !parsed.value ||
      typeof parsed.value !== 'object' ||
      Array.isArray(parsed.value)
    ) {
      window.sessionStorage.removeItem(key);
      return {
        value: initialValue,
        restored: false,
        error: 'The saved draft could not be restored and was cleared.',
      };
    }

    return {
      value: { ...initialValue, ...parsed.value },
      restored: true,
      error: '',
    };
  } catch {
    return {
      value: initialValue,
      restored: false,
      error: 'The saved draft could not be read. Your current entries are not being restored.',
    };
  }
}

export default function useSessionDraft(key, initialValue) {
  const baselineRef = useRef(initialValue);
  const [snapshot, setSnapshot] = useState(() => readDraft(key, initialValue));
  const [error, setError] = useState(snapshot.error);
  const [restored, setRestored] = useState(snapshot.restored);

  const save = useCallback((value) => {
    if (!key || typeof window === 'undefined') return;

    try {
      if (JSON.stringify(value) === JSON.stringify(baselineRef.current)) {
        window.sessionStorage.removeItem(key);
        setRestored(false);
      } else {
        window.sessionStorage.setItem(key, JSON.stringify({
          version: DRAFT_VERSION,
          value,
        }));
      }
      setError('');
    } catch {
      setError('Your draft could not be saved in this browser session. Keep this page open to avoid losing your entries.');
    }
  }, [key]);

  const clear = useCallback(() => {
    let clearError = '';
    if (key && typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        clearError = 'The saved draft could not be cleared from this browser session.';
      }
    }
    setSnapshot({ value: baselineRef.current, restored: false, error: clearError });
    setRestored(false);
    setError(clearError);
  }, [key]);

  return {
    initialValue: snapshot.value,
    restored,
    error,
    save,
    clear,
  };
}
