const CACHE_TTL_MS = 5000;
const MAX_CACHE_ENTRIES = 80;

const cache = new Map();
const inFlight = new Map();
let generation = 0;

export function createCacheKey(url, accessToken) {
  return `${accessToken || 'anonymous'}:${url}`;
}

export function isCacheableRead(url) {
  return !/(^|\/)location(?:\/|$)/i.test(url);
}

export function invalidateApiCache() {
  generation += 1;
  cache.clear();
  inFlight.clear();
}

export function cachedRequest(key, load) {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.value);
  if (cached) cache.delete(key);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const requestGeneration = generation;
  const promise = Promise.resolve()
    .then(load)
    .then((value) => {
      if (requestGeneration === generation) {
        cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
        if (cache.size > MAX_CACHE_ENTRIES) {
          cache.delete(cache.keys().next().value);
        }
      }
      return value;
    })
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', invalidateApiCache);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') invalidateApiCache();
  });
}
