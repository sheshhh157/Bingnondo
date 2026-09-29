import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocketEventContext } from '../context/SocketContext';

// useLiveData — fetch-once data loading with optional socket-driven live
// updates. Replaces the repeated useState + useEffect + load() boilerplate.
//
// Options:
//   fetchFn   : async () => data        required — resolves the initial payload
//   events    : [ { name, merge(prev, payload) } ]   socket subscriptions to patch local state
//   refetchEvents : [ 'event:Name' ]  socket events that re-run the fetch instead
//               of patching it in place. Use for state that is an aggregate or
//               otherwise not incrementally patchable — server-computed totals,
//               paged result sets. Merging a single new order into a summary
//               that Postgres derived is a guess; refetching is exact.
//   initial   : initial state value (default [])
//   pollMs    : re-fetch on this interval. Quiet — never flips `loading`, so
//               the page never flashes a spinner between polls.
//   reloadKey : any value; changing it re-runs the fetch (used when a
//               server-side filter changes, e.g. the sales report's period).
//
// Returns:
//   { data, loading, error, refresh, setData, lastUpdated, refreshing }
export default function useLiveData({ fetchFn, events = [], refetchEvents = [], initial = [], pollMs, reloadKey }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const { subscribe } = useSocketEventContext();

  // fetchFn is intentionally kept in a ref: every consumer passes an inline
  // arrow function (a new reference each render), so depending on it would
  // recreate `load` every render and re-trigger the fetch effect forever.
  // Synced in an effect (rather than assigned during render) so the refs are
  // current before any of the effects below can call them. Declared with no
  // dependency list on purpose — it must track every render.
  const fetchFnRef = useRef(fetchFn);
  const eventsRef = useRef(events);
  // Compared by value, so a page passing an inline array literal on every
  // render doesn't re-subscribe each time.
  const refetchKey = refetchEvents.join('|');
  const refetchRef = useRef(refetchKey);
  const reloadKeyRef = useRef(reloadKey);

  useEffect(() => { fetchFnRef.current = fetchFn; });
  useEffect(() => { eventsRef.current = events; });
  useEffect(() => { refetchRef.current = refetchKey; });
  useEffect(() => { reloadKeyRef.current = reloadKey; });

  // ── Lifecycle guards ────────────────────────────────────────────────────────
  // The manager pages fetch multi-megabyte payloads, so a request routinely
  // outlives the route that started it. Without `mountedRef` the response would
  // set state on an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // The single in-flight request, shared by every trigger (initial, poll,
  // manual refresh). A manual refresh that lands while a poll is running joins
  // the running request instead of starting a second multi-megabyte fetch — and
  // it inherits that request's real result, so the toast reports the truth
  // rather than a false "Refresh failed".
  const inFlightRef = useRef({ promise: null, key: null });

  // Socket events that arrived while a snapshot was in flight. A snapshot
  // replaces the whole list, so a patch applied before the snapshot landed
  // would be silently discarded; queue them and re-apply on top of the result.
  const deferredRef = useRef([]);

  /**
   * Merge any queued socket patches on top of a freshly fetched snapshot.
   * Runs inside the setData updater so it always applies to exactly the state
   * the snapshot produced.
   */
  const applyDeferred = useCallback((snapshot) => {
    if (deferredRef.current.length === 0) return snapshot;
    const queued = deferredRef.current;
    deferredRef.current = [];
    return queued.reduce((acc, { name, payload }) => {
      const handler = eventsRef.current.find((e) => e.name === name);
      return handler ? handler.merge(acc, payload) : acc;
    }, snapshot);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetchFnRef.current();
      if (mountedRef.current) {
        setData(applyDeferred(result));
        setError(null);
        setLastUpdated(Date.now());
      }
      return true;
    } catch (err) {
      if (mountedRef.current) setError(err);
      return false;
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, [applyDeferred]);

  /**
   * Run a fetch, coalescing concurrent callers.
   *
   * `key` is the reloadKey the request was started for. A caller with the same
   * key awaits the running request; a caller with a *different* key (the period
   * filter changed) is queued behind it, because the in-flight response was
   * computed for the old filter and must not be served as the new one.
   */
  const run = useCallback(function runFetch(silent, key) {
    const current = inFlightRef.current;
    if (current.promise) {
      if (current.key === key) return current.promise;
      current.promise.then(() => { if (mountedRef.current) runFetch(silent, key); });
      return false;
    }
    const entry = { promise: null, key };
    entry.promise = load(silent).finally(() => {
      if (inFlightRef.current === entry) inFlightRef.current = { promise: null, key: null };
    });
    inFlightRef.current = entry;
    return entry.promise;
  }, [load]);

  // Quiet poll loop — never touches `loading` (see the doc comment) and never
  // stacks, because every path goes through `run`.
  useEffect(() => {
    const ms = Number(pollMs);
    if (!(ms > 0)) return undefined;
    const timer = setInterval(() => { run(true, reloadKey); }, ms);
    return () => clearInterval(timer);
  }, [pollMs, run, reloadKey]);

  useEffect(() => {
    run(false, reloadKey);
  }, [run, reloadKey]);

  // ── Socket patches ──────────────────────────────────────────────────────────
  // Subscribes to the socket directly instead of reading the shared `lastEvent`
  // slot, where two events arriving before React commits collapse into one and
  // the earlier payload is lost for every consumer. `reloadKey` is read through
  // a ref so that a period change doesn't tear down and rebuild this listener
  // mid-event.
  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe((name, payload) => {
      // Refetch events take priority: the payload can't be merged into a
      // derived total, so the only correct response is to ask again.
      if (refetchRef.current.split('|').includes(name)) {
        run(true, reloadKeyRef.current);
        return;
      }
      const handler = eventsRef.current.find((e) => e.name === name);
      if (!handler) return;
      // A snapshot is in flight. Merging now would either corrupt the
      // `initial` placeholder shape (whose keys can differ from the fetch
      // result) or be overwritten a moment later. Queue instead.
      if (inFlightRef.current.promise) {
        deferredRef.current.push({ name, payload });
        return;
      }
      if (!mountedRef.current) return;
      setData((prev) => handler.merge(prev, payload));
      setLastUpdated(Date.now());
    });
    // `run` is stable (it only depends on `load`, which only depends on
    // `applyDeferred`, itself `[]`), so including it does not re-subscribe.
  }, [subscribe, run]);

  // Manual refresh — same semantics as the poll but flips `refreshing` so the
  // UI can spin. Resolves true when the data it waited for arrived, false when
  // that fetch errored.
  const refresh = useCallback(async (silent = false) => {
    setRefreshing(true);
    try {
      return await run(silent, reloadKey);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [run, reloadKey]);

  return { data, loading, error, refresh, setData, lastUpdated, refreshing };
}
