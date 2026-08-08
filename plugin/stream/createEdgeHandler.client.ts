import type {
  CreateEdgeHandlerFn,
  EdgeFetchHandler,
} from "./createEdgeHandler.types.js";
import { injectInlineFlightIntoHtml } from "../utils/inlineFlight.js";
import { interleaveFlightIntoHtmlStream } from "./interleaveFlightIntoHtml.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { isUnknownRoute } from "./unknownRoute.js";
import { isNotFound, isRedirect } from "../router/loaderSignals.js";

assertNonReactServer();

/** Drain a Web ReadableStream of bytes into a single Uint8Array. */
async function collectBytes(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Compose a single-isolate edge build into a Web `fetch` handler.
 *
 * Wires the baked per-route flight producer (`dist/server-edge/render.js`'s
 * `renderRouteToFlight`, server React) to the in-process HTML render
 * (`renderFlightToHtml`, client React) and returns a `(Request) => Response`
 * handler — the native entrypoint shape for Cloudflare Workers, Deno Deploy,
 * Vercel Edge and Bun, and trivially adaptable to Node. No worker_threads, no
 * runtime `--conditions`: the producer baked server React, this side runs
 * client React, and they co-exist in one isolate (client islands resolve via
 * the client transport's `import(moduleBaseURL + id)` into the ssr bundle, so
 * point {@link CreateEdgeHandlerOptions.moduleBaseURL} at where `dist/client`
 * is served).
 *
 * The returned handler streams: it responds as soon as the HTML shell is ready.
 * Unknown routes get a 404 (override via `onNotFound`); other render errors
 * propagate to the caller after `onError`.
 */
export const createEdgeHandler: CreateEdgeHandlerFn = function createEdgeHandler(
  options
): EdgeFetchHandler {
  const {
    render,
    renderDocument,
    moduleBaseURL = "/",
    bootstrapModules,
    bootstrapScriptContent,
    nonce,
    getURL = (request) => new URL(request.url).pathname,
    headers,
    onError,
    onNotFound,
    logger,
    verbose,
    flightTransport = "esm",
    clientManifest,
    renderFlightToHtml,
    inlineFlight = "blob",
  } = options;

  if (!render && !renderDocument) {
    throw new Error(
      "[createEdgeHandler] one of `render` or `renderDocument` is required"
    );
  }

  // No default renderer HERE, deliberately: even a dynamic import of vprs's own
  // renderer is statically visible to bundlers, so it would drag the Node
  // vendor layer (createRequire on react-dom) into every Worker bundle that can
  // reach this module. The Node-facing entries inject the built-in
  // (`/edge`, and the `/stream` barrel's wrapper); the web entry (`/edge/web`)
  // requires the baked consumer's renderer instead.
  if (!renderFlightToHtml) {
    throw new Error(
      "[createEdgeHandler] `renderFlightToHtml` is required: pass the baked " +
        "consumer bundle's renderer (dist/server-edge/consumer.js), or vprs's " +
        "own from 'vite-plugin-react-server/stream' on Node"
    );
  }

  const htmlHeaders = (url: string, request: Request): Record<string, string> => {
    const extra = typeof headers === "function" ? headers(url, request) : headers;
    return {
      "content-type": "text/html; charset=utf-8",
      ...(extra ? Object.fromEntries(new Headers(extra)) : {}),
    };
  };

  const notFound = (url: string, request: Request): Response | Promise<Response> =>
    onNotFound
      ? onNotFound(url, request)
      : new Response("Not Found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });

  return async function edgeHandler(request: Request): Promise<Response> {
    const url = getURL(request);

    // Full flash-free document: render the Html-wrapped `full` flight to a
    // complete HTML document and inline the `headless` flight so the client
    // hydrates in place with no `.rsc` refetch. Buffers the (small) dynamic
    // document to splice the inline script before </body>.
    if (renderDocument) {
      let flights;
      try {
        // Pass the request so a loader can gate an authenticated route on
        // cookies/headers (the baked producer forwards it to props).
        flights = await renderDocument(url, { request });
      } catch (error) {
        if (isUnknownRoute(error)) return notFound(url, request);
        // Loader control flow: a redirect() answers with the 3xx itself; a
        // notFound() answers like an unknown route.
        if (isRedirect(error)) {
          return new Response(null, {
            status: error.status,
            headers: { location: error.to },
          });
        }
        if (isNotFound(error)) return notFound(url, request);
        onError?.(error);
        throw error;
      }
      const htmlStream = await renderFlightToHtml({
        rscStream: flights.full,
        moduleBaseURL,
        flightTransport,
        clientManifest,
        bootstrapModules,
        bootstrapScriptContent,
        nonce,
        onError,
        signal: request.signal,
        logger,
        verbose,
      });
      // Streamed delivery: no buffering, no splice — HTML flushes as it
      // renders and the headless flight rides along as push-script chunks
      // (the client's takeStreamedFlight reassembles them).
      if (inlineFlight === "stream") {
        return new Response(
          interleaveFlightIntoHtmlStream({
            htmlStream,
            flightStream: flights.headless,
            nonce,
          }),
          { headers: htmlHeaders(url, request) }
        );
      }
      const [htmlString, headlessBytes] = await Promise.all([
        new Response(htmlStream).text(),
        collectBytes(flights.headless),
      ]);
      return new Response(
        injectInlineFlightIntoHtml(htmlString, headlessBytes),
        { headers: htmlHeaders(url, request) }
      );
    }

    let rscStream: ReadableStream<Uint8Array>;
    try {
      rscStream = await render!(url, request);
    } catch (error) {
      // The producer is a closed manifest over `build.pages`; an unknown url is
      // a 404, not a 500. Everything else is a real failure — surface it.
      if (isUnknownRoute(error)) return notFound(url, request);
      if (isRedirect(error)) {
        return new Response(null, {
          status: error.status,
          headers: { location: error.to },
        });
      }
      if (isNotFound(error)) return notFound(url, request);
      onError?.(error);
      throw error;
    }

    const htmlStream = await renderFlightToHtml({
      rscStream,
      moduleBaseURL,
      flightTransport,
      clientManifest,
      bootstrapModules,
      bootstrapScriptContent,
      nonce,
      onError,
      signal: request.signal,
      logger,
      verbose,
    });

    return new Response(htmlStream, { headers: htmlHeaders(url, request) });
  };
};
