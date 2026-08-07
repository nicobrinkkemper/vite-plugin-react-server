import type React from "react";
import { createCallServer } from "./createCallServer.js";
import { loadBrowserFlightClient } from "./flightClient.browser.js";
import { env } from "#env";
import { createPageURL } from "./urls.js";
import { takeStreamedFlight } from "./streamedFlight.js";
import {
  INLINE_FLIGHT_ID,
  INLINE_FLIGHT_LENGTH_ATTR,
} from "./inlineFlightId.js";

// The static build can inline the initial route's flight payload into the HTML
// (see inlineFlightPayload). Consume it exactly once — for the first fetch after
// load, i.e. the initial route's render — then fall back to the network for
// client navigations, whose payloads aren't inlined.
let inlineFlightConsumed = false;

/**
 * Decode the payload, but only if the element actually holds the whole thing.
 *
 * THE PAYLOAD IS THE TEXT OF AN INLINE `<script>`, so an element that the HTML
 * parser is still writing into is indistinguishable from a finished one — its
 * `textContent` is simply shorter. The build stamps the expected length on the
 * opening tag (available as soon as the element exists), so a short read is
 * *detectable* instead of being inferred from timing.
 *
 * Returns `null` for anything unusable — still being written, truncated by an
 * abandoned parse, or not valid base64. Never throws: the caller treats `null`
 * as "no inlined payload" and fetches `index.rsc`, which the static build emits
 * alongside the inlined copy. Throwing here would surface as an un-hydratable
 * page, since the mount helper can only degrade on a rejected payload.
 */
function decodeInlineFlight(el: Element): Uint8Array | null {
  const text = el.textContent ?? "";
  const stamped = el.getAttribute(INLINE_FLIGHT_LENGTH_ATTR);
  if (stamped !== null) {
    if (text.length !== Number(stamped)) return null; // partial: not all of it is here
  } else if (document.readyState === "loading") {
    // HTML from a build that predates the stamp: completeness is unknowable, so
    // fall back to trusting a parsed document.
    return null;
  }

  const encoded = text.trim();
  if (!encoded) return null;
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    // Not decodable (e.g. base64 cut mid-quantum by an abandoned parse).
    return null;
  }
}

/**
 * Take the inlined payload, if this document carries a complete one.
 *
 * Resolves to `null` when there is nothing usable to take, in which case the
 * caller fetches `index.rsc` as usual.
 *
 * The client entry is an `async` module, so its execution is not ordered against
 * the HTML parser: when the entry is already in cache (a repeat visit, or a
 * navigation away from a still-loading page) it can run while the parser is
 * still streaming text into the payload element. A short read is caught by the
 * length stamp; if the parser is still going, we wait for it and re-check, since
 * the rest of the payload is still on its way.
 *
 * If the document's parse was ABANDONED (the user pressing Stop, a stalled
 * connection), `DOMContentLoaded` still fires and the text is still short — so
 * the re-check fails too and we fall through to the network rather than
 * decoding a truncated flight stream.
 */
function takeInlineFlight(): Uint8Array | PromiseLike<Uint8Array | null> | null {
  if (inlineFlightConsumed || typeof document === "undefined") return null;
  const el = document.getElementById(INLINE_FLIGHT_ID);
  // No element: either this document has no inlined payload, or the parser has
  // not reached it yet. Both are served correctly by fetching index.rsc.
  if (!el) return null;
  inlineFlightConsumed = true;

  const whole = decodeInlineFlight(el);
  if (whole) return whole;
  // Nothing usable yet. Only worth waiting if the parser is still running.
  if (document.readyState !== "loading") return null;
  return new Promise<Uint8Array | null>((resolve) => {
    document.addEventListener(
      "DOMContentLoaded",
      () => resolve(decodeInlineFlight(el)),
      { once: true }
    );
  });
}

