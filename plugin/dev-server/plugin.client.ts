import type { VitePluginFn } from "../../types.js";
import { configureReactServer } from "./configureReactServer.client.js";
import { resolveOptions } from "../config/resolveOptions.js";
import { CSS_EXT } from "./collectRunnerCss.js";
import { emptyAutoDiscoveredFiles, isClientModuleFile, devFlightTransportTags, clientOwnedCssModules, isServerGraphFile } from "./devPluginShared.js";
import { getDevShellHeadProvider } from "./devShellHeadProvider.js";
import { mergeDevShellHead } from "./devShellHead.js";
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
    // Two dev-document concerns ride this hook:
    // - transport:"webpack": stamp the flight-transport hint (no-op on esm).
    // - dev-shell head-merge: inject the document component's head so the dev
    //   shell matches prod (lazy render + cache via the provider; on any
    //   failure the provider resolves [] and the html is served unchanged).
    async transformIndexHtml(html: string, ctx: { server?: import("vite").ViteDevServer }) {
      const transportTags = devFlightTransportTags(userOptions) ?? [];
      const provider = getDevShellHeadProvider(ctx?.server);
      if (!provider) {
        return transportTags.length ? transportTags : undefined;
      }
      const merged = mergeDevShellHead(html, await provider.getTags());
      return { html: merged.html, tags: [...transportTags, ...merged.tags] };
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
    hotUpdate(this: any, ctx: any) {
      const { file, server } = ctx;
      // The environment lives on the hook context (`this.environment`); on
      // Vite 8 `ctx.environment` is undefined. Keep both fallbacks.
      const envName =
        this?.environment?.name ?? ctx.environment?.name ?? 'unknown';

      // Run worker invalidation once per change, from the client-environment
      // call. A manually-triggered hotUpdate can still arrive with no
      // environment ('unknown') — handle both, or the RSC worker never hears
      // about the edit. Multiple calls for the same change are deduped by
      // `isProcessingHmr` below.
      if (envName !== 'client' && envName !== 'unknown') {
        // Not a plain pass-through for css: the server/ssr environments hold
        // their own node for a server-imported stylesheet (page.tsx imports
        // it for class-name hashes), and Vite's native propagation for that
        // node dead-ends into a full reload — the dev:rsc orchestrator
        // suppresses this in plugin.server.ts, and dev:ssr must match. The
        // client-environment call owns the real update (worker invalidation
        // + the kind:'css' cache-bust event).
        const rel = file.replace(userOptions.projectRoot || server.config.root, '').replace(/^\/+/, '');
        if (rel.startsWith((userOptions.moduleBase || 'src') + '/') && CSS_EXT.test(file)) {
          return [];
        }
        return;
      }
      
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
      // Content the server tree imports from outside the module base or
      // without a script extension (markdown via `?raw` globs, JSON data).
      // The worker re-reads it on the next render either way; without this
      // the browser is never told to ask for that render.
      const isServerContentFile =
        !isSourceFile && !isCssFile && isServerGraphFile(server, file);

      // Skip client components — Vite owns client-side HMR (Fast Refresh
      // when `@vitejs/plugin-react` is installed, plain reload otherwise).
      // Worker invalidation is for the server tree.
      const isClientFile = isSourceFile && isClientModuleFile(file);

      // A CSS module imported transitively by a "use client" component lives
      // in the CLIENT module graph (the browser fetches it directly and Vite
      // injects it as a <style>), so Vite's native CSS HMR already updates it
      // in place — no reload, no <link> cache-bust. Detect that case by the
      // presence of client-graph IMPORTERS and hand the update back to Vite
      // by returning undefined. Node presence alone is NOT the signal: a
      // server-only stylesheet rendered as <link href="/src/….css"> also gets
      // a client-graph node the moment the browser fetches that URL — but no
      // importers, so Vite's "native handling" for it is a full reload while
      // the RSC worker keeps the stale css-module proxy (old class-name
      // hashes) until a server restart. This is the dev:ssr counterpart to
      // the #96 fix in plugin.server.ts: that fix only takes effect on the
      // dev:rsc main thread; dev:ssr loads plugin.client.ts instead.
      const clientOwnedCss = isCssFile
        ? clientOwnedCssModules(ctx.modules, file)
        : [];
      if (isCssFile && clientOwnedCss.length > 0) {
        // Vite owns the visible update for the client-imported modules, but
        // the RSC worker still holds the css-module JS proxy — drop it so
        // the next server render agrees with the new class-name hashes.
        // Return ONLY the swappable modules: the link-fetch artifact nodes
        // riding along would dead-end propagation into a full reload.
        hmrHandler?.sendHmrUpdate(file);
        // Dual-graph: the SAME stylesheet may also be server-rendered as a
        // <link> (the <Css cssFiles={...}/> pattern), whose href doesn't
        // change on edit — without the cache-bust event that copy stays
        // stale. Cascade order can mask it (an edited declaration wins via
        // Vite's fresher <style>), but a DELETED rule survives in the stale
        // link. Send the tagged event so useRscHmr cache-busts matching
        // links, exactly as the non-client-owned css branch below does.
        server.ws.send({
          type: "custom",
          event: "vite-plugin-react-server:server-component-update",
          data: { file: normalizedFile, path: file, kind: "css" },
        });
        return clientOwnedCss as never[];
      }

      const isServerFile = (isSourceFile && !isClientFile) || isServerContentFile;
      const shouldInvalidateWorker = isServerFile || isCssFile;

      if (shouldInvalidateWorker && hmrHandler) {
        isProcessingHmr = true;

        // The document head may have changed with any server-tree edit (the
        // Html component is a server file); drop the dev-shell cache and let
        // the NEXT html request re-render it lazily. Superset of "the Html
        // module invalidated", chosen over module-graph tracking for stage 1.
        getDevShellHeadProvider(server)?.invalidate();

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
