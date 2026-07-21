/**
 * plugin.client.ts
 *
 * PURPOSE: Client-side static plugin for React Server Components
 *
 * This module:
 * 1. Handles static site generation in the client environment
 * 2. Uses RSC worker for RSC rendering and main-thread for HTML rendering
 * 3. Generates both RSC and HTML files for static pages
 * 4. Integrates with Vite's build process
 *
 * Feature parity with main react-static plugin, but in reverse. Uses rsc-worker to render rsc, and main thread for html.
 * This is not the default behavior, but is supported for testing and custom app development purposes.
 * Additionally, this can make it easier to use the --app flag to build all the modules + static generation at once.
 */

import {
  createLogger,
  type ResolvedConfig,
  type Manifest,
  type ConfigEnv,
} from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import type {
  BuildTiming,
  VitePluginFn,
  AutoDiscoveredFiles,
} from "../types.js";
// Vite 8 swaps Rollup→Rolldown; source bundle types from Vite's version-agnostic Rollup namespace.
import type { Rollup } from "vite";
type OutputBundle = Rollup.OutputBundle;
import { renderPagesBatched } from "./renderPagesBatched.js";
import { performance } from "node:perf_hooks";
import { renderPage } from "./renderPage.client.js";

import { createWorker } from "../worker/createWorker.js";
import {
  serializedOptions,
  serializeResolvedConfig,
} from "../helpers/serializeUserOptions.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";

import { handleError } from "../error/handleError.js";
import { shouldCausePanic } from "../error/panicThresholdHandler.js";
import { configurePreviewServer } from "./configurePreviewServer.js";
import { assertNonReactServer, REACT_CONDITION } from "../config/getCondition.js";
import { envPrefixFromConfig } from "../config/envPrefixFromConfig.js";
import { effectiveModuleBaseURL } from "../config/effectiveModuleBaseURL.js";
import { createWorkerStartupMetrics } from "../metrics/createWorkerStartupMetrics.js";
import { processCssFilesForPages } from "./processCssFilesForPages.js";
import { createBuildLoader } from "./createBuildLoader.client.js";
import { maybeInlineFlight } from "./maybeInlineFlight.js";
import { pruneUnclaimedEntryHtml } from "./pruneUnclaimedEntryHtml.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { toError } from "../error/toError.js";
import {
  addStaticManifest,
  manifests,
  getSharedManifestStore,
} from "../bundle/manifests.js";
import { deferStaticGeneration } from "../bundle/deferredStaticGeneration.js";
import type { Worker } from "node:worker_threads";
import { gracefulWorkerShutdown } from "../worker/gracefulShutdown.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { join } from "node:path";

import { baseURL } from "../utils/envUrls.js";
import { tryManifest } from "../helpers/tryManifest.js";
// cssCollector removed - using filesystem-based CSS processing

assertNonReactServer();

/**
 * plugin.client.ts
 *
 * PURPOSE: Client-side static plugin for React Server Components
 *
 * This module:
 * 1. Handles static site generation in the client environment
 * 2. Uses RSC worker for RSC rendering and main-thread for HTML rendering
 * 3. Generates both RSC and HTML files for static pages
 * 4. Integrates with Vite's build process
 *
 * @param options
 * @returns
 */
