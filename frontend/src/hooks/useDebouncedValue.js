import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stayed unchanged for `delay` ms.
 *
 * Admin list pages fetch from the server on every keystroke typed into their
 * search box, so a five-letter query fires five requests and the table redraws
 * between each one. Debouncing the value that feeds the fetch (rather than the
 * input's own value) keeps the typing instant while collapsing the burst into a
 * single request.
 */
export default function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
