"use client";
// Namespace import for react-server barrel import-safety (see router-react.tsx).
import * as React from "react";
import type { ReactNode } from "react";
import {
  createReactFetcher,
  hydrateOrRender,
  useRscHmr,
} from "../utils/index.client.js";
import { createRouter, type Router } from "./createRouter.js";
import { RouterProvider, useLocation } from "./router-react.js";
import { applyRouteHead } from "./applyRouteHead.js";
import { env } from "#env";

/**
 * Dev-only recovery boundary around the route view. Without it, a server
 * runtime error riding the flight (a broken edit during dev) throws uncaught
 * in the client render and React UNMOUNTS THE WHOLE TREE — the HMR hooks die
 * with it, so fixing the file cannot recover and only a manual refresh helps.
 * The boundary keeps the React root (and the HMR subscription) alive, shows
 * the error in place, and is remounted with a fresh key whenever a new flight
 * arrives — so the fix's re-render is attempted automatically. Production
 * behavior is unchanged (error semantics there belong to the transaction
 * contract, not this boundary).
 */
class DevErrorRecoveryBoundary extends React.Component<
  { children?: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: unknown): { error: Error } {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
  override componentDidCatch(error: unknown) {
    console.error(
      "[vprs] route render error — dev recovery active: fix the file and the page re-renders on the next update.",
      error
    );
  }
  override render() {
    if (this.state.error) {
      return (
        <div
          data-vprs-dev-error=""
          style={{
            fontFamily: "ui-monospace, monospace",
            padding: "1rem",
            margin: "1rem",
            border: "2px solid #c00",
            borderRadius: "4px",
            background: "#fff5f5",
            color: "#600",
          }}
        >
          <strong>{"Route render error (dev)"}</strong>
          <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
            {this.state.error.message}
          </pre>
          <p style={{ opacity: 0.8 }}>
            {"Fix the file — the page recovers on the next update."}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// The supplied client entry: assembles createRouter + RouterProvider +
// createReactFetcher + hydration + HMR so a consumer's client.tsx is one line:
//
//   import { startClient } from "vite-plugin-react-server/router/client";
//   startClient({ patterns: ROUTES });
//
// Only pages that use client nav ship this; a pure-static page needs no entry.
export type StartClientOptions = {
  /** Root element id (default "root"). */
  rootId?: string;
  /** Route patterns, so useParams() resolves for the current url. */
  patterns?: readonly string[];
  moduleBaseURL?: string;
  publicOrigin?: string;
  /** Which urls are dynamic → short flight cache ttl. */
  isDynamic?: (url: string) => boolean;
  dynamicTtlMs?: number;
  /** Wrap the tree with providers / an app shell. */
  wrap?: (node: ReactNode) => ReactNode;
};

// Renders the current route's flight and swaps it (resolve-then-set, so the old
// view stays during the fetch — no flash) when navigation changes location.
function RouteView({
  router,
  initialNode,
  rootId,
}: {
  router: Router<ReactNode>;
  initialNode: ReactNode;
  rootId: string;
}) {
  const location = useLocation();
  // The view plus a GENERATION that bumps on every delivered flight: in dev
  // the recovery boundary is keyed by it, so a fresh payload (the fix after a
  // broken edit) remounts a clean boundary and the re-render is attempted.
  const [view, setView] = React.useState<{
    node: ReactNode;
    generation: number;
  }>({ node: initialNode, generation: 0 });
  const swap = React.useCallback(
    (node: ReactNode) =>
      setView((current) => ({ node, generation: current.generation + 1 })),
    []
  );
  const shown = React.useRef<string>(router.getState().url);

  // The matched route's head.ts contribution rides the tree as an inert
  // template (hoistables can't ride the hydration flight — see
  // createElementWithReact). Apply it after every commit so hydration and
  // each navigation both sync document.title / keyed meta.
  React.useEffect(() => {
    const rootEl = document.getElementById(rootId);
    if (rootEl) applyRouteHead(rootEl);
  });

  // After every commit, tell the router which url's content is actually on
  // screen. The gap between this and the navigated url is the pending window
  // `useNavigation()` / Link's data-pending report; the swap below closes it.
  React.useEffect(() => {
    router.markShown(shown.current);
  });

  React.useEffect(() => {
    if (location === shown.current) return;
    let cancelled = false;
    const target = location;
    Promise.resolve(router.flight(target)).then(
      (next) => {
        // Ignore a stale resolve (a newer navigation won the race).
        if (!cancelled && router.getState().url === target) {
          shown.current = target;
          swap(next);
        }
      },
      () => {
        // The flight failed — network error, or a host that has no such route
        // answered HTML (a static-only deploy). Fall back to a full document
        // load so the server's real response shows instead of the old view
        // staying pending forever.
        if (!cancelled && router.getState().url === target) {
          window.location.assign(target);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [location, router, swap]);

  useRscHmr(() => {
    // A server-component edit can invalidate any route's flight, and the flight
    // cache holds static routes indefinitely — so refetching straight through
    // `router.flight` would just return the stale cached copy and the view would
    // never update (HMR appears dead until a full reload). Drop the whole cache
    // first, then refetch the current route.
    router.invalidate();
    const url = router.getState().url;
    Promise.resolve(router.flight(url)).then(swap, (error) => {
      // The refetch itself failed — a TRANSFORM error (broken syntax) makes
      // the dev flight endpoint answer non-flight, so the fetch rejects.
      // KEEP the current view: Vite's own channel reports the compile error,
      // and the next HMR event (the fix) retries through this same path. The
      // old behavior let the rejection escape, which could tear the page
      // down and leave nothing listening for the fix.
      console.warn(
        "[vprs] HMR flight refetch failed — keeping the current view; the next update retries.",
        error
      );
    });
  });

  // Dev wraps the view in the recovery boundary (keyed per delivered flight);
  // production renders exactly as before.
  if (env.DEV) {
    return (
      <DevErrorRecoveryBoundary key={view.generation}>
        {view.node}
      </DevErrorRecoveryBoundary>
    );
  }
  return <>{view.node}</>;
}

export function startClient(opts: StartClientOptions = {}): Router<ReactNode> {
  const {
    rootId = "root",
    patterns = [],
    moduleBaseURL,
    publicOrigin,
    isDynamic,
    dynamicTtlMs,
    wrap,
  } = opts;

  // A loader redirect() answers a flight fetch with a 3xx to the TARGET's
  // flight; fetch follows it transparently, so the content is already right —
  // only the address bar still shows the source url. Detect the follow and
  // re-navigate (replace) to the final route so history matches the content.
  // Deferred assignment: the fetcher closure exists before the router does.
  let followRedirect: (response: Response) => void = () => {};
  const fetchFlight = (url: string): Promise<ReactNode> =>
    Promise.resolve(
      createReactFetcher({
        url,
        moduleBaseURL,
        publicOrigin,
        onResponse: (response) => followRedirect(response),
      }),
    ) as Promise<ReactNode>;

  const router = createRouter<ReactNode>({ fetchFlight, isDynamic, dynamicTtlMs });
  followRedirect = (response) => {
    if (!response.redirected || !response.ok) return;
    let finalRoute = new URL(response.url).pathname;
    if (finalRoute.endsWith("/index.rsc")) {
      finalRoute = finalRoute.slice(0, -"/index.rsc".length) || "/";
    }
    if (finalRoute !== router.getState().url) {
      router.navigate(finalRoute, { replace: true });
    }
  };

  const root = document.getElementById(rootId);
  if (!root) throw new Error(`startClient: #${rootId} element not found`);

  hydrateOrRender(root, async () => {
    // Resolve the initial flight (consumes the inline payload on first paint)
    // BEFORE the first render — hydrateOrRender's #418-safe contract.
    const initialNode = await router.flight(router.getState().url);
    const tree = (
      <RouterProvider router={router} patterns={patterns}>
        <RouteView router={router} initialNode={initialNode} rootId={rootId} />
      </RouterProvider>
    );
    return wrap ? wrap(tree) : tree;
  });

  return router;
}
