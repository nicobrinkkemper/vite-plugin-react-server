import type { CreateHandlerOptions, StreamMetrics } from "../types.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { createReactElement } from "../helpers/createRscRenderHelpers.server.js";
import { checkReactVersion } from "../utils/checkReactVersion.js";
import { assertRendererElementParity } from "../utils/assertRendererElementParity.js";
import {
  ReactDOMServerEdge,
  getVendoredEdgeRendererMode,
} from "../vendor/vendorEdge.server.js";
import type { StreamHandlers } from "../worker/types.js";

/** RSC content type the React Flight wire format is served as. */
export const RSC_CONTENT_TYPE = "text/x-component";

export type RscReadableStreamResult = {
  type: "server-edge";
  /**
   * Whether render setup succeeded. `false` means a SYNCHRONOUS failure
   * (element creation, transport load, or render kickoff) — `rscStream` is then
   * an empty closed stream and `error` holds the cause. Async errors that occur
   * mid-stream surface via the `onError` handler, not here (the stream has
   * already started by then).
   */
  ok: boolean;
  /** The synchronous setup failure, when `ok` is false. */
  error?: unknown;
  /** The RSC payload as a Web ReadableStream (Flight wire format). */
  rscStream: ReadableStream<Uint8Array>;
  /** Abort the in-flight render. */
  abort: (reason?: unknown) => void;
  metrics: StreamMetrics;
};

const EMPTY_STREAM = (): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });

/**
 * Edge counterpart of {@link renderRscStream}: renders an RSC tree to a Web
 * `ReadableStream` via the vendored react-server-dom-esm edge transport
 * (`renderToReadableStream`). Returns a runtime-agnostic stream — pass it
 * straight to a `Response` body (see {@link renderRscResponse}) on
 * workerd/Deno/Bun or behind vprs's `createRequestHandler` `render` hook.
 *
 * Reference resolution is closed by react-server-loader's sealed reference gate
 * in production (the edge transport cannot `import()` arbitrary file URLs), so
 * `moduleBasePath` carries the build manifest base the gate was sealed against.
 */
export function renderRscReadableStream(
  options: CreateHandlerOptions,
  handlers?: Pick<StreamHandlers<"server">, "onError">
): RscReadableStreamResult {
  const id = options.id || "";
  const route = options.route;
  const verbose = options.verbose || false;
  const logger = options.logger;
  const metrics = createStreamMetrics();
  const controller = new AbortController();

  const fail = (error: unknown, context: string): RscReadableStreamResult => {
    if (verbose) logger?.error(`[renderRscReadableStream:${route}] ${context}: ${error}`);
    handlers?.onError?.(id, error, { route, context });
    return {
      type: "server-edge",
      ok: false,
      error,
      rscStream: EMPTY_STREAM(),
      abort: () => {},
      metrics,
    };
  };

  let reactElement;
  try {
    reactElement = createReactElement(options, {
      id,
      route,
      verbose,
      logger,
      reuseHeadlessStreamId: (options as any).reuseHeadlessStreamId,
      headlessStreamElements: (options as any).headlessStreamElements,
      headlessStreamErrors: (options as any).headlessStreamErrors,
    });
  } catch (elementError) {
    return fail(elementError, "React Element Creation Error");
  }

  try {
    checkReactVersion();

    // Touch the renderer BEFORE the parity check so the lazily-loaded vendored
    // edge module resolves its dev/prod mode (mirrors renderRscStream).
    const renderToReadableStream = ReactDOMServerEdge.renderToReadableStream;
    assertRendererElementParity(
      reactElement,
      getVendoredEdgeRendererMode(),
      `renderRscReadableStream:${route}`
    );

    const rscStream = renderToReadableStream(
      reactElement,
      options.moduleBasePath || "",
      {
        signal: controller.signal,
        onError: (error: unknown) => {
          // A deliberate abort() trips the renderer's onError with the abort
          // reason — an intentional cancellation, not a route failure. abort()
          // already raised its own ("Stream Aborted") onError, so swallow this
          // one: no double-report, and no route.error that could spuriously
          // trip panicThreshold on a normal cancellation.
          if (controller.signal.aborted) return;
          if (verbose) logger?.error(`[renderRscReadableStream:${route}] React stream error: ${error}`);
          handlers?.onError?.(id, error, { route, context: "React Stream Error" });
          options.onEvent?.({
            type: "route.error",
            data: { error, route, panicThreshold: options.panicThreshold },
          });
        },
      }
    );

    return {
      type: "server-edge",
      ok: true,
      rscStream,
      abort: (reason?: unknown) => {
        handlers?.onError?.(
          id,
          reason instanceof Error ? reason : new Error(String(reason || "Stream aborted")),
          { route, context: "Stream Aborted" }
        );
        controller.abort(reason);
      },
      metrics,
    };
  } catch (error) {
    return fail(error, "RSC Render Error");
  }
}

/**
 * Convenience wrapper: render an RSC tree and return a Web `Response` carrying
 * the Flight stream, ready to return from `createRequestHandler`'s `render`
 * hook or any Fetch-style runtime.
 *
 * A SYNCHRONOUS render-setup failure returns a `500` (not an empty `200`): the
 * caller can't recover a half-built Flight stream, so surfacing it as a server
 * error is the honest result. Errors that occur mid-stream can't change an
 * already-sent status — handle those via {@link renderRscReadableStream}'s
 * `onError`.
 */
export function renderRscResponse(
  options: CreateHandlerOptions,
  init?: ResponseInit
): Response {
  const result = renderRscReadableStream(options);
  if (!result.ok) {
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", RSC_CONTENT_TYPE);
  return new Response(result.rscStream as unknown as BodyInit, { ...init, headers });
}
