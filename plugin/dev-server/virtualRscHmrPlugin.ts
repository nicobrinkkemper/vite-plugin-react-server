import type { Plugin } from "vite";

const VIRTUAL_RSC_HMR = 'virtual:react-server/hmr';
const RESOLVED_VIRTUAL_RSC_HMR = '\0' + VIRTUAL_RSC_HMR;

/**
 * Virtual module source for `virtual:react-server/hmr`.
 * Self-contained — no imports from the plugin package, so no dep re-optimization.
 * HMR code is dead-code eliminated in production builds (import.meta.hot is undefined).
 */
const VIRTUAL_RSC_HMR_SOURCE = /* js */`
import { useEffect, useCallback } from "react";

const RSC_HMR_EVENT = 'vite-plugin-react-server:server-component-update';

export { RSC_HMR_EVENT };

export function useRscHmr(refetch, options = {}) {
  const { verbose = true, filter } = options;

  const handler = useCallback(
    (data) => {
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
      import.meta.hot.off(RSC_HMR_EVENT, handler);
    };
  }, [handler, verbose]);
}

export function setupRscHmr(options = {}) {
  const { onUpdate, verbose = true } = options;
  if (typeof import.meta.hot === 'undefined') return;
  import.meta.hot.on(RSC_HMR_EVENT, async (data) => {
    if (verbose) {
      console.log('[RSC HMR] Server component updated:', data.file);
    }
    if (onUpdate === 'reload') {
      window.location.reload();
      return;
    }
    if (onUpdate) {
      try { await onUpdate(data); }
      catch (error) { console.error('[RSC HMR] Error in onUpdate handler:', error); window.location.reload(); }
    } else {
      window.location.reload();
    }
  });
  if (verbose) {
    console.log('[RSC HMR] Listening for server component updates');
  }
}
`;

/**
 * Plugin that provides the `virtual:react-server/hmr` module.
 * Works in both dev and build — HMR code tree-shakes away in production.
 */
export function virtualRscHmrPlugin(): Plugin {
  return {
    name: "vite-plugin-react-server:virtual-rsc-hmr",
    resolveId(id) {
      if (id === VIRTUAL_RSC_HMR) return RESOLVED_VIRTUAL_RSC_HMR;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_RSC_HMR) return VIRTUAL_RSC_HMR_SOURCE;
    },
  };
}
