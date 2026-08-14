import { baseURL } from "./envUrls.js";
// The one place browser code picks a flight client. WHICH client must follow
// how the server encoded the payload: a webpack-transport bundle's document
// injects `self.__vprsFlightTransport` (see createEdgeRenderHook) and its
// payload carries baked-manifest ids — consumed through the webpack client
// over a chunk loader that `import()`s the served chunk URLs (the ids ARE the
// URLs; the map is closed, nothing is composed from payload input). Default:
// the esm client.
//
// Always imported lazily, at call time: static imports would pull
// react-dom/client into the react-server graph, and the webpack client
// additionally reads module-loading globals at eval time — the
// createWebpackClient factory owns that install-then-load ordering.

export type BrowserFlightClient = {
  createFromReadableStream: (
    stream: ReadableStream<Uint8Array>,
    opts: { callServer?: unknown; moduleBaseURL?: string }
  ) => PromiseLike<unknown>;
  createFromFetch: (
    response: Promise<Response>,
    opts: { callServer?: unknown; moduleBaseURL?: string }
  ) => PromiseLike<unknown>;
  encodeReply: (args: unknown[]) => Promise<string | FormData>;
};

// Chunk ids in the flight are root-relative identity keys ("/components/…").
// The FETCH URL derives from BASE_URL only — the SERVING origin loads the
// chunk, never a baked PUBLIC_ORIGIN. Same-origin is the browser module
// contract (see urls.test.ts): the bootstrap entry is injected same-origin,
// and flight-loaded chunks must share its origin or the page ends up with
// two module graphs and two Reacts (null-dispatcher hydration failure).
// CDN-serving the module graph is the explicit absolute-moduleBaseURL
// escape hatch, not a publicOrigin side effect. External and already-based
// ids pass through (createBaseURL guards both).
export const resolveChunkUrl = (chunk: string): string => baseURL(chunk);

export const loadBrowserFlightClient = (): PromiseLike<BrowserFlightClient> =>
  (globalThis as { __vprsFlightTransport?: string }).__vprsFlightTransport ===
  "webpack"
    ? (import("react-server-loader/webpack/runtime").then(
        ({ createWebpackClient }) =>
          createWebpackClient({
            load: (chunk: string) =>
              import(/* @vite-ignore */ resolveChunkUrl(chunk)),
          })
      ) as PromiseLike<BrowserFlightClient>)
    : (import(
        "react-server-dom-esm/client.browser"
      ) as unknown as PromiseLike<BrowserFlightClient>);
