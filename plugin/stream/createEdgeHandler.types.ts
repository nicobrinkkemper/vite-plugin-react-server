import type { Logger } from "vite";

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
export type CreateEdgeHandlerOptions = {
  /**
   * The baked per-route flight producer: the `renderRouteToFlight` export of
   * the single-isolate edge bundle (`dist/server-edge/render.js`). Maps a route
   * url to a Flight RSC `ReadableStream`.
   */
  render: (url: string) => Promise<ReadableStream<Uint8Array>>;
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
  /** Nonce forwarded to the HTML renderer (CSP). */
  nonce?: string;
  /**
   * Map an incoming `Request` to the route url the producer was baked with
   * (a `build.pages` entry). @default `req => new URL(req.url).pathname`
   */
  getURL?: (request: Request) => string;
  /** Extra response headers, merged over the default `content-type: text/html`. */
  headers?: HeadersInit;
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
