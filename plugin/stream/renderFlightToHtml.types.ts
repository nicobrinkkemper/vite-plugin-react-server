import type { Logger } from "vite";

/**
 * Options for {@link RenderFlightToHtmlFn}: render a Flight RSC payload to an
 * HTML `ReadableStream` in a single isolate (no worker_threads), the edge /
 * single-isolate counterpart of the worker-based HTML render.
 */
export type RenderFlightToHtmlOptions = {
  /** The Flight RSC payload as a Web ReadableStream (the edge producer's output). */
  rscStream: ReadableStream<Uint8Array>;
  /**
   * Base URL the client transport uses to resolve client-reference modules —
   * point this at the client-React (ssr) bundle so islands resolve in-process.
   */
  moduleBaseURL?: string;
  /**
   * Which transport produced the flight. `"esm"` (default) decodes with the
   * esm client (`import(moduleBaseURL + id)`); `"webpack"` decodes with the
   * webpack flight client against the baked client manifest — chunk loads
   * resolve as `import()` of `moduleBaseURL + chunk`, references never
   * compose module paths from payload input. Baked bundles export this as
   * `flightTransport`, so handlers pass it straight through.
   */
  flightTransport?: "esm" | "webpack";
  /**
   * The baked webpack client manifest (`hosted id -> {id, chunks, name}`),
   * used when `flightTransport` is `"webpack"` — the bundle exports it as
   * `clientManifest`.
   */
  clientManifest?: Record<string, { id: string; chunks: string[]; name: string }>;
  /** Client entry modules to bootstrap for hydration (react-dom bootstrapModules). */
  bootstrapModules?: string[];
  /** Inline bootstrap script content (react-dom bootstrapScriptContent). */
  bootstrapScriptContent?: string;
  /** Nonce forwarded to the HTML renderer. */
  nonce?: string;
  /** Called on a render error (forwarded to react-dom/server.edge onError). */
  onError?: (error: unknown) => void;
  /** Abort signal forwarded to the HTML renderer. */
  signal?: AbortSignal;
  logger?: Logger;
  verbose?: boolean;
};

export type RenderFlightToHtmlFn = (
  options: RenderFlightToHtmlOptions
) => Promise<ReadableStream<Uint8Array>>;
