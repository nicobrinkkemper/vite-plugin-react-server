import type React from "react";
import { createFromFetch } from "react-server-dom-esm/client.browser";
import { createCallServer } from "./createCallServer.js";
import { env } from "./env.js";
import { createPageURL } from "./urls.js";

export function createReactFetcher({
  moduleBaseURL = env.BASE_URL,
  publicOrigin = env.PUBLIC_ORIGIN,
  url = window.location.pathname,
  indexRSC = "index.rsc",
  headers = {
    Accept: "text/x-component",
  },
}: {
  url?: string;
  moduleBaseURL?: string;
  publicOrigin?: string;
  indexRSC?: string;
  headers?: HeadersInit;
} = {}): PromiseLike<React.ReactNode> {
  const parsedURL = createPageURL(
    moduleBaseURL,
    publicOrigin,
    env.DEV
  )(url, indexRSC);
  return createFromFetch(
    fetch(parsedURL.indexRSC, {
      headers: headers,
    }),
    {
      callServer: createCallServer(parsedURL.moduleBaseURL),
      moduleBaseURL: parsedURL.moduleBaseURL,
    }
  );
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
 * import { setupRscHmr } from 'vite-plugin-react-server/utils/rsc-client';
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
