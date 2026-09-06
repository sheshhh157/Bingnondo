import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocketEventContext } from '../context/SocketContext';

// useLiveData — fetch-once data loading with optional socket-driven live
// updates. Replaces the repeated useState + useEffect + load() boilerplate.
//
// Options:
//   fetchFn   : async () => data        required — resolves the initial payload
//   events    : [ { name, merge(prev, payload) } ]   socket subscriptions to patch local state
//   initial   : initial state value (default [])
//
// Returns:
//   { data, loading, error, refresh }
export default function useLiveData({ fetchFn, events = [], initial = [] }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { lastEvent } = useSocketEventContext();
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // fetchFn is intentionally kept in a ref: every consumer passes an inline
  // arrow function (a new reference each render), so depending on it would
  // recreate `load` every render and re-trigger the fetch effect forever.
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFnRef.current();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Apply socket patches (only after initial fetch completes to avoid
  // merging into the default `initial` shape which may differ from the
  // fetch return shape — e.g., Dashboard/Oversight return objects but
  // `initial` defaults to `[]`).
  useEffect(() => {
    if (loading || !lastEvent) return;
    const handler = eventsRef.current.find((e) => e.name === lastEvent.name);
    if (!handler) return;
    setData((prev) => handler.merge(prev, lastEvent.payload));
  }, [lastEvent, loading]);

  return { data, loading, error, refresh: load, setData };
}
