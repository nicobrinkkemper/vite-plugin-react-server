import { createFlightCache, type FlightCache } from "./flightCache.js";

// Headless client router: history + a flight cache + a subscribe store. The
// React bindings (<Router>, useLocation, useParams) are a thin layer over this
// via useSyncExternalStore, so the navigation logic stays testable without React.
export type RouterState = { url: string };

export type CreateRouterOptions<T> = {
  /** Fetch the RSC flight for a url (e.g. createReactFetcher({ url })). */
  fetchFlight: (url: string) => T | Promise<T>;
  /** Whether a url is a dynamic route → its flight gets a short cache ttl. */
  isDynamic?: (url: string) => boolean;
  /** Cache ttl (ms) for dynamic-route flights. Default 2000. */
  dynamicTtlMs?: number;
  /** Inject a cache (shared with prefetch / tests). */
  cache?: FlightCache<T>;
};

export type Router<T> = {
  getState: () => RouterState;
  subscribe: (cb: () => void) => () => void;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  prefetch: (to: string) => void;
  /** The (cached) flight for a url; reuses a warmed/in-flight fetch. */
  flight: (url: string) => Promise<T>;
};

const currentUrl = () =>
  typeof location === "undefined" ? "/" : location.pathname + location.search;

export function createRouter<T>(opts: CreateRouterOptions<T>): Router<T> {
  const cache = opts.cache ?? createFlightCache<T>();
  const listeners = new Set<() => void>();
  let state: RouterState = { url: currentUrl() };

  const ttlFor = (url: string) =>
    opts.isDynamic?.(url) ? (opts.dynamicTtlMs ?? 2000) : undefined;
  const flight = (url: string) =>
    cache.get(url, { fetcher: opts.fetchFlight, ttlMs: ttlFor(url) });

  const setUrl = (url: string) => {
    if (url === state.url) return;
    state = { url };
    for (const l of listeners) l();
  };

  const onPop = () => setUrl(currentUrl());

  return {
    getState: () => state,
    subscribe: (cb) => {
      listeners.add(cb);
      if (listeners.size === 1 && typeof window !== "undefined") {
        window.addEventListener("popstate", onPop);
      }
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0 && typeof window !== "undefined") {
          window.removeEventListener("popstate", onPop);
        }
      };
    },
    navigate: (to, { replace = false } = {}) => {
      void flight(to); // warm (or reuse a prefetch) before we swap
      if (typeof history !== "undefined") {
        if (replace) history.replaceState({ url: to }, "", to);
        else history.pushState({ url: to }, "", to);
      }
      setUrl(to);
    },
    prefetch: (to) => {
      cache.prefetch(to, { fetcher: opts.fetchFlight, ttlMs: ttlFor(to) });
    },
    flight,
  };
}
