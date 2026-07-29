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
}: {
  router: Router<ReactNode>;
  initialNode: ReactNode;
}) {
  const location = useLocation();
  const [node, setNode] = React.useState<ReactNode>(initialNode);
  const shown = React.useRef<string>(router.getState().url);

  React.useEffect(() => {
    if (location === shown.current) return;
    let cancelled = false;
    const target = location;
    Promise.resolve(router.flight(target)).then((next) => {
      // Ignore a stale resolve (a newer navigation won the race).
      if (!cancelled && router.getState().url === target) {
        shown.current = target;
        setNode(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [location, router]);

  useRscHmr(() => {
    // A server-component edit can invalidate any route's flight, and the flight
    // cache holds static routes indefinitely — so refetching straight through
    // `router.flight` would just return the stale cached copy and the view would
    // never update (HMR appears dead until a full reload). Drop the whole cache
    // first, then refetch the current route.
    router.invalidate();
    const url = router.getState().url;
    Promise.resolve(router.flight(url)).then(setNode);
  });

  return <>{node}</>;
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
        <RouteView router={router} initialNode={initialNode} />
      </RouterProvider>
    );
    return wrap ? wrap(tree) : tree;
  });

  return router;
}
