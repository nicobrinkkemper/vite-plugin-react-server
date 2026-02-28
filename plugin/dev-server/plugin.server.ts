import type { StreamPluginOptions } from "../../types.js";
import { configureReactServer } from "./configureReactServer.server.js";
import { resolveOptions } from "../config/resolveOptions.js";
import type { Plugin, ViteDevServer } from "vite";
import { readFileSync } from "node:fs";

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
    // Server-level handleHotUpdate — sends custom WS event to client
    // Vite 6 Environment API: hotUpdate runs per-environment.
    // Prevent server/ssr environments from triggering page reload for client components.
    hotUpdate(ctx: any) {
      const { file, server } = ctx;
      const envName = ctx.environment?.name ?? 'unknown';
      
      const moduleBase = userOptions.moduleBase || "src";
      const projectRoot = userOptions.projectRoot || server?.config?.root || '';
      const normalizedFile = file.replace(projectRoot, '').replace(/^\/+/, '');
      const isSourceFile = normalizedFile.startsWith(moduleBase + '/');
      
      if (!isSourceFile) return;
      
      // Client environment: let Vite/@vitejs/plugin-react handle it
      if (envName === 'client') {
        // Check if it's a client component — let Fast Refresh handle it
        const isClient = (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js')) && (() => {
          try {
            const head = readFileSync(file, 'utf-8').slice(0, 200);
            return /^\s*["']use client["']/.test(head.split('\n')[0]);
          } catch { return false; }
        })();
        
        if (isClient) return; // Let Fast Refresh handle client components
        
        // Server component changed — send RSC refetch event to client
        // Only do this once (from client env) to avoid duplicate events
        server.config.logger.info(`[vite-plugin-react-server] Server component changed: ${normalizedFile}`);
        server.ws.send({
          type: 'custom',
          event: 'vite-plugin-react-server:server-component-update',
          data: { file: normalizedFile, path: file },
        });
        
        return []; // Don't trigger client-side page reload
      }
      
      // Server/SSR environments: suppress page reload for all source files
      // Server components are handled by the RSC refetch event sent above
      // Invalidate the server module so next RSC request gets fresh content
      if (envName === 'server') {
        const mod = ctx.environment?.moduleGraph?.getModulesByFile(file);
        if (mod) {
          for (const m of mod) {
            ctx.environment.moduleGraph.invalidateModule(m);
          }
        }
      }
      return [];
    },
    handleHotUpdate({ file, server }: { file: string; server: ViteDevServer }) {
      const moduleBase = userOptions.moduleBase || "src";
      const projectRoot = userOptions.projectRoot || server.config.root;
      const normalizedFile = file.replace(projectRoot, '').replace(/^\/+/, '');
      const isSourceFile = normalizedFile.startsWith(moduleBase + '/') && 
        (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js'));
      
      // Skip client components — let @vitejs/plugin-react handle them
      // with Fast Refresh (preserves component-level state).
      const isClientFile = isSourceFile && (() => {
        try {
          const head = readFileSync(file, 'utf-8').slice(0, 200);
          return /^\s*["']use client["']/.test(head.split('\n')[0]);
        } catch { return false; }
      })();
      
      if (isSourceFile && !isClientFile) {
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
      
      if (isClientFile) {
        // Client components are handled by @vitejs/plugin-react (Fast Refresh)
        // or Vite's client-side HMR. Return empty to prevent the server
        // environment from triggering a full page reload.
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

  // Fix CJS named imports in server environment.
  // Vite's esbuild JSX transform (and @vitejs/plugin-react if present) generates
  // named imports like `import { useEffect } from "react"`. In the server environment,
  // react's react-server export is CJS-only, and Node's ESM interop doesn't support
  // named exports from CJS. This post-transform rewrites them.
  const cjsFixPlugin: Plugin = {
    name: "vite-plugin-react-server:server-cjs-fix",
    apply: "serve" as const,
    enforce: "post" as const,
    applyToEnvironment(env: any) {
      return env?.name === 'server';
    },
    transform(code: string, id: string) {
      if (id.includes('node_modules')) return;
      if (!id.match(/\.[jt]sx?$/)) return;
      
      const namedImportRe = /import\s*\{([^}]+)\}\s*from\s*["']react["']\s*;?/g;
      if (!namedImportRe.test(code)) return;
      
      namedImportRe.lastIndex = 0;
      let counter = 0;
      const result = code.replace(namedImportRe, (_match, imports) => {
        const alias = `__react_cjs_${counter++}`;
        return `import ${alias} from "react"; const {${imports}} = ${alias};`;
      });
      
      return { code: result, map: null };
    },
  };

  return [hmrPlugin, cjsFixPlugin, serverPlugin];
};
