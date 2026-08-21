import { createFlightCache, type FlightCache } from "./flightCache.js";
import type { ToPath } from "./register.js";

// Headless client router: history + a flight cache + a subscribe store. The
// React bindings (<Router>, useLocation, useParams) are a thin layer over this
// via useSyncExternalStore, so the navigation logic stays testable without React.
//
// `url` moves on navigate/popstate; `shownUrl` trails it, advanced by the view
// (startClient's RouteView calls markShown) once the target's content has
// actually been committed. The gap between the two IS the navigation-pending
// window — the old view stays on screen while the next route's flight loads.
export type RouterState = { url: string; shownUrl: string };

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
  navigate: (to: ToPath, opts?: { replace?: boolean }) => void;
  /** The view calls this after committing a url's content, closing the
   *  pending window that `useNavigation()` reports. */
  markShown: (url: string) => void;
  prefetch: (to: ToPath) => void;
  /** The (cached) flight for a url; reuses a warmed/in-flight fetch. */
  flight: (url: string) => Promise<T>;
  /** Store an already-decoded flight for a url (a followed action redirect
   *  delivers the target page's flight; priming it makes the navigation
   *  swap without a second fetch). */
  prime: (url: string, flight: T) => void;
  /** Drop a cached flight (one url, or all) so the next `flight()` refetches. */
  invalidate: (url?: string) => void;
};

const currentUrl = () =>
  typeof location === "undefined" ? "/" : location.pathname + location.search;

export function createRouter<T>(opts: CreateRouterOptions<T>): Router<T> {
  const cache = opts.cache ?? createFlightCache<T>();
  const listeners = new Set<() => void>();
  const initialUrl = currentUrl();
  let state: RouterState = { url: initialUrl, shownUrl: initialUrl };

  const ttlFor = (url: string) =>
    opts.isDynamic?.(url) ? (opts.dynamicTtlMs ?? 2000) : undefined;
  const flight = (url: string) =>
    cache.get(url, { fetcher: opts.fetchFlight, ttlMs: ttlFor(url) });

  const notify = () => {
    for (const l of listeners) l();
  };

  const setUrl = (url: string) => {
    if (url === state.url) return;
    state = { ...state, url };
    notify();
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
    markShown: (url) => {
      if (url === state.shownUrl) return;
      state = { ...state, shownUrl: url };
      notify();
    },
    prefetch: (to) => {
      cache.prefetch(to, { fetcher: opts.fetchFlight, ttlMs: ttlFor(to) });
    },
    flight,
    prime: (url, value) => cache.prime(url, value),
    invalidate: (url) => cache.invalidate(url),
  };
}
