import type { VitePluginFn } from "../../types.js";
import { configureReactServer } from "./configureReactServer.client.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { CSS_EXT } from "./collectRunnerCss.js";
import { emptyAutoDiscoveredFiles, isClientModuleFile } from "./devPluginShared.js";
import type { ConfigEnv } from "vite";


/**
 * Dev server plugin for client environment.
 * Uses configureServer hook for proper dev server setup.
 */
export const vitePluginReactDevServer: VitePluginFn = function _vitePluginReactServerDevClient(options) {
  if (options == null) {
    throw new Error("options is required");
  }

  if (options.verbose) {
  }
  
  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    if (resolvedOptions.error != null) {
      throw resolvedOptions.error;
    }
    throw new Error("Failed to resolve options");
  }
  const userOptions = resolvedOptions.userOptions;
  

  let configEnv: ConfigEnv | undefined;
  let hmrHandler: { sendHmrUpdate: (file: string, routes?: string[]) => void } | null = null;
  let isProcessingHmr = false; // Prevent recursive HMR updates

  return {
    name: "vite-plugin-react-server:dev-server-client",
    apply: "serve", // Only apply in dev server mode
    // No applyToEnvironment — hotUpdate needs to run for all environments
    // that should work regardless of environment filtering
    config(_config, viteConfigEnv) {
      configEnv = viteConfigEnv;
  
    },
    configureServer(server) {      
      // Log that plugin is being configured
      server.config.logger.info(`[vite-plugin-react-server] Dev server plugin configured for client environment`);
      
      // Configure the React server for client environment (worker-based)
      // This uses the existing configureReactServer.client.js implementation
      hmrHandler = configureReactServer({
        server,
        autoDiscoveredFiles: emptyAutoDiscoveredFiles(),
        userOptions,
        configEnv: configEnv!,
        serverManifest: {}, 
        resolvedConfig: server.config,
      });
    },
    hotUpdate(ctx: any) {
      const { file, server } = ctx;
      const envName = ctx.environment?.name ?? 'unknown';
      
      // Only run worker invalidation from the client environment (once per change)
      if (envName !== 'client') return;
      
      // Prevent recursive HMR updates
      if (isProcessingHmr) {
        return undefined;
      }
      
      // Handle server component file changes
      const moduleBase = userOptions.moduleBase || "src";
      const projectRoot = userOptions.projectRoot || server.config.root;
      
      // Normalize paths for comparison (handle both absolute and relative)
      const normalizedFile = file.replace(projectRoot, '').replace(/^\/+/, '');
      const isInModuleBase = normalizedFile.startsWith(moduleBase + '/');
      const isSourceFile = isInModuleBase &&
        (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.js'));
      // CSS edits route through the same worker-invalidation path so the
      // ModuleRunner cache drops every reachable CSS module before the
      // next render asks for class-name hashes.
      const isCssFile = isInModuleBase && CSS_EXT.test(file);

      // Skip client components — Vite owns client-side HMR (Fast Refresh
      // when `@vitejs/plugin-react` is installed, plain reload otherwise).
      // Worker invalidation is for the server tree.
      const isClientFile = isSourceFile && isClientModuleFile(file);

      // A CSS module imported transitively by a "use client" component lives
      // in the CLIENT module graph (the browser fetches it directly and Vite
      // injects it as a <style>), so Vite's native CSS HMR already updates it
      // in place — no reload, no <link> cache-bust. Detect that case by the
      // presence of client-environment modules for this file and hand the
      // update back to Vite by returning undefined. This is the dev:ssr
      // counterpart to the #96 fix in plugin.server.ts: that fix only takes
      // effect on the dev:rsc main thread (createPluginOrchestrator.server.js
      // -> plugin.server.ts). dev:ssr loads plugin.client.ts instead, so
      // without this branch client-graph CSS falls into the `return []`
      // suppression below and Vite's native CSS HMR never fires — leaving the
      // edit stuck until a manual refresh.
      const isClientGraphCss = isCssFile && (ctx.modules?.length ?? 0) > 0;
      if (isClientGraphCss) {
        return; // let Vite's native client CSS HMR apply the update
      }

      const isServerFile = isSourceFile && !isClientFile;
      const shouldInvalidateWorker = isServerFile || isCssFile;

      if (shouldInvalidateWorker && hmrHandler) {
        isProcessingHmr = true;

        try {
          if (userOptions.verbose) {
            server.config.logger.info(`[vite-plugin-react-server] File changed: ${file}, sending HMR update...`);
          }

          // Tell the worker to invalidate. Its HMR_UPDATE handler clears the
          // ModuleRunner cache so the next import re-fetches transformed code
          // through Vite — no worker restart needed.
          hmrHandler.sendHmrUpdate(file);

          // Notify the browser to refetch the RSC stream. In dev:rsc the
          // equivalent send lives in plugin.server.ts's hmrPlugin, which only
          // runs under the react-server orchestrator. dev:ssr (this plugin)
          // never loads that orchestrator, so without sending the event here
          // the worker invalidates correctly but the browser keeps showing
          // pre-edit content — `useRscHmr` listens for this event and only
          // refetches on receipt. For CSS files the consumer's <link> tag
          // still points at the same URL after the edit, so we tag the event
          // so the client also cache-busts matching stylesheets.
          server.ws.send({
            type: "custom",
            event: "vite-plugin-react-server:server-component-update",
            data: { file: normalizedFile, path: file, kind: isCssFile ? "css" : "component" },
          });

          // The runner takes care of per-module invalidation, so the only
          // thing left to clear here is the local processing flag.
          setTimeout(() => {
            isProcessingHmr = false;
          }, 100);
        } catch (error) {
          server.config.logger.error(`[vite-plugin-react-server] Error handling HMR update: ${error}`);
          isProcessingHmr = false;
        }

        // For CSS edits in dev:ssr, suppress Vite's default behavior. Vite's
        // fallback for module-graph-untracked CSS is a full page reload, and
        // even tracked CSS modules in dev:ssr can fall back to reload because
        // vprs renders them server-side via the <Css cssFiles={...}/> pattern
        // (the client never directly imports them, so Vite's CSS HMR isn't
        // reachable). useRscHmr handles both shapes:
        //  - inlined <style>: refetch brings new content
        //  - <link href=…>:   refreshCssLinks cache-busts the URL
        if (isCssFile) return [];
      } else if (shouldInvalidateWorker && !hmrHandler) {
        if (userOptions.verbose) {
          server.config.logger.warn(`[vite-plugin-react-server] Source file changed but HMR handler not available yet: ${file}`);
        }
      }

      // Don't suppress — plugin.server.ts hotUpdate handles page reload prevention
    },
  };
};
