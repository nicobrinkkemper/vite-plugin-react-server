import type { EdgeFetchHandler } from "../stream/createEdgeHandler.types.js";
import { isUnknownRoute } from "../stream/unknownRoute.js";
import { matchRoutes } from "../router/matchRoute.js";
import type {
  CreateEdgeRequestHandlerOptions,
  EdgeBundleExports,
  EdgeRenderHook,
} from "./createEdgeRequestHandler.types.js";

/**
 * Mirrors DEFAULT_CONFIG.BUILD.rscOutputPath, deliberately NOT imported from it:
 * this module has to stay loadable on a Web runtime, and the defaults module
 * reaches for the transformer and the plugin root — Node-only, and no business
 * being dragged into a Worker bundle for the sake of one string.
 */
const DEFAULT_RSC_OUTPUT_PATH = "index.rsc";

/**
 * Sentinel for "this bundle has no route here" coming back out of
 * createEdgeHandler. Compared by IDENTITY, never by status: the hook has to tell
 * an unbaked route apart from a 404 the app meant to return, and a status code
 * cannot distinguish them.
 */
const NOT_HANDLED = new Response(null, { status: 404 });

/**
 * Strip the serving-layer decoration off a pathname to get the route key the
 * bundle was baked with: a trailing flight filename (`/about/index.rsc`) or a
 * trailing slash (`/about/`) both name the route `/about`.
 */
function routeOf(pathname: string, rscOutputPath: string): string {
  const flightSuffix = "/" + rscOutputPath;
  let route = pathname;
  if (route.endsWith(flightSuffix)) route = route.slice(0, -flightSuffix.length);
  else if (route.endsWith("/")) route = route.slice(0, -1);
  return route || "/";
}

/** Whether the request wants the raw flight rather than an HTML document. */
function wantsFlight(
  pathname: string,
  request: Request,
  rscOutputPath: string
): boolean {
  return (
    pathname.endsWith("/" + rscOutputPath) ||
    (request.headers.get("accept") ?? "").includes("text/x-component")
  );
}

/** Resolve the `dynamic` option to a predicate over route keys. */
function toDynamicPredicate(
  dynamic: CreateEdgeRequestHandlerOptions["dynamic"]
): (url: string) => boolean {
  // Omitted: render everything the bundle baked. The bundle is already a closed
  // manifest, so it 404s a url it has no route for — no second gate needed.
  if (!dynamic) return () => true;
  if (typeof dynamic === "function") return dynamic;
  // A list may hold exact urls and/or route patterns. matchRoutes treats a
  // literal as a degenerate pattern, so one call covers both.
  return (url: string) => matchRoutes(dynamic, url) !== null;
}

/**
 * The per-request renderer behind {@link createEdgeRequestHandler}, exposed for
 * composing into a server that ALSO serves files from disk — pass it as
 * `createRequestHandler`'s `render` hook and it renders the dynamic routes while
 * that handler serves the prerendered build and the assets:
 *
 * ```js
 * import * as bundle from "./dist/server-edge/render.js";
 * createRequestHandler({
 *   staticDir: "dist/static",
 *   render: createEdgeRenderHook(bundle),
 *   action: bundle.handleRouteAction,
 * });
 * ```
 *
 * Returns `null` — not a 404 — for anything this bundle does not render, so the
 * caller stays in charge of the fallback.
 */
