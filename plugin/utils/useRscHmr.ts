// Namespace import (not `{ useEffect, useRef }`): this module is re-exported from
// the react-server `/utils` barrel (index.server.ts), and a NAMED hook import is
// not load-safe there. React's react-server build omits the client hooks, and on
// the experimental train they aren't even cjs-module-lexer-detectable named
// exports, so `import { useEffect } from "react"` throws at load under
// `--conditions react-server`. The namespace import loads fine; the hooks are
// only ever accessed when the hook actually runs (browser-only).
import * as React from "react";
import { RSC_HMR_EVENT } from "./createReactFetcher.js";
import type { RscHmrData } from "./createReactFetcher.js";
import { env } from "#env";

// Mirror of refreshCssLinks in virtualRscHmrPlugin.ts (see comment there).
// data.file is the project-relative path (eg "src/css/9mmc.module.css") and
// the link href is a URL whose pathname ends with the same suffix.
// Falls back to basename matching for edge cases where the project-relative
// form doesn't appear verbatim in the href.
function refreshCssLinks(data: RscHmrData): boolean {
  if (!data || typeof document === "undefined") return false;
  const rel = String(data.file || "").replace(/^[\\/]+/, "");
  if (!rel) return false;
  const basename = rel.split(/[\\/]/).pop();
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  let refreshed = 0;
  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;
    let pathname: string;
    try {
      pathname = new URL(href, window.location.origin).pathname;
    } catch {
      pathname = href.split("?")[0] ?? "";
    }
    const matches =
      pathname.endsWith("/" + rel) ||
      pathname.endsWith(rel) ||
      (!!basename && pathname.endsWith("/" + basename));
    if (!matches) return;
    const url = new URL(href, window.location.origin);
    url.searchParams.set("t", String(Date.now()));
    link.setAttribute("href", url.pathname + url.search);
    refreshed++;
  });
  return refreshed > 0;
}

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

  // Keep the latest callback + options in a ref so the subscribe effect can run
  // exactly once on mount. Keying the effect on the handler identity instead
  // would tear down and re-add the import.meta.hot listener on every render —
  // and since client-side RSC navigation re-renders the shell, an unmemoized
  // (inline) refetch callback would churn the listener (and re-log "Listening…")
  // on every navigation. The ref pattern makes inline callbacks safe.
  const ref = React.useRef<{
    refetch: (url: string) => void;
    verbose: boolean;
    filter?: (data: RscHmrData) => boolean;
  }>({ refetch, verbose, filter });
  ref.current = { refetch, verbose, filter };

  React.useEffect(() => {
    if (typeof import.meta.hot === 'undefined') return;

    const handler = (data: RscHmrData) => {
      const { refetch, verbose, filter } = ref.current;
      if (filter && !filter(data)) return;
      const kind = (data as { kind?: string }).kind;
      if (verbose) {
        console.log('[RSC HMR] Server component updated:', data.file, kind ? `(${kind})` : '');
      }
      if (kind === 'css') {
        refreshCssLinks(data);
      }
      refetch(window.location.pathname);
    };

    import.meta.hot.on(RSC_HMR_EVENT, handler);

    if (ref.current.verbose) {
      console.log('[RSC HMR] Listening for server component updates');
    }

    return () => {
      import.meta.hot!.off(RSC_HMR_EVENT, handler);
    };
  }, []);
}
