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

// Cache-bust every <link rel="stylesheet"> whose href references the changed
// file. Server-collected CSS (vprs's <Css cssFiles={...}/> pattern) isn't in
// the client module graph, so Vite's native CSS HMR never fires for these —
// the <link> URL doesn't change and the browser keeps the cached stylesheet.
// data.file is the project-relative path (eg "src/css/9mmc.module.css") and
// the link href is a URL whose pathname ends with the same suffix.
// We also fall back to basename matching to handle edge cases where the
// project-relative form doesn't appear verbatim in the href.
function refreshCssLinks(data) {
  if (!data) return false;
  const rel = String(data.file || '').replace(/^[\\\\/]+/, '');
  if (!rel) return false;
  const basename = rel.split(/[\\\\/]/).pop();
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  let refreshed = 0;
  for (const link of links) {
    const href = link.getAttribute('href');
    if (!href) continue;
    let pathname;
    try {
      pathname = new URL(href, window.location.origin).pathname;
    } catch {
      pathname = href.split('?')[0];
    }
    const matches =
      pathname.endsWith('/' + rel) ||
      pathname.endsWith(rel) ||
      (basename && pathname.endsWith('/' + basename));
    if (!matches) continue;
    const url = new URL(href, window.location.origin);
    url.searchParams.set('t', String(Date.now()));
    link.setAttribute('href', url.pathname + url.search);
    refreshed++;
  }
  return refreshed > 0;
}

export function useRscHmr(refetch, options = {}) {
  const { verbose = true, filter } = options;

  const handler = useCallback(
    (data) => {
      if (filter && !filter(data)) return;
      if (verbose) {
        console.log('[RSC HMR] Server component updated:', data.file, data.kind ? '(' + data.kind + ')' : '');
      }
      if (data && data.kind === 'css') {
        refreshCssLinks(data);
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
      console.log('[RSC HMR] Server component updated:', data.file, data.kind ? '(' + data.kind + ')' : '');
    }
    if (data && data.kind === 'css') {
      refreshCssLinks(data);
    }
    if (onUpdate === 'reload') {
      window.location.reload();
      return;
    }
    if (onUpdate) {
      try { await onUpdate(data); }
      catch (error) { console.error('[RSC HMR] Error in onUpdate handler:', error); window.location.reload(); }
    } else if (!data || data.kind !== 'css') {
      // For non-CSS updates without a handler, fall back to reload.
      // For CSS updates, refreshCssLinks already handled it visually.
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
