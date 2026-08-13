import type { StreamPluginOptions } from "../../types.js";
import { configureReactServer } from "./configureReactServer.server.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { CSS_EXT } from "./collectRunnerCss.js";
import type { Plugin, ViteDevServer } from "vite";
import { emptyAutoDiscoveredFiles, isClientModuleFile, devFlightTransportTags, clientOwnedCssModules } from "./devPluginShared.js";
import { getDevShellHeadProvider } from "./devShellHeadProvider.js";
import { mergeDevShellHead } from "./devShellHead.js";

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
    // transport:"webpack": stamp the dev document with the flight-transport
    // hint so the browser picks the webpack flight client (dev/prod parity
    // with the baked pair's documents). No-op on esm. Lives on this plugin
    // (not the server-environment one) because the html transform runs
    // outside the server environment filter.
    async transformIndexHtml(html: string, ctx: { server?: ViteDevServer }) {
      const transportTags = devFlightTransportTags(userOptions) ?? [];
      // Dev-shell head-merge, when a provider is registered (the worker-based
      // dev flow configures one; without it this is transport tags only —
      // byte-for-byte the previous document).
      const provider = getDevShellHeadProvider(ctx?.server);
      if (!provider) {
        return transportTags.length ? transportTags : undefined;
      }
      const merged = mergeDevShellHead(html, await provider.getTags());
      return { html: merged.html, tags: [...transportTags, ...merged.tags] };
    },
    // Server-level handleHotUpdate — sends custom WS event to client
    // Vite 6 Environment API: hotUpdate runs per-environment.
    // Prevent server/ssr environments from triggering page reload for client components.
    hotUpdate(this: any, ctx: any) {
      const { file, server } = ctx;
      // The environment lives on the HOOK CONTEXT (`this.environment`), not on
      // the options bag — on Vite 8 `ctx.environment` is undefined, so reading
      // only ctx left every call as 'unknown': the client branch (which pushes
      // the server-component-update event to the browser) never ran, and dev:rsc
      // edits to page/route.tsx were suppressed without a refetch push.
      const envName =
        this?.environment?.name ?? ctx.environment?.name ?? 'unknown';

      const moduleBase = userOptions.moduleBase || "src";
      const projectRoot = userOptions.projectRoot || server?.config?.root || '';
      const normalizedFile = file.replace(projectRoot, '').replace(/^\/+/, '');
      const isSourceFile = normalizedFile.startsWith(moduleBase + '/');
      
      if (!isSourceFile) return;
      
      // Client environment: Vite owns client-side HMR (Fast Refresh if
      // `@vitejs/plugin-react` is installed; plain reload otherwise).
      if (envName === 'client') {
        const isClient = isClientModuleFile(file);

        if (isClient) return; // Vite's client-side HMR owns this update

        const isCssFile = CSS_EXT.test(file);

        // A CSS module imported transitively by a "use client" component lives
        // in the CLIENT module graph (the browser fetches it directly and Vite
        // injects it as a <style>), so Vite's native CSS HMR already updates it
        // in place — no reload, no <link> cache-bust. Detect that case by the
        // presence of client-graph IMPORTERS and hand the update back to
        // Vite. Node presence alone is not enough: a server-only stylesheet
        // rendered as <link> also gets a client-graph node from the browser's
        // fetch of that URL, but with no importers Vite can only full-reload —
        // that css must stay on the RSC refetch + cache-bust path below.
        // Suppressing genuinely client-owned css here (the `return []` below)
        // is what previously left client-graph CSS edits stuck until a manual
        // refresh: the RSC <link> cache-bust never matches a Vite <style>.
        // Css: hand Vite ONLY the modules its native css HMR can hot-swap
        // (client-JS-imported nodes); the link-fetch artifacts would
        // dead-end propagation into a full reload. The kind:"css" event
        // below cache-busts the <link> copy either way.
        const clientOwnedCss = isCssFile
          ? clientOwnedCssModules(ctx.modules, file)
          : [];

        // CSS files that aren't imported via the client module graph (vprs's
        // <Css cssFiles={...}/> pattern collects them server-side) aren't
        // tracked by Vite's CSS HMR, so a content edit leaves the <link>
        // tag's href unchanged. Tag the event so useRscHmr knows to refresh
        // matching link tags by cache-busting their href.
        const kind: 'css' | 'component' = isCssFile ? 'css' : 'component';

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

        // Css keeps its hot-swappable modules; everything else suppresses.
        return (isCssFile ? clientOwnedCss : []) as never[]; // no full-reload dead ends
      }
      
      // Server/SSR environments: suppress page reload for all source files
      // Server components are handled by the RSC refetch event sent above
      // Invalidate the server module so next RSC request gets fresh content
      if (envName === 'server') {
        const environment = this?.environment ?? ctx.environment;
        const mod = environment?.moduleGraph?.getModulesByFile(file);
        if (mod) {
          for (const m of mod) {
            environment.moduleGraph.invalidateModule(m);
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
        autoDiscoveredFiles: emptyAutoDiscoveredFiles(),
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
