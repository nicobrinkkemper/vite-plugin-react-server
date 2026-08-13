import { env } from "#env";
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
// The FETCH URL derives from the app's base at load time — transport parity
// with the esm client, which resolves specifiers through moduleBaseURL. Ids
// stay base-free, so a snapshot baked once serves from any base. Without
// this, a subpath deploy (GitHub Pages, any mounted app) 404s every client
// chunk against the domain root.
export const withAppBase = (chunk: string): string => {
  if (!chunk.startsWith("/") || chunk.startsWith("//")) return chunk;
  const base = env.BASE_URL || "/";
  if (base === "/" || chunk.startsWith(base)) return chunk;
  return base.replace(/\/$/, "") + chunk;
};

export const loadBrowserFlightClient = (): PromiseLike<BrowserFlightClient> =>
  (globalThis as { __vprsFlightTransport?: string }).__vprsFlightTransport ===
  "webpack"
    ? (import("react-server-loader/webpack/runtime").then(
        ({ createWebpackClient }) =>
          createWebpackClient({
            load: (chunk: string) =>
              import(/* @vite-ignore */ withAppBase(chunk)),
          })
      ) as PromiseLike<BrowserFlightClient>)
    : (import(
        "react-server-dom-esm/client.browser"
      ) as unknown as PromiseLike<BrowserFlightClient>);
