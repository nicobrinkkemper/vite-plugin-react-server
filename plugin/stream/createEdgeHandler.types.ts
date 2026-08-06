import type { Logger } from "vite";
import type { RenderFlightToHtmlFn } from "./renderFlightToHtml.types.js";

/**
 * A Web `fetch` handler: the standard edge-runtime entrypoint shape
 * (Cloudflare Workers, Deno Deploy, Vercel Edge, Bun, Node via an adapter).
 */
export type EdgeFetchHandler = (request: Request) => Promise<Response>;

/**
 * Options for {@link CreateEdgeHandlerFn}. Composes the baked per-route flight
 * producer (`dist/server-edge/render.js`'s `renderRouteToFlight`) with the
 * in-process HTML render (`renderFlightToHtml`) into a single Web `fetch`
 * handler — no worker_threads, no runtime `--conditions`.
 */
/**
 * The two flights of the flash-free document path (the `renderRouteToDocument`
 * export of the edge bundle): the Html/Root-wrapped `full` document and the
 * Root-only `headless` payload, rendered from the same live props.
 */
export type EdgeDocumentFlights = {
  full: ReadableStream<Uint8Array>;
  headless: ReadableStream<Uint8Array>;
};

export type CreateEdgeHandlerOptions = {
  /**
   * The baked per-route flight producer: the `renderRouteToFlight` export of
   * the single-isolate edge bundle (`dist/server-edge/render.js`). Maps a route
   * url to a Flight RSC `ReadableStream` rendered straight to HTML.
   *
   * Provide either `render` (partial markup) or `renderDocument` (full
   * flash-free document). `renderDocument` wins if both are set.
   */
  render?: (
    url: string,
    request?: Request
  ) => Promise<ReadableStream<Uint8Array>>;
  /**
   * The baked full-document producer: the `renderRouteToDocument` export of the
   * edge bundle (typically closed over the live `cssFiles`/`globalCss` the
   * consumer collected). Returns the `full` + `headless` flights. The handler
   * renders `full` to a complete HTML document and inlines `headless` as
   * `<script id="vprs-flight">`, so the browser hydrates in place with no
   * `.rsc` round-trip.
   */
  renderDocument?: (
    url: string,
    opts?: { request?: Request }
  ) => Promise<EdgeDocumentFlights>;
  /**
   * Base URL the client transport uses to resolve client-reference modules —
   * point it at where the client (ssr) bundle is served (`dist/client`). Must
   * match the base path the bundle is actually hosted under (mind a non-root
   * deploy base). @default "/"
   */
  moduleBaseURL?: string;
  /** Client entry modules to bootstrap for hydration (react-dom bootstrapModules). */
  bootstrapModules?: string[];
  /** Inline bootstrap script content (react-dom bootstrapScriptContent). */
  bootstrapScriptContent?: string;
  /**
   * Which transport the flight producer encodes with. Baked bundles export it
   * (`flightTransport`) and `createEdgeRequestHandler` forwards it — set it
   * manually only when driving the producer yourself. @default "esm"
   */
  flightTransport?: "esm" | "webpack";
  /**
   * The baked webpack client manifest (bundle export `clientManifest`), used
   * by the webpack decode path.
   */
  clientManifest?: Record<string, { id: string; chunks: string[]; name: string }>;
  /**
   * The flight -> HTML renderer. Defaults to vprs's own, which is loaded on
   * first render (never at import) because it pulls `react-dom/server` in
   * through a Node module resolver.
   *
   * Pass the baked consumer bundle's `renderFlightToHtml` to skip that path
   * entirely: it carries client React and a closed client-module registry, so
   * nothing resolves a module at request time and the handler composes on a
   * runtime with no `node:` at all. `createEdgeRequestHandler` wires it up
   * automatically when the bundle exports one.
   */
  renderFlightToHtml?: RenderFlightToHtmlFn;
  /** Nonce forwarded to the HTML renderer (CSP). Under `inlineFlight:
   *  "stream"` it is also stamped on every interleaved flight script —
   *  those are executable, so a script-src nonce policy blocks them
   *  without it. */
  nonce?: string;
  /**
   * How the `renderDocument` branch delivers the headless flight with the
   * document:
   * - `"blob"` (default): buffer the rendered HTML and the whole flight,
   *   splice one non-executable `<script id="vprs-flight">` before
   *   `</body>`. Simplest client; TTFB = full render.
   * - `"stream"`: pass the HTML through as it renders and interleave the
   *   flight as executable push-script chunks (see
   *   interleaveFlightIntoHtml). TTFB = shell flush, bounded memory,
   *   progressive Suspense — pair with a client on `takeStreamedFlight`
   *   (createReactFetcher does this automatically).
   *
   * Ignored on the `render` branch (no flight is inlined there at all).
   * @default "blob"
   */
  inlineFlight?: "blob" | "stream";
  /**
   * Map an incoming `Request` to the route url the producer was baked with
   * (a `build.pages` entry). @default `req => new URL(req.url).pathname`
   */
  getURL?: (request: Request) => string;
  /**
   * Extra response headers, merged over the default `content-type: text/html`.
   * A function form is resolved per request so caching can differ by route —
   * e.g. `public, max-age` for prerendered routes but `private, no-store` for an
   * authenticated route, so a shared CDN never caches user-specific HTML.
   */
  headers?:
    | HeadersInit
    | ((url: string, request: Request) => HeadersInit);
  /** Render-time error hook (forwarded to react-dom/server.edge onError). */
  onError?: (error: unknown) => void;
  /**
   * Build the response for a url the bundle has no baked route for. The default
   * returns a 404 `text/plain` "Not Found".
   */
  onNotFound?: (url: string, request: Request) => Response | Promise<Response>;
  logger?: Logger;
  verbose?: boolean;
};

export type CreateEdgeHandlerFn = (
  options: CreateEdgeHandlerOptions
) => EdgeFetchHandler;
