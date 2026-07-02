import type {
  CreateEdgeHandlerFn,
  EdgeFetchHandler,
} from "./createEdgeHandler.types.js";
import { renderFlightToHtml } from "./renderFlightToHtml.client.js";
import { injectInlineFlightIntoHtml } from "../utils/inlineFlight.js";
import { assertNonReactServer } from "../config/getCondition.js";

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
 * Marker the baked flight producer uses for a url with no baked route (see the
 * generated entry in plugin/bundle/buildEdgeBundle.ts — `"[edge] unknown route:
 * " + url`). Kept here so the handler can map that one throw to a 404 without
 * swallowing real render errors.
 */
const UNKNOWN_ROUTE_MARKER = "[edge] unknown route:";

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
  } = options;

  if (!render && !renderDocument) {
    throw new Error(
      "[createEdgeHandler] one of `render` or `renderDocument` is required"
    );
  }

  const htmlHeaders = (): Record<string, string> => ({
    "content-type": "text/html; charset=utf-8",
    ...(headers ? Object.fromEntries(new Headers(headers)) : {}),
  });

  const notFound = (url: string, request: Request): Response | Promise<Response> =>
    onNotFound
      ? onNotFound(url, request)
      : new Response("Not Found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });

  /** The producer 404s an unbaked route by throwing the unknown-route marker. */
  const isUnknownRoute = (error: unknown): boolean =>
    error instanceof Error && error.message.includes(UNKNOWN_ROUTE_MARKER);

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
        onError?.(error);
        throw error;
      }
      const htmlStream = await renderFlightToHtml({
        rscStream: flights.full,
        moduleBaseURL,
        bootstrapModules,
        bootstrapScriptContent,
        nonce,
        onError,
        signal: request.signal,
        logger,
        verbose,
      });
      const [htmlString, headlessBytes] = await Promise.all([
        new Response(htmlStream).text(),
        collectBytes(flights.headless),
      ]);
      return new Response(
        injectInlineFlightIntoHtml(htmlString, headlessBytes),
        { headers: htmlHeaders() }
      );
    }

    let rscStream: ReadableStream<Uint8Array>;
    try {
      rscStream = await render!(url, request);
    } catch (error) {
      // The producer is a closed manifest over `build.pages`; an unknown url is
      // a 404, not a 500. Everything else is a real failure — surface it.
      if (isUnknownRoute(error)) return notFound(url, request);
      onError?.(error);
      throw error;
    }

    const htmlStream = await renderFlightToHtml({
      rscStream,
      moduleBaseURL,
      bootstrapModules,
      bootstrapScriptContent,
      nonce,
      onError,
      signal: request.signal,
      logger,
      verbose,
    });

    return new Response(htmlStream, { headers: htmlHeaders() });
  };
};