export function createReactFetcher({
  moduleBaseURL = env.BASE_URL,
  publicOrigin = env.PUBLIC_ORIGIN,
  url = window.location.pathname,
  indexRSC = "index.rsc",
  headers = {
    Accept: "text/x-component",
  },
  signal,
  onResponse,
}: {
  url?: string;
  moduleBaseURL?: string;
  publicOrigin?: string;
  indexRSC?: string;
  headers?: HeadersInit;
  /**
   * Abort the underlying flight fetch. Pass an AbortController's signal and
   * abort it when the stream is superseded (e.g. a navigation starts a new
   * fetch before this one lands) — see the consumer pattern in the docs.
   * A stream cancelled through this signal never surfaces as a render
   * error: the returned thenable stays pending instead of rejecting, since
   * the consumer is about to replace it anyway.
   */
  signal?: AbortSignal;
  /**
   * Observe the network response before decoding (never called for an inlined
   * payload). The router uses this to detect a followed loader redirect
   * (`response.redirected`) and fix the address bar.
   */
  onResponse?: (response: Response) => void;
} = {}): PromiseLike<React.ReactNode> {
  const parsedURL = createPageURL(
    moduleBaseURL,
    publicOrigin,
    env.DEV
  )(url, indexRSC);

  const decodeOptions = {
    callServer: createCallServer(parsedURL.moduleBaseURL),
    moduleBaseURL: parsedURL.moduleBaseURL,
  };

  // Prefer the inlined initial-route payload (zero network round-trip) when
  // present; otherwise fetch index.rsc. The client itself comes from the
  // shared transport chooser (flightClient.browser.ts) — lazily, so this
  // module stays import-safe under the `react-server` condition.
  const flightClient = loadBrowserFlightClient as () => PromiseLike<{
    createFromReadableStream: (
      stream: ReadableStream<Uint8Array>,
      opts: typeof decodeOptions
    ) => PromiseLike<React.ReactNode>;
    createFromFetch: (
      response: Promise<Response>,
      opts: typeof decodeOptions
    ) => PromiseLike<React.ReactNode>;
  }>;

  const fromInline = (bytes: Uint8Array): PromiseLike<React.ReactNode> =>
    flightClient().then(({ createFromReadableStream }) =>
      createFromReadableStream(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        decodeOptions
      )
    );

  const fromNetwork = (): PromiseLike<React.ReactNode> => {
    // Start the fetch immediately, before the dynamic import resolves.
    const responsePromise = fetch(parsedURL.indexRSC, {
      headers: headers,
      signal,
    });
    if (onResponse) {
      // Observe without gating the decode; an observer throw is not a
      // flight error, and a rejected fetch is reported through decode anyway.
      responsePromise.then(
        (response) => {
          try {
            onResponse(response);
          } catch {
            /* observer-only */
          }
        },
        () => {}
      );
    }
    return flightClient().then(({ createFromFetch }) =>
      createFromFetch(responsePromise, decodeOptions)
    );
  };

  const fromStreamed = (
    stream: ReadableStream<Uint8Array>
  ): PromiseLike<React.ReactNode> =>
    flightClient().then(({ createFromReadableStream }) =>
      createFromReadableStream(stream, decodeOptions)
    );

  // Streamed delivery (`inlineFlight: "stream"`) or the network, in that
  // order — checked only when there is no blob payload, since a document
  // carries at most one delivery shape.
  const fromStreamedOrNetwork = (): PromiseLike<React.ReactNode> => {
    const streamed = takeStreamedFlight();
    if (streamed && "getReader" in streamed) return fromStreamed(streamed);
    if (streamed) {
      // Deferred: the parser hadn't reached any chunk script yet.
      return Promise.resolve(streamed).then((stream) =>
        stream ? fromStreamed(stream) : fromNetwork()
      );
    }
    return fromNetwork();
  };

  const inlineFlight = takeInlineFlight();
  let content: PromiseLike<React.ReactNode>;
  if (inlineFlight instanceof Uint8Array) {
    content = fromInline(inlineFlight);
  } else if (inlineFlight) {
    // Deferred to DOMContentLoaded: the payload was still being parsed. If it
    // turns out to be empty after all, fall back to the streamed shape or the
    // network.
    content = Promise.resolve(inlineFlight).then((bytes) =>
      bytes ? fromInline(bytes) : fromStreamedOrNetwork()
    );
  } else {
    content = fromStreamedOrNetwork();
  }
  if (!signal) {
    return content;
  }
  // A superseded stream rejects with AbortError (pre-flush) or the decoder's
  // "Error in input stream" TypeError (aborted mid-body). Neither is a real
  // flight failure when the caller cancelled on purpose — swallow them by
  // staying pending, so React keeps showing the previous/suspended UI until
  // the replacing fetch resolves. Genuine decode failures (signal not
  // aborted) still reject.
  return {
    then: (onfulfilled, onrejected) =>
      Promise.resolve(content).then(
        onfulfilled,
        (error: unknown) => {
          if (signal.aborted) {
            return new Promise<never>(() => {}) as never;
          }
          if (onrejected) return onrejected(error);
          throw error;
        }
      ),
  };
}

/** HMR event name used by the plugin */
export const RSC_HMR_EVENT = 'vite-plugin-react-server:server-component-update';

/** Data sent with RSC HMR events */
export interface RscHmrData {
  file: string;
  path: string;
}

/**
 * Set up HMR for React Server Components (non-React API).
 * 
 * For React components, use `useRscHmr()` hook instead.
 * 
 * @example
 * ```tsx
 * import { setupRscHmr } from 'vite-plugin-react-server/utils';
 * 
 * // Default: refetch current page's RSC stream (smart refresh)
 * setupRscHmr();
 * 
 * // Custom handler
 * setupRscHmr({
 *   onUpdate: async (data) => {
 *     console.log('Changed:', data.file);
 *     myCustomRefetch();
 *   }
 * });
 * ```
 */
export function setupRscHmr(options: {
  /**
   * Custom handler for server component updates.
   * If not provided, defaults to refetching the RSC stream for the current page.
   * Set to `'reload'` for full page reload behavior.
   */
  onUpdate?: ((data: RscHmrData) => void | Promise<void>) | 'reload';
  /**
   * Whether to log HMR events to console.
   * @default true in development
   */
  verbose?: boolean;
} = {}) {
  const { onUpdate, verbose = env.DEV } = options;
  
  if (typeof import.meta.hot === 'undefined') {
    return;
  }
  
  import.meta.hot.on(RSC_HMR_EVENT, async (data: RscHmrData) => {
    if (verbose) {
      console.log('[RSC HMR] Server component updated:', data.file);
    }
    
    if (onUpdate === 'reload') {
      window.location.reload();
      return;
    }
    
    if (onUpdate) {
      try {
        await onUpdate(data);
      } catch (error) {
        console.error('[RSC HMR] Error in onUpdate handler:', error);
        window.location.reload();
      }
    } else {
      // Default: full page reload
      // For smart RSC refetch, use useRscHmr() hook in your React tree
      window.location.reload();
    }
  });
  
  if (verbose) {
    console.log('[RSC HMR] Listening for server component updates');
  }
}
