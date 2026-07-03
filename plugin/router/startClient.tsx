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
//   import { startClient } from "vite-plugin-react-server/router";
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

  const fetchFlight = (url: string): Promise<ReactNode> =>
    Promise.resolve(
      createReactFetcher({ url, moduleBaseURL, publicOrigin }),
    ) as Promise<ReactNode>;

  const router = createRouter<ReactNode>({ fetchFlight, isDynamic, dynamicTtlMs });

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
