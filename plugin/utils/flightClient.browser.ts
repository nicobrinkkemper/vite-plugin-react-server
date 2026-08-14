import { absoluteURL } from "./envUrls.js";
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
// The FETCH URL derives from the app's PUBLIC_ORIGIN + BASE_URL at load time
// via the same composition the esm client's moduleBaseURL uses — full
// transport parity, including CDN-origin deploys. Ids stay base-free, so a
// snapshot baked once serves from any base/origin. External and
// protocol-relative ids pass through; already-based ids are not re-prefixed
// (createBaseURL guards both).
export const resolveChunkUrl = (chunk: string): string => absoluteURL(chunk);

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