export const reactStaticPlugin: VitePluginFn = function _reactStaticPlugin(
  options
) {
  let logger: ReturnType<typeof createLogger>;
  let autoDiscoveredFiles: AutoDiscoveredFiles | null = null;
  let rscWorker: Worker | undefined = undefined;
  let resolvedConfig: ResolvedConfig | null = null;
  let serverManifest: Manifest | undefined = undefined;
  let staticBundle: OutputBundle | undefined = undefined;
  let serverBundle: OutputBundle | undefined = undefined;

  let configEnv: ConfigEnv | undefined;
  const timing: BuildTiming = {
    start: performance.now(),
    configResolved: 0,
    buildStart: 0,
    renderStart: 0,
  };

  const resolvedOptions = resolveOptions(options);
  if (resolvedOptions.type === "error") {
    throw resolvedOptions.error;
  }
  const userOptions = resolvedOptions.userOptions;

  return {
    name: "vite:plugin-react-server/client-static",
    enforce: "post",
    apply: "build", // Apply to build mode
    api: {
      meta: { timing },
    },
    async config(_config, viteConfigEnv) {
      configEnv = viteConfigEnv;
    },
    applyToEnvironment(partialEnvironment) {
      // Client static plugin should apply to static environment (browser/ESM builds)
      // This is where we want to bundle everything and filter out _virtual files
      // Apply to both "static" and "client" environments - we'll handle which one runs static generation in closeBundle
      const envName = partialEnvironment.name as "client" | "server" | "ssr" | "static";
      if (
        ["static", "client"].includes(envName)
      ) {
        return true;
      }
      return false;
    },

    async configResolved(config) {
      timing.configResolved = performance.now();
      logger = config.customLogger || createLogger();
      resolvedConfig = config;
      // Re-apply the base chain to THIS instance's copy: every sub-plugin
      // resolves its own userOptions at factory time, so the winner another
      // instance's config hook wrote back never reaches this object — and this
      // is the copy serialized into the rsc worker.
      userOptions.moduleBaseURL = effectiveModuleBaseURL(
        userOptions,
        config.base,
        envPrefixFromConfig(config)
      );

      // Perform auto-discovery to populate autoDiscoveredFiles
      const autoDiscoverResult = await resolveAutoDiscover({
        config: config,
        configEnv: configEnv || {
          mode: config.mode,
          command: config.command,
          isSsrBuild: false,
          isPreview: false,
        },
        userOptions,
        logger,
      });
      if (autoDiscoverResult.type === "error") {
        throw autoDiscoverResult.error;
      }
      autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;
      if(userOptions.verbose) {
        logger?.info(`Auto-discovery ${autoDiscoverResult.type === "success" ? "completed" : "skipped"}`);
      }
    },

    async buildStart() {
      timing.buildStart = performance.now();
      if(userOptions.verbose) {
        logger?.info("[react-static-client] Build started");
      }

      if (userOptions.onEvent && autoDiscoveredFiles) {
        try {
          userOptions.onEvent({
            type: "build.start",
            data: {
              pages: Array.from(autoDiscoveredFiles.urlMap.keys()),
              files: autoDiscoveredFiles,
            },
          });
        } catch (error) {
          const panicError = handleError({
            error,
            logger: logger,
            panicThreshold: userOptions.panicThreshold,
            context: "buildStart",
          });
          if (panicError != null) {
            rscWorker?.terminate();
          throw panicError;
          }
        }
      }
    },

    async renderStart() {
      timing.renderStart = performance.now();
      if(userOptions.verbose) { 
        logger?.info("[react-static-client] Render started");
      }
    },

    // the preview server helps to view the generated static folder, but only when the static plugin is enabled
    // if no build.pages, then the preview server will instead use default vite preview server
    // it works the same under both conditions
    async configurePreviewServer(server) {
      logger = server.config.customLogger || server.config.logger;
      configurePreviewServer({
        server,
        userOptions,
      });
    },



    async writeBundle(_options, bundle) {

      // Capture manifests from all environments
      try {
        if (!autoDiscoveredFiles?.urlMap) {
          return;
        }

        const bundleManifest = getBundleManifest<false>({
          bundle,
          normalizer: userOptions.normalizer,
        });

        // Store manifest based on environment
        if (this.environment.name === "static") {
          // Store in global manifest store for environment plugin access
          addStaticManifest(bundleManifest);

          staticBundle = bundle;
        } else if (this.environment.name === "client") {
          // Client build manifest (SSR modules) - stored globally now

          if (manifests.static) {
            const staticManifest = manifests.static;

            // Update bundle filenames to match static manifest
            for (const [, chunk] of Object.entries(bundle)) {
              if (chunk.type === "chunk" && chunk.fileName) {
                const normalized = userOptions.normalizer(chunk.fileName);
                let value = normalized[1];
                if (value.startsWith(userOptions.moduleBasePath)) {
                  value = value.slice(userOptions.moduleBasePath.length);
                }

                const entry = staticManifest[value];
                if (entry && entry.file !== chunk.fileName) {
                  // Update the filename to match static manifest
                  chunk.fileName = entry.file;
                }
              }
            }
          }
        } else if (this.environment.name === "server") {
          // Server build manifest (server components) - stored globally now
          serverBundle = bundle;
        }

        // Skip the static generation here - it will happen in closeBundle
        return;
      } catch (error) {
        const panicError = handleError({
          error,
          logger: logger,
          panicThreshold: userOptions.panicThreshold,
          context: "writeBundle",
        });
        if (panicError != null) {
          throw panicError;
        }
      }
    },

    async closeBundle() {
      const envName = this.environment.name;
      const isSsr = this.environment.config.build?.ssr === true;
      
      if (userOptions.verbose) {
        logger?.info(`[react-static-client] closeBundle called for environment: ${envName}, ssr: ${isSsr}`);
      }
      
      // Only run static generation in the non-SSR client environment (static builds)
      // Skip SSR client builds and server builds
      if (envName === "ssr" || envName === "server" || isSsr) {
        if (userOptions.verbose) {
          logger?.info(`[react-static-client] Skipping static generation for environment: ${envName} (ssr: ${isSsr})`);
        }
        return;
      }

      // Clean up _virtual files after build completes
      // These are Vite's internal virtual modules and aren't needed in the final output
      if (envName === "static" || (envName === "client" && !isSsr)) {
        try {
          const { rmSync, existsSync } = await import("node:fs");
          const { join, resolve } = await import("node:path");
          
          // Use the resolved output directory from the environment config
          const resolvedOutDir = this.environment.config.build?.outDir 
            ? resolve(this.environment.config.root || userOptions.projectRoot, this.environment.config.build.outDir)
            : resolve(userOptions.projectRoot, userOptions.build.outDir);
          
          // Clean up _virtual from client/static output directories only
          // Don't clean up server/_virtual since we need dynamic-import-helper.js there
          const outputDirs = [
            join(resolvedOutDir, userOptions.build.static || "static"),
            join(resolvedOutDir, userOptions.build.client || "client"),
          ];
          
          for (const outDir of outputDirs) {
            const virtualDir = join(outDir, "_virtual");
            if (existsSync(virtualDir)) {
              rmSync(virtualDir, { recursive: true, force: true });
              if (userOptions.verbose) {
                logger?.info(`[react-static-client] Cleaned up _virtual directory: ${virtualDir}`);
              }
            }
          }
        } catch (error) {
          // Non-critical - log but don't fail the build
          if (userOptions.verbose) {
            logger?.warn(`[react-static-client] Failed to clean up _virtual directory: ${error}`);
          }
        }
      }

      // This runs after all writeBundle hooks are complete
      // Run static generation in the non-SSR client environment (static builds)
      // This could be "static" or "client" depending on how environments are configured
      if (envName === "ssr" || envName === "server" || isSsr) {
        if (userOptions.verbose) {
          logger?.info(`[react-static-client] Skipping static generation - not in static environment (${envName}, ssr: ${isSsr})`);
        }
        return;
      }

      // Defer static generation to run after ALL environments complete their builds.
      // This is necessary because we need the server manifest (from server env's writeBundle)
      // to resolve function-based component paths like Root: (url) => 'src/CustomRoot.tsx'.
      // The buildApp hook in createEnvironmentPlugin will call runDeferredStaticGeneration().
      const closeBundleContext = this;
      deferStaticGeneration(async () => {

      try {
        // Re-check autoDiscoveredFiles - it might not be set if configResolved didn't run
        // or if it was cleared. Try to get it from stashed options if needed
        if (!autoDiscoveredFiles) {
          if (userOptions.verbose) {
            logger?.warn("[react-static-client] autoDiscoveredFiles not set, attempting to re-discover");
          }
          const { getStashedUserOptions, getEnvironmentId } = await import("../config/stashedOptionsState.js");
          const { getCondition } = await import("../config/getCondition.js");
          const envId = getEnvironmentId(getCondition(), resolvedConfig?.mode || "production");
          const stashedOptions = getStashedUserOptions(envId);
          if (stashedOptions && resolvedConfig) {
            // Try to re-run auto-discovery if we have the config
            const autoDiscoverResult = await resolveAutoDiscover({
              config: resolvedConfig,
              configEnv: configEnv || {
                mode: resolvedConfig.mode || "production",
                command: resolvedConfig.command || "build",
                isSsrBuild: false,
                isPreview: false,
              },
              userOptions,
              logger,
            });
            if (autoDiscoverResult.type === "success") {
              autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;
              if (userOptions.verbose) {
                logger?.info(`[react-static-client] Re-discovered ${autoDiscoveredFiles.urlMap.size} pages`);
              }
            } else {
              if (userOptions.verbose) {
                logger?.warn(`[react-static-client] Failed to re-discover pages: ${autoDiscoverResult.error}`);
              }
            }
          }
        }

        if (
          !autoDiscoveredFiles?.urlMap ||
          autoDiscoveredFiles?.urlMap.size === 0
        ) {
          if (userOptions.verbose) {
            logger?.warn(`[react-static-client] No pages to generate - urlMap is empty (size: ${autoDiscoveredFiles?.urlMap?.size || 0})`);
            logger?.warn(`[react-static-client] autoDiscoveredFiles exists: ${!!autoDiscoveredFiles}, urlMap exists: ${!!autoDiscoveredFiles?.urlMap}`);
          }
          return;
        }

        if (userOptions.verbose) {
          logger?.info(`[react-static-client] Starting static generation with ${autoDiscoveredFiles.urlMap.size} pages`);
        }

        // Check if we can access the shared manifest store
        try {
          if (userOptions.verbose) {
            logger?.info(`[react-static-client] Attempting to get server manifest from shared state`);
          }
          const sharedState = getSharedManifestStore(closeBundleContext);
          if (sharedState.server) {
            serverManifest = sharedState.server;
            if (userOptions.verbose) {
              logger?.info(`[react-static-client] Got server manifest from shared state`);
            }
          } else {
            throw new Error("No server manifest in shared state");
          }
        } catch (error) {
          if (userOptions.verbose) {
            logger?.info(`[react-static-client] Failed to get server manifest from shared state, trying filesystem: ${error}`);
          }
          const serverManifestPath = join(
            userOptions.build.outDir,
            userOptions.build.server
          );
          const manifestPath =
            (typeof resolvedConfig?.build.manifest === "string" 
              ? resolvedConfig.build.manifest 
              : ".vite/manifest.json");

          if (userOptions.verbose) {
            logger?.info(`[react-static-client] Loading server manifest from: ${join(serverManifestPath, manifestPath)}`);
          }

          const serverManifestResult = await tryManifest({
            root: userOptions.projectRoot,
            outDir: serverManifestPath,
            manifestPath: manifestPath,
            ssrManifest: false,
          });

          if (serverManifestResult.type === "error") {
            if (userOptions.verbose) {
              logger?.warn(`[react-static-client] Failed to load server manifest: ${serverManifestResult.error}`);
            }
            // Use empty manifest as fallback - static generation can proceed without it
            serverManifest = {};
            if (userOptions.verbose) {
              logger?.warn(`[react-static-client] Using empty server manifest as fallback`);
            }
          } else if (serverManifestResult.type === "skip") {
            if (userOptions.verbose) {
              logger?.warn(`[react-static-client] Server manifest not found, using empty manifest as fallback`);
            }
            // Use empty manifest as fallback - static generation can proceed without it
            serverManifest = {};
          } else {
            serverManifest = serverManifestResult.manifest;
            if (userOptions.verbose) {
              logger?.info(`[react-static-client] Loaded server manifest from filesystem`);
            }
          }
        }

        // Load static manifest from filesystem for CSS path mapping

        const staticManifestResult = await tryManifest({
          root: userOptions.projectRoot,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
          manifestPath: resolvedConfig?.build.manifest ?? ".vite/manifest.json",
          ssrManifest: false,
        });
        if (staticManifestResult.type === "error") {
          throw staticManifestResult.error;
        }
        const staticManifest = staticManifestResult.manifest;

        // Construct bootstrapModules like the server plugin does
        const indexHtml = staticManifest?.["index.html"]?.file;
        const serverPipeableStreamOptions = {
          ...userOptions.serverPipeableStreamOptions,
          bootstrapModules: [
            ...(indexHtml ? [baseURL(indexHtml)] : []),
            ...(userOptions.serverPipeableStreamOptions?.bootstrapModules ??
              []),
          ],
        };
        userOptions.serverPipeableStreamOptions = serverPipeableStreamOptions;
        const clientPipeableStreamOptions = {
          ...userOptions.clientPipeableStreamOptions,
          bootstrapModules: [
            ...(indexHtml ? [baseURL(indexHtml)] : []),
            ...(userOptions.clientPipeableStreamOptions?.bootstrapModules ??
              []),
          ],
        };
        // Create CSS props for each CSS file (same as server-static)
        const { cssFilesByPage, globalCss } = processCssFilesForPages({
          userOptions,
          autoDiscoveredFiles,
          serverManifest,
          staticManifest,
          bundle: staticBundle || {},
          logger,
        });

        if (userOptions.verbose) {
          for (const [route, cssMap] of cssFilesByPage.entries()) {
            logger.info(
              `[react-static-client] Route ${route}: ${cssMap.size} CSS files`
            );
            for (const [key, value] of cssMap.entries()) {
              logger.info(
                `[react-static-client]   CSS file: ${key} -> ${value.as} (${
                  value.children ? "inline" : "link"
                })`
              );
            }
          }
        }

        const routes = Array.from(
          autoDiscoveredFiles.urlMap.keys()
        ) as string[];

        // If no pages to generate, skip static generation
        if (routes.length === 0) {
          if (userOptions.verbose) {
            logger?.info(
              "[react-static-client] No pages to generate, skipping static generation"
            );
          }
          return;
        }

        // Use the static manifest to ensure consistent module IDs between RSC stream and client build
        // The static manifest contains the correct hashes that should be used for both builds
        // (staticManifest already loaded above)

        // Create a build loader for client mode (reuse server's sophisticated loader)
        if (userOptions.verbose) {
          logger?.info(`[react-static-client] Creating build loader`);
        }
        const buildLoader = createBuildLoader();
        if (userOptions.verbose) {
          logger?.info(`[react-static-client] Build loader created`);
        }

        // Create an RSC worker for generating RSC content
        if (userOptions.verbose) {
          logger?.info(
            `[react-static-client] Creating RSC worker with path: ${userOptions.rscWorkerPath}`
          );
        }

        const workerStartTime = performance.now();
        let rscWorkerResult;
        try {
          rscWorkerResult = await createWorker({
            projectRoot: userOptions.projectRoot,
            workerPath: userOptions.rscWorkerPath,
            currentCondition: REACT_CONDITION.client,
            reverseCondition: REACT_CONDITION.server,
            maxListeners: Math.max(routes.length * 3, 10), // Account for multiple listeners per route
            envPrefix: envPrefixFromConfig(resolvedConfig as any),
            logger: logger,
            verbose: userOptions.verbose,
            mode: getNodeEnv(),
            workerData: {
              userOptions: serializedOptions(userOptions, autoDiscoveredFiles),
              resolvedConfig: serializeResolvedConfig(resolvedConfig as any),
              configEnv: (() => {
                const fallback = resolvedConfig
                  ? {
                      command: resolvedConfig.command,
                      mode: resolvedConfig.mode,
                      isSsrBuild: false,
                      isPreview: false,
                    }
                  : undefined;
                const finalConfigEnv = configEnv || fallback;

                return finalConfigEnv;
              })(),
              serverManifest: serverManifest || {}, // Use server manifest for page component resolution
              bundle: staticBundle || {}, // Use static bundle (client build) for page component resolution
              staticBundle: staticBundle || {}, // Pass static bundle separately for path resolution

              id: "static-client-rsc-worker",
            },
          });
        } catch (workerError) {
          if (userOptions.verbose) {
            logger?.error(`[react-static-client] Error creating RSC worker: ${workerError}`);
          }
          throw workerError;
        }

        if (rscWorkerResult.type !== "success") {
          const err = rscWorkerResult.error ?? new Error(`Failed to create RSC worker`);
          if (userOptions.verbose) {
            logger?.error(
              `[react-static-client] RSC worker creation failed, throwing error`, { error: err }
            );
          }
          throw err;
        }

        rscWorker = rscWorkerResult.worker;
        if (userOptions.verbose) {
          logger?.info(`[react-static-client] RSC worker created successfully`);
        }

        // Emit worker startup metric after worker is created
        const workerStartupTime = performance.now() - workerStartTime;
        if (userOptions.onMetrics) {
          const workerStartupMetric = createWorkerStartupMetrics({
            route: "/", // Worker startup is global, not route-specific
            workerType: "rsc", // This is the RSC worker for client-side static generation
            startupTime: workerStartupTime,
            fromMainThread: true,
            fromRscWorker: false,
            fromHtmlWorker: false,
            description: `RSC worker startup for client-side static generation`,
          });
          userOptions.onMetrics(workerStartupMetric);
        }

        // Render pages using client-side renderer with RSC worker only
        const { onEvent, onMetrics, ...handlerOptions } = userOptions;

        if (userOptions.verbose) {
          logger?.info(`[react-static-client] Extracted onEvent: ${typeof onEvent}, userOptions.onEvent: ${typeof userOptions.onEvent}`);
        }

        // Capture server bundle from onEvent if not already captured
        if (!serverBundle && onEvent) {
          // Create a temporary event handler to capture the server bundle
          const originalOnEvent = onEvent;
          const tempOnEvent = (event: any) => {
            if (event.type === "build.writeBundle.server") {
              serverBundle = event.data.bundle;
              logger?.info(
                "[react-static-client] Captured server bundle from build event"
              );
            }
            // Call the original event handler
            originalOnEvent(event);
          };

          // Replace the onEvent temporarily to capture the server bundle
          userOptions.onEvent = tempOnEvent;
        }

        // Emit the static site generation start event
        // Use the extracted onEvent if available, otherwise fall back to userOptions.onEvent
        const eventHandler = onEvent || userOptions.onEvent;
        if (typeof eventHandler === "function") {
          try {
            if (userOptions.verbose) {
              logger?.info(`[react-static-client] Emitting build.ssg.start event`);
            }
            const r = eventHandler({
              type: "build.ssg.start",
              data: {
                pages: Array.from(autoDiscoveredFiles?.urlMap.keys() ?? []),
                options: null as any, // No specific rollup output options for static generation
                bundle: staticBundle || {},
              },
            });
            if (r != null && typeof r === "object" && "then" in r) {
              await (r as Promise<any>);
            }
          } catch (error) {
            const eventPanicError = handleError({
              error,
              logger: logger,
              panicThreshold: userOptions.panicThreshold,
              context: "onEvent(build.ssg.start)",
            });
            if (eventPanicError != null) {
              throw eventPanicError; // Re-throw to abort the build
            }
          }
        } else if (userOptions.verbose) {
          logger?.warn(`[react-static-client] No onEvent handler available to emit build.ssg.start`);
        }

        const renderPagesGenerator = renderPagesBatched(
          routes,
          {
            ...handlerOptions, // Use the clean options instead of the original handlerOptions
            worker: rscWorker, // Pass the RSC worker for RSC rendering only
            rscWorker: rscWorker, // Pass the RSC worker for RSC rendering only
            loader: buildLoader, // Use proper build loader instead of no-op
            logger: logger,
            autoDiscoveredFiles: autoDiscoveredFiles,
            cssFilesByPage: cssFilesByPage, // Pass CSS files by page
            serverPipeableStreamOptions: serverPipeableStreamOptions, // Pass server options to RSC worker
            clientPipeableStreamOptions: clientPipeableStreamOptions, // Pass client options to RSC worker
            globalCss: globalCss, // Pass global CSS
            manifest: serverManifest || {}, // Server manifest for RSC worker
            staticManifest: staticManifest, // Static manifest for consistent module IDs
            onEvent: onEvent,
            onMetrics: onMetrics, // Pass through the onMetrics callback (metric watcher)
          },
          renderPage
        );

        // Process the rendered pages
        let finalResult: any = undefined;
        try {
          for await (const result of renderPagesGenerator) {
            if (result.type === "error") {
              if (userOptions.verbose) {
                logger?.error(`[react-static-client] Render error: ${result.error}`);
              }
              throw result.error;
            }

          // Handle failed routes based on panic threshold
          if (
            result.type === "success" &&
            result.failedRoutes &&
            result.failedRoutes.size > 0
          ) {
            // Use centralized panic threshold logic (same as server plugin)
            const firstError = result.failedRoutes.values().next().value;
            if (
              firstError != null &&
              shouldCausePanic(firstError, {
                panicThreshold: userOptions.panicThreshold,
              })
            ) {
              // This should cause a panic, throw the error
              throw firstError;
            }
            // For other panic thresholds, log warnings but continue
            for (const [route, error] of result.failedRoutes) {
              const err = error instanceof Error ? error : toError(error);
              closeBundleContext.warn(
                new Error(
                  "Failed to render route: " +
                    route +
                    "\n" +
                    err.message +
                    "\n" +
                    err.stack,
                  { cause: err }
                )
              );
            }
          }

            finalResult = result;
          }
        } catch (renderError) {
          if (userOptions.verbose) {
            logger?.error(`[react-static-client] Error during renderPages: ${renderError}`);
          }
          throw renderError;
        }

        if (!finalResult) {
          const errorMsg = "No render result produced";
          if (userOptions.verbose) {
            logger?.error(`[react-static-client] ${errorMsg}`);
          }
          throw new Error(errorMsg);
        }

        if (userOptions.verbose) {
          logger?.info(`[react-static-client] Render completed: ${finalResult.completedRoutes.size} pages, ${finalResult.failedRoutes?.size || 0} failed`);
        }

        // File writes are handled by renderPages, no need to do them here

        // Calculate duration from timing
        const duration = Math.round(
          performance.now() - (timing.renderStart || timing.start)
        );

        // The watcher renders this (with rate + failures) for onMetrics
        // consumers; the raw line stays for consumers without a watcher.
        if (userOptions.onMetrics) {
          userOptions.onMetrics({
            route: "*",
            type: "ssg-render",
            pages: finalResult.completedRoutes.size,
            failed: finalResult.failedRoutes?.size ?? 0,
            renderTime: duration,
            description: "static render pass",
          });
        } else {
          closeBundleContext.info(
            `Rendered ${finalResult.completedRoutes.size} pages in ${duration}ms`
          );
        }

        if (process.env["NODE_ENV"] !== "production") {
          closeBundleContext.warn(
            `THIS BUILD IS NOT INTENDED FOR PRODUCTION (${process.env["NODE_ENV"]})`
          );
        }

        // Update timing
        timing.render =
          performance.now() - (timing.renderStart ?? timing.start);

        if (userOptions.verbose) {
          logger?.info("[react-static-client] Static generation completed");
        }

        // Keep build.pages authoritative: drop Vite's bare index.html template
        // when no page claims "/". Runs before the inline pass so nothing
        // downstream walks a shell SSG never wrote. The server-static plugin
        // runs the SAME call at the same point (both build modes identical).
        await pruneUnclaimedEntryHtml({
          build: userOptions.build,
          projectRoot: userOptions.projectRoot,
          pages: Array.from(autoDiscoveredFiles?.urlMap.keys() ?? []),
          logger,
          verbose: userOptions.verbose,
        });

        // Flash-free first render: inline each route's flight payload if
        // build.inlineFlight is enabled. The server-static plugin runs the
        // SAME call at the same post-write point, so the outcome is identical
        // in both build modes (runs before build.ssg.end so consumers see it).
        await maybeInlineFlight({
          build: userOptions.build,
          projectRoot: userOptions.projectRoot,
          onMetrics: userOptions.onMetrics,
          logger,
          verbose: userOptions.verbose,
        });

        // Emit the static site generation completion event once
        if (typeof userOptions.onEvent === "function") {
          try {
            const r = userOptions.onEvent({
              type: "build.ssg.end",
              data: {
                pages: Array.from(autoDiscoveredFiles?.urlMap.keys() ?? []),
                options: null as any, // No specific rollup output options for static generation
                bundle: staticBundle || {},
              },
            });
            if (r != null && typeof r === "object" && "then" in r) {
              await (r as Promise<any>);
            }
          } catch (error) {
            const eventPanicError = handleError({
              error,
              logger: logger,
              panicThreshold: userOptions.panicThreshold,
              context: "onEvent(build.ssg.end)",
            });
            if (eventPanicError != null) {
              throw eventPanicError; // Re-throw to abort the build
            }
          }
        }
      } catch (error) {
        const panicError = handleError({
          error,
          context: "react-static-client",
          logger,
          panicThreshold: userOptions.panicThreshold,
        });

        // Ensure graceful shutdown on error
        if (rscWorker) {
          const workerToCleanup = rscWorker;
          try {
            // Use graceful shutdown protocol even on error
            await Promise.race([
              new Promise<void>((resolve) => {
                const timeoutId = setTimeout(() => {
                  workerToCleanup.removeAllListeners();
                  workerToCleanup.terminate();
                  resolve();
                }, 1000); // 1 second timeout for graceful shutdown

                const messageHandler = (message: any) => {
                  if (message.type === "SHUTDOWN_COMPLETE") {
                    clearTimeout(timeoutId);
                    workerToCleanup.removeListener("message", messageHandler);
                    resolve();
                  }
                };
                workerToCleanup.on("message", messageHandler);
                workerToCleanup.postMessage({ type: "SHUTDOWN" });
              }),
            ]);
            rscWorker = undefined;
          } catch (cleanupError) {
            logger.warn(`Failed to cleanup worker on error: ${cleanupError}`);
            // Force terminate if graceful shutdown fails
            try {
              workerToCleanup.removeAllListeners();
              workerToCleanup.terminate();
            } catch (terminateError) {
              // Ignore termination errors
            }
            rscWorker = undefined;
          }
        }

        if (panicError != null) {
          // Ensure we have a proper Error object that can have properties set on it
          const errorToThrow =
            panicError instanceof Error
              ? panicError
              : new Error(String(panicError));

          // Create a new Error object to avoid the "code" property issue
          const finalError = new Error(errorToThrow.message);
          finalError.stack = errorToThrow.stack;
          finalError.cause = errorToThrow.cause;

          // Copy any additional properties that might be needed
          if (errorToThrow.name) finalError.name = errorToThrow.name;

        throw finalError;
        }
      } finally {
        // Graceful worker shutdown — runs on both success and error paths.
        if (rscWorker) {
          await gracefulWorkerShutdown(rscWorker, {
            timeoutMs: userOptions.workerShutdownTimeout,
            // Await full worker exit before the build's promise resolves: libuv
            // handles still pending in the worker (file reads/writes) can
            // otherwise fire AFTER doBuild restores cwd, producing post-teardown
            // ENOENT errors against relative paths. See bd-6pi.
            awaitTerminate: true,
          });
          rscWorker = undefined;
        }

        // Reset any cached state to prevent issues in subsequent builds
        autoDiscoveredFiles = null;
        serverManifest = undefined;
      }

      }); // end deferStaticGeneration
    },
  };
};
