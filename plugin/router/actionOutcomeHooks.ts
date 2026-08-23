import type { Router } from "./createRouter.js";

/**
 * Server-action outcomes, wired into the router so each lands as an SPA
 * transition: a redirect() delivers the target page (prime + navigate — no
 * second fetch); a notFound() swaps in the 404 route's flight with the
 * address unchanged; any successful action refreshes the current route
 * (drop cached flights, refetch, swap), so mutations show without the app
 * wiring anything.
 *
 * Extracted from startClient so the outcome contract is testable without a
 * browser: the hooks close over nothing but what they're handed.
 */
export function createActionOutcomeHooks<T>(opts: {
  /** Resolved per call: startClient constructs the hooks before the router. */
  router: () => Router<T>;
  /** Push a fetched view into the mounted route slot. */
  deliver: (node: T) => void;
  /** Map a document pathname (base-composed) to the router's app-relative path. */
  stripBasePath: (pathname: string) => string;
}) {
  const { deliver, stripBasePath } = opts;
  // Monotonic refresh ticket: rapid successive actions each start a refetch,
  // and resolution order is not start order — an earlier (pre-later-mutation)
  // snapshot resolving last must not overwrite the newer view.
  let refreshSeq = 0;
  return {
    onRedirect: (route: string, page: unknown) => {
      const router = opts.router();
      // The followed 303's final url is BASED; the router speaks
      // app-relative paths.
      const target = stripBasePath(route);
      // A redirect completes an action all the same (create-then-view), so
      // cached routes drop like onSuccess — then the primed target, rendered
      // post-mutation by the redirect follow, goes in fresh.
      router.invalidate();
      router.prime(target, page as T);
      router.navigate(target);
    },
    onNotFound: () => {
      const router = opts.router();
      // notFound usually reports a mutation too (the deleted thing's route):
      // cached views of it and of the lists that contained it must drop.
      router.invalidate();
      Promise.resolve(router.flight("/404/")).then(
        (node) => deliver(node),
        () => {
          // No decodable 404 flight on this host — leave the view alone; the
          // action already settled.
        },
      );
    },
    onSuccess: () => {
      const router = opts.router();
      const url = router.getState().url;
      // A mutation's reach is unknowable client-side: the route the user is
      // on refreshes eagerly below, and every OTHER cached flight must drop
      // too or nav-back serves the pre-mutation view. Bare invalidate()
      // clears the whole cache; missed routes refetch lazily on next visit.
      router.invalidate();
      const seq = ++refreshSeq;
      Promise.resolve(router.flight(url)).then(
        (node) => {
          if (seq === refreshSeq && router.getState().url === url)
            deliver(node);
        },
        () => {
          // The refresh fetch failed; the current view stands.
        },
      );
    },
  };
}
