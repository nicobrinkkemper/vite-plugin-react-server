import type { StreamPluginOptions } from "../../types.js";
import { configureReactServer } from "./configureReactServer.server.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { detectClientModule } from "../loader/directives/detectClientModule.js";
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
      
      // Client environment: Vite owns client-side HMR (Fast Refresh if
      // `@vitejs/plugin-react` is installed; plain reload otherwise).
      if (envName === 'client') {
        // Routes through `detectClientModule` so this watcher can't disagree
        // with the build's transformer / worker / createModuleID on the same
        // input. Note: the previous inline detector only read 200 chars and
        // the first line, which missed a `"use client"` placed below a long
        // JSDoc header or `"use strict"` prologue — both handled by the
        // helper's char-scanner.
        const isClient = (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js')) && (() => {
          try {
            const source = readFileSync(file, "utf-8");
            return detectClientModule({ source, moduleId: file });
          } catch { return false; }
        })();

        if (isClient) return; // Vite's client-side HMR owns this update

        // CSS files that aren't imported via the client module graph (vprs's
        // <Css cssFiles={...}/> pattern collects them server-side) aren't
        // tracked by Vite's CSS HMR, so a content edit leaves the <link>
        // tag's href unchanged. Tag the event so useRscHmr knows to refresh
        // matching link tags by cache-busting their href.
        const kind: 'css' | 'component' =
          file.endsWith('.css') || file.endsWith('.scss') ||
          file.endsWith('.sass') || file.endsWith('.less')
            ? 'css'
            : 'component';

        // Server component changed — send RSC refetch event to client
        // Only do this once (from client env) to avoid duplicate events
        if (userOptions.verbose) {
          server.config.logger.info(`[vite-plugin-react-server] File changed (RSC refetch): ${normalizedFile}`);
        }
        server.ws.send({
          type: 'custom',
          event: 'vite-plugin-react-server:server-component-update',
          data: { file: normalizedFile, path: file, kind },
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
