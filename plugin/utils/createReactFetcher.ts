import type React from "react";
import { createCallServer } from "./createCallServer.js";
import { env } from "#env";
import { createPageURL } from "./urls.js";
import { INLINE_FLIGHT_ID } from "./inlineFlightId.js";

// The static build can inline the initial route's flight payload into the HTML
// (see inlineFlightPayload). Consume it exactly once — for the first fetch after
// load, i.e. the initial route's render — then fall back to the network for
// client navigations, whose payloads aren't inlined.
let inlineFlightConsumed = false;

function decodeInlineFlight(el: Element): Uint8Array | null {
  const encoded = el.textContent?.trim();
  if (!encoded) return null;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Take the inlined payload, if this document carries one.
 *
 * Resolves to `null` when there is nothing to take, in which case the caller
 * fetches `index.rsc` as usual.
 *
 * THE PAYLOAD IS THE TEXT OF AN INLINE `<script>`, and the client entry is an
 * `async` module — its execution is not ordered against the HTML parser. When
 * the entry is already in cache (a repeat visit, or a navigation away from a
 * still-loading page) it can run WHILE THE PARSER IS STILL STREAMING TEXT INTO
 * THAT ELEMENT. `textContent` then holds only the bytes parsed so far, and
 * decoding it yields a truncated flight stream: React reaches the end of an
 * incomplete payload and throws "Connection closed" (#412), which the caller
 * can only degrade on — leaving the page un-hydrated until a reload.
 *
 * An element's text is guaranteed complete once the document is parsed, so when
 * the parser is still running we wait for it. That wait only ever applies to
 * this inline read: the payload element sits near the end of the body, so a
 * parser that has not finished has, at most, the document's tail left to go.
 * The network path below is untouched and still starts its fetch immediately.
 */
function takeInlineFlight(): Uint8Array | PromiseLike<Uint8Array | null> | null {
  if (inlineFlightConsumed || typeof document === "undefined") return null;
  const el = document.getElementById(INLINE_FLIGHT_ID);
  // No element: either this document has no inlined payload, or the parser has
  // not reached it yet. Both are served correctly by fetching index.rsc, which
  // the static build emits alongside the inlined copy.
  if (!el) return null;
  inlineFlightConsumed = true;
  if (document.readyState === "loading") {
    return new Promise<Uint8Array | null>((resolve) => {
      document.addEventListener(
        "DOMContentLoaded",
        () => resolve(decodeInlineFlight(el)),
        { once: true }
      );
    });
  }
  return decodeInlineFlight(el);
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
  // present; otherwise fetch index.rsc. Either way the browser flight client is
  // imported lazily so this module stays import-safe under the `react-server`
  // condition (a static import of client.browser would drag react-dom/client
  // into the server graph).
  const fromInline = (bytes: Uint8Array): PromiseLike<React.ReactNode> =>
    import("react-server-dom-esm/client.browser").then(
      ({ createFromReadableStream }) =>
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
    return import("react-server-dom-esm/client.browser").then(
      ({ createFromFetch }) => createFromFetch(responsePromise, decodeOptions)
    );
  };

  const inlineFlight = takeInlineFlight();
  let content: PromiseLike<React.ReactNode>;
  if (inlineFlight instanceof Uint8Array) {
    content = fromInline(inlineFlight);
  } else if (inlineFlight) {
    // Deferred to DOMContentLoaded: the payload was still being parsed. If it
    // turns out to be empty after all, fall back to the network.
    content = Promise.resolve(inlineFlight).then((bytes) =>
      bytes ? fromInline(bytes) : fromNetwork()
    );
  } else {
    content = fromNetwork();
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
