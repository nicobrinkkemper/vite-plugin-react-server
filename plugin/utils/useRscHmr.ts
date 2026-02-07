import { useEffect, useCallback } from "react";
import { RSC_HMR_EVENT } from "./createReactFetcher.js";
import type { RscHmrData } from "./createReactFetcher.js";
import { env } from "./env.js";

/**
 * React hook for RSC HMR (Hot Module Replacement).
 * 
 * When a server component file changes, this hook calls your `refetch` function
 * to re-fetch the RSC stream. Combined with `startTransition`, this preserves
 * client component state while updating server-rendered content.
 * 
 * @example
 * ```tsx
 * import { useRscHmr } from 'vite-plugin-react-server/utils';
 * 
 * function Shell({ data }) {
 *   const [storeData, setStoreData] = useState(data);
 *   
 *   const refetch = useCallback((url: string) => {
 *     startTransition(() => {
 *       setStoreData(createReactFetcher({ url }));
 *     });
 *   }, []);
 *   
 *   // Refetch RSC stream when server components change
 *   useRscHmr(refetch);
 *   
 *   return <>{use(storeData)}</>;
 * }
 * ```
 * 
 * @param refetch - Function to call when server components change. 
 *   Receives the current pathname. Use `startTransition` inside for smooth updates.
 * @param options - Optional configuration
 */
export function useRscHmr(
  refetch: (url: string) => void,
  options: {
    /** Whether to log HMR events. @default true in dev */
    verbose?: boolean;
    /** Custom filter — return false to skip refetch for specific files */
    filter?: (data: RscHmrData) => boolean;
  } = {}
) {
  const { verbose = env.DEV, filter } = options;

  const handler = useCallback(
    (data: RscHmrData) => {
      if (filter && !filter(data)) return;
      if (verbose) {
        console.log('[RSC HMR] Server component updated:', data.file);
      }
      refetch(window.location.pathname);
    },
    [refetch, verbose, filter]
  );

  useEffect(() => {
    if (typeof import.meta.hot === 'undefined') return;

    import.meta.hot.on(RSC_HMR_EVENT, handler);
    
    if (verbose) {
      console.log('[RSC HMR] Listening for server component updates');
    }

    return () => {
      import.meta.hot!.off(RSC_HMR_EVENT, handler);
    };
  }, [handler, verbose]);
}
