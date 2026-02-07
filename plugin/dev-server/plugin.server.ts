import type { StreamPluginOptions } from "../../types.js";
import { configureReactServer } from "./configureReactServer.server.js";
import { resolveOptions } from "../config/resolveOptions.js";
import type { Plugin, ViteDevServer } from "vite";

const VIRTUAL_RSC_HMR = 'virtual:react-server/hmr';
const RESOLVED_VIRTUAL_RSC_HMR = '\0' + VIRTUAL_RSC_HMR;

/**
 * Virtual module source for `virtual:react-server/hmr`.
 * Self-contained — no imports from the plugin package, so no dep re-optimization.
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
 * Dev server plugin for server environment.
 * Returns two plugins: one for HMR handling (all environments) and one for server config.
 */
export const vitePluginReactDevServer = function _vitePluginReactServerDevServer(options: StreamPluginOptions): Plugin[] {
  if (options == null) {
    throw new Error("options is required");
  }

  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    if (resolvedOptions.error != null) {
      throw resolvedOptions.error;
    }
    throw new Error("Failed to resolve options");
  }
  const userOptions = resolvedOptions.userOptions;

  // Separate plugin for HMR handling (must apply to all environments)
  const hmrPlugin = {
    name: "vite-plugin-react-server:server-hmr",
    apply: "serve" as const,
    resolveId(id: string) {
      if (id === VIRTUAL_RSC_HMR) return RESOLVED_VIRTUAL_RSC_HMR;
    },
    load(id: string) {
      if (id === RESOLVED_VIRTUAL_RSC_HMR) return VIRTUAL_RSC_HMR_SOURCE;
    },
    // Server-level handleHotUpdate — sends custom WS event to client
    handleHotUpdate({ file, server }: { file: string; server: ViteDevServer }) {
      const moduleBase = userOptions.moduleBase || "src";
      const projectRoot = userOptions.projectRoot || server.config.root;
      const normalizedFile = file.replace(projectRoot, '').replace(/^\/+/, '');
      const isServerFile = normalizedFile.startsWith(moduleBase + '/') && 
        (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js'));
      
      if (isServerFile) {
        server.config.logger.info(`[vite-plugin-react-server] Server component changed: ${normalizedFile}`);
        
        // Send custom HMR event so client can refetch RSC stream
        server.ws.send({
          type: 'custom',
          event: 'vite-plugin-react-server:server-component-update',
          data: {
            file: normalizedFile,
            path: file,
          },
        });
        
        // Invalidate the server module so next request gets fresh content
        const mod = server.environments['server']?.moduleGraph?.getModulesByFile(file);
        if (mod) {
          for (const m of mod) {
            server.environments['server']?.moduleGraph?.invalidateModule(m);
          }
        }
        
        // Return empty array to prevent Vite's default full-page reload
        // The client will refetch the RSC stream via the custom event
        return [];
      }
    },
  };

  const serverPlugin = {
    name: "vite-plugin-react-server:dev-server-server",
    apply: "serve" as const,
    applyToEnvironment(partialEnvironment: any) {
      return partialEnvironment?.consumer === 'server';
    },
    configureServer(server: ViteDevServer) {
      // Log that plugin is being configured
      server.config.logger.info(`[vite-plugin-react-server] Dev server plugin configured for server environment (react-server condition)`);
      
      // Configure the React server for server environment (direct RSC processing)
      // This uses the existing configureReactServer.server.js implementation
      configureReactServer({
        server,
        autoDiscoveredFiles: {
          propsMap: new Map(),
          pageMap: new Map(),
          rootMap: new Map(),
          htmlMap: new Map(),
          routeMap: new Map(),
          urlMap: new Map(),
          errors: [],
          workerPaths: {},
          serverEntry: null,
          clientEntry: {},
          clientInputs: {},
          staticInputs: {},
          serverInputs: {},
          // staticManifest removed from AutoDiscoveredFiles
          serverActions: {},
        },
        userOptions,
        serverManifest: {},
        resolvedConfig: server.config,
      });
    },
  };

  return [hmrPlugin, serverPlugin];
};
