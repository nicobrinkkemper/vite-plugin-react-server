// Per-url cache of in-flight / resolved RSC flight fetches, shared by
// navigation and prefetch: hovering a <Link> warms an entry, the click reuses
// it, so navigation needs no extra round-trip.
//
// Static routes can cache indefinitely (the flight is a fixed file). Dynamic
// routes pass a short `ttlMs` so a prefetched snapshot can't pin stale
// per-request data — the same rule as not build-time-inlining a live route.
export type FlightCacheOptions = {
  /** Injectable clock (defaults to Date.now); handy for tests. */
  now?: () => number;
  /**
   * Max number of cached entries before least-recently-used eviction. A
   * long-lived SPA that navigates many distinct dynamic urls would otherwise
   * grow the cache without bound. Default 100.
   */
  maxSize?: number;
};

export type FlightGetOptions<T> = {
  fetcher: (url: string) => T | Promise<T>;
  /** Max age in ms. Omit (or Infinity) to cache indefinitely (static routes). */
  ttlMs?: number;
};

export type FlightCache<T> = {
  get(url: string, opts: FlightGetOptions<T>): Promise<T>;
  prefetch(url: string, opts: FlightGetOptions<T>): void;
  has(url: string): boolean;
  invalidate(url?: string): void;
};

export function createFlightCache<T>(
  options: FlightCacheOptions = {},
): FlightCache<T> {
  const now = options.now ?? Date.now;
  const maxSize = Math.max(1, options.maxSize ?? 100);
  const cache = new Map<string, { promise: Promise<T>; at: number }>();

  // Re-insert so the entry becomes most-recently-used (Map preserves insertion
  // order), then evict from the front until within capacity.
  const store = (url: string, entry: { promise: Promise<T>; at: number }) => {
    cache.delete(url);
    cache.set(url, entry);
    while (cache.size > maxSize) {
      const lru = cache.keys().next().value;
      if (lru === undefined) break;
      cache.delete(lru);
    }
  };

  const get = (url: string, opts: FlightGetOptions<T>): Promise<T> => {
    const hit = cache.get(url);
    if (hit && (opts.ttlMs === undefined || now() - hit.at < opts.ttlMs)) {
      store(url, hit); // touch: mark most-recently-used
      return hit.promise;
    }
    const promise = Promise.resolve(opts.fetcher(url));
    // Evict a rejected entry so a failed nav/prefetch can be retried.
    promise.catch(() => {
      if (cache.get(url)?.promise === promise) cache.delete(url);
    });
    store(url, { promise, at: now() });
    return promise;
  };

  return {
    get,
    prefetch: (url, opts) => {
      void get(url, opts);
    },
    has: (url) => cache.has(url),
    invalidate: (url) => {
      if (url === undefined) cache.clear();
      else cache.delete(url);
    },
  };
}
