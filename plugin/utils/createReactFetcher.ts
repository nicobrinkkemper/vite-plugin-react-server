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
} = {}) {
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

/**
 * Set up HMR for React Server Components.
 * Call this in your client entry point to enable automatic refresh when server components change.
 * 
 * @example
 * ```tsx
 * // client.tsx
 * import { setupRscHmr } from 'vite-plugin-react-server/utils';
 * 
 * // Option 1: Simple - full page refresh on server component change
 * setupRscHmr();
 * 
 * // Option 2: Custom - refetch RSC and update React tree
 * setupRscHmr({
 *   onUpdate: async () => {
 *     // Your custom refetch logic
 *     const newRoot = await createReactFetcher();
 *     // Update your React state
 *   }
 * });
 * ```
 */
export function setupRscHmr(options: {
  /**
   * Custom handler for server component updates.
   * If not provided, defaults to full page reload.
   */
  onUpdate?: (data: { file: string; path: string }) => void | Promise<void>;
  /**
   * Whether to log HMR events to console.
   * @default true in development
   */
  verbose?: boolean;
} = {}) {
  const { onUpdate, verbose = env.DEV } = options;
  
  // Only set up HMR in development with Vite's hot module API
  if (typeof import.meta.hot === 'undefined') {
    return;
  }
  
  import.meta.hot.on('vite-plugin-react-server:server-component-update', async (data: { file: string; path: string }) => {
    if (verbose) {
      console.log('[vite-plugin-react-server] Server component updated:', data.file);
    }
    
    if (onUpdate) {
      try {
        await onUpdate(data);
      } catch (error) {
        console.error('[vite-plugin-react-server] Error in onUpdate handler:', error);
        // Fallback to reload on error
        window.location.reload();
      }
    } else {
      // Default: full page reload to ensure fresh RSC stream
      // Users can provide custom onUpdate for more sophisticated updates
      window.location.reload();
    }
  });
  
  if (verbose) {
    console.log('[vite-plugin-react-server] RSC HMR enabled');
  }
}