export function createEdgeRenderHook(
  bundle: EdgeBundleExports,
  options: CreateEdgeRequestHandlerOptions = {}
): EdgeRenderHook {
  const {
    dynamic,
    rscOutputPath = DEFAULT_RSC_OUTPUT_PATH,
    projectRoot: _projectRoot,
    actionHeader: _actionHeader,
    onNotFound: _onNotFound,
    ...edgeOptions
  } = options;

  const isDynamic = toDynamicPredicate(dynamic);

  // Loaded on first render, not at import. The HTML render pulls react-dom/server,
  // which resolves to a stub that THROWS on import under the `react-server`
  // condition — so an eager import would blow up merely by being reachable from a
  // consumer's react-server-condition build, even though nothing would ever call
  // it there. Deferring keeps `import ... from "vite-plugin-react-server/edge"`
  // inert under either condition, which is the whole reason this entry exists.
  // Memoized: built once, then reused for every request.
  let documentHandler: Promise<EdgeFetchHandler> | undefined;
  const getDocumentHandler = (): Promise<EdgeFetchHandler> =>
    (documentHandler ??= import("../stream/createEdgeHandler.client.js").then(
      ({ createEdgeHandler }) =>
        createEdgeHandler({
          ...edgeOptions,
          renderDocument: (url, opts) => bundle.renderRouteToDocument(url, opts),
          // From the bundle's own bake — the point is that the handler already
          // knows its entry. An explicit option still wins.
          moduleBaseURL: options.moduleBaseURL ?? bundle.clientModuleBaseURL ?? "/",
          bootstrapModules: options.bootstrapModules ?? bundle.bootstrapModules,
          getURL: (request) => routeOf(new URL(request.url).pathname, rscOutputPath),
          onNotFound: () => NOT_HANDLED,
        })
    ));

  return async function edgeRender(
    route: string,
    request: Request
  ): Promise<Response | null> {
    // `route` arrives as the raw pathname from createRequestHandler; normalize it
    // the same way the document handler's getURL does, so both agree on the key.
    const pathname = route.startsWith("/")
      ? route
      : new URL(request.url).pathname;
    const url = routeOf(pathname, rscOutputPath);
    if (!isDynamic(url)) return null;

    if (wantsFlight(pathname, request, rscOutputPath)) {
      // Client navigation: the Root-only payload, from the same producer (and so
      // the same live props) the document path inlines on first paint.
      try {
        const { headless } = await bundle.renderRouteToDocument(url, { request });
        return new Response(headless as unknown as BodyInit, {
          headers: {
            "content-type": "text/x-component; charset=utf-8",
            "cache-control": "no-cache",
          },
        });
      } catch (error) {
        if (isUnknownRoute(error)) return null;
        throw error;
      }
    }

    const response = await (await getDocumentHandler())(request);
    // An unbaked route is a fall-through for a hook, not an answer.
    return response === NOT_HANDLED ? null : response;
  };
}

/**
 * The whole per-request server for a single-isolate vprs build, in one call:
 * hand it the baked bundle and get back a Web `(Request) => Response`.
 *
 * Runs on Node-compatible hosts (Node servers via `toNodeListener`, Bun,
 * Vercel/Netlify Node functions). NOT on Cloudflare Workers or Deno Deploy:
 * the HTML render underneath resolves react-dom through `node:module` at
 * request time, and client references resolve by `import()` off disk. "Edge"
 * names the single-isolate build shape (no worker_threads, no runtime
 * `--conditions`), not a literal isolate runtime.
 *
 * ```js
 * import * as bundle from "../dist/server-edge/render.js";
 * import { createEdgeRequestHandler } from "vite-plugin-react-server/edge";
 *
 * export const handler = createEdgeRequestHandler(bundle);
 * ```
 *
 * It serves the flash-free document on a GET (markup and inlined flight from one
 * render, so the page hydrates in place with no `.rsc` round-trip), the headless
 * flight on a client navigation, and `"use server"` actions through the bundle's
 * baked gate. No `worker_threads`, no runtime `--conditions`.
 *
 * Nothing here touches a filesystem or knows a platform: assets and any
 * prerendered snapshots are the host's to serve (a CDN already does it better).
 * To serve those from disk in the same process — a local runner, a Node
 * self-host — compose {@link createEdgeRenderHook} into `createRequestHandler`
 * instead.
 */
export function createEdgeRequestHandler(
  bundle: EdgeBundleExports,
  options: CreateEdgeRequestHandlerOptions = {}
): EdgeFetchHandler {
  const {
    projectRoot,
    actionHeader = "x-rsc-action",
    onNotFound,
    rscOutputPath = DEFAULT_RSC_OUTPUT_PATH,
  } = options;

  const render = createEdgeRenderHook(bundle, options);

  return async function edgeRequestHandler(
    request: Request
  ): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (
      request.method === "POST" &&
      request.headers.get(actionHeader) &&
      bundle.handleRouteAction
    ) {
      return bundle.handleRouteAction(request, { projectRoot });
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const response = await render(pathname, request);
      if (response) return response;
    }

    return onNotFound
      ? onNotFound(routeOf(pathname, rscOutputPath), request)
      : new Response("Not Found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
  };
}
