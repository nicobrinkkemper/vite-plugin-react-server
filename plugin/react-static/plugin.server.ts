/**
 * plugin.ts
 *
 * PURPOSE: Main Vite plugin for React Server Components (RSC) static site generation
 *
 * This module:
 * 1. Orchestrates the entire static site generation process
 * 2. Manages the lifecycle of the RSC rendering process
 * 3. Handles file writing for both initial page loads and client-side navigation
 *    - Writes .html files for initial page loads (complete HTML document)
 *    - Writes .rsc files for client-side navigation (RSC content only)
 * 4. Provides hooks for Vite to integrate with the build process
 * 5. Manages worker threads for parallel rendering
 * 6. Handles error reporting and metrics collection
 */

import type { Worker } from "node:worker_threads";
import {
  type ConfigEnv,
  type Logger,
  type Manifest,
  type ManifestChunk,
  type ResolvedConfig,
  createLogger,
} from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import { createBuildLoader } from "./createBuildLoader.server.js";
import type {
  BuildTiming,
  RenderPagesResult,
  AutoDiscoveredFiles,
  VitePluginFn,
} from "../types.js";
import { renderPagesBatched } from "./renderPagesBatched.js";
import { renderPages as renderPagesSequential } from "./renderPages.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import { createWorker } from "../worker/createWorker.js";
import {
  serializedOptions,
  serializeResolvedConfig,
} from "../helpers/serializeUserOptions.js";
import { performance } from "node:perf_hooks";
import { baseURL } from "../utils/envUrls.node.js";
import { handleError } from "../error/handleError.js";
import { shouldCausePanic } from "../error/panicThresholdHandler.js";
import { renderPage } from "./renderPage.server.js";
import { maybeInlineFlight } from "./maybeInlineFlight.js";
import { temporaryReferences } from "./temporaryReferences.server.js";
import { configurePreviewServer } from "./configurePreviewServer.js";
import { envPrefixFromConfig } from "../config/envPrefixFromConfig.js";

import { processCssFilesForPages } from "./processCssFilesForPages.js";
import { createWorkerStartupMetrics } from "../metrics/createWorkerStartupMetrics.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { join } from "node:path";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { assertReactServer } from "../config/getCondition.js";
import { toError } from "../error/toError.js";

assertReactServer();

/**
 * Main entrypoint for the static plugin.
 *
 * This plugin is responsible for:
 * 1. Orchestrating the static site generation process
 * 2. Handling the lifecycle of the RSC rendering process (main thread)
 * 3. Writing .html files for initial page loads (complete HTML document)
 * 4. Writing .rsc files for client-side navigation (RSC content only)
 * 5. Managing worker threads for parallel rendering (html worker)
 * 6. Handling error reporting and metrics collection
 */
// Global worker instance to prevent duplicate creation across plugin instances
let globalWorker: Worker | undefined;

export const reactStaticPlugin: VitePluginFn = function _reactStaticPlugin(
  options
) {
  let worker: Worker | undefined;
  let logger: Logger;
  let resolvedConfig: ResolvedConfig;
  let autoDiscoveredFiles: AutoDiscoveredFiles | null = null;
  let serverManifest: Manifest | undefined = undefined;
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
    name: "vite:plugin-react-server/server-static",
    enforce: "post",
    api: {
      meta: { timing },
    },
    async config(_config, viteConfigEnv) {
      configEnv = viteConfigEnv;
    },
    applyToEnvironment(partialEnvironment) {

      if (
        ["server"].includes(
          partialEnvironment.name as "client" | "server" | "ssr"
        )
      ) {
        return true;
      }
      return false;
    },
    async configResolved(config) {
      resolvedConfig = config;
      if (!logger) {
        logger = config.customLogger ?? createLogger();
      }
      const autoDiscoverResult = await resolveAutoDiscover({
        config: config,
        configEnv: configEnv!,
        userOptions,
        logger,
      });
      if (autoDiscoverResult.type === "error") {
        throw autoDiscoverResult.error;
      }
      autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;
    },
    async buildStart() {
      if (!logger) {
        logger = this.environment.logger;
      }
      timing.buildStart = performance.now();
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
            worker?.terminate();
            throw panicError;
          } else {
            this.error(new Error("Failed to emit build.start event"));
          }
        }
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

    async renderStart() {
      timing.renderStart = performance.now();
    },
    generateBundle(_options, bundle) {
      // Filter out unnecessary _virtual files from the bundle
      // Keep dynamic-import-helper.js since it's needed for dynamic imports
      // Note: Static builds are handled by plugin.client.ts, this only handles server builds
      if (this.environment.name === "server") {
        const keysToDelete: string[] = [];
        for (const [key, chunk] of Object.entries(bundle)) {
          if (chunk.type === "chunk") {
            // Check fileName, key, moduleIds, and facadeModuleId for _virtual
            const isVirtual = 
              chunk.fileName?.includes("_virtual") ||
              key.includes("_virtual") ||
              chunk.facadeModuleId?.includes("_virtual") ||
              chunk.moduleIds?.some(id => id.includes("_virtual"));
            
            // Keep dynamic-import-helper.js - it's needed for dynamic imports
            const isDynamicImportHelper = 
              chunk.fileName?.includes("dynamic-import-helper") ||
              key.includes("dynamic-import-helper");
            
            if (isVirtual && !isDynamicImportHelper) {
              keysToDelete.push(key);
              if (userOptions.verbose) {
                logger?.info(`[plugin.server] Filtered out virtual file: ${chunk.fileName || key} (moduleId: ${chunk.facadeModuleId || chunk.moduleIds?.[0]})`);
              }
            }
          }
        }
        // Delete after iteration to avoid modifying while iterating
        for (const key of keysToDelete) {
          delete bundle[key];
        }
      }
    },

    async writeBundle(_options, bundle) {
      // Only execute static generation for the server environment
      if (this.environment.name !== "server") {
        if (userOptions.verbose) {
          logger?.info(`[plugin.server] Skipping static generation for environment: ${this.environment.name}`);
        }
        return;
      }
      
      let panicError: Error | null = null;
      let bundleManifest:
        | {
            [key: string]: ManifestChunk & {
              source: string;
            };
          }
        | undefined = undefined;
      if (!logger) {
        logger = this.environment.logger;
      }

      // handle the bundle manifest
      try {
        bundleManifest = getBundleManifest<false>({
          bundle,
          normalizer: userOptions.normalizer,
        });

        // make sure that we have a manifest
        const manifestPath =
          typeof resolvedConfig.build.manifest === "string"
            ? resolvedConfig.build.manifest
            : ".vite/manifest.json";
        if (
          !bundleManifest[manifestPath] ||
          !("source" in bundleManifest[manifestPath])
        ) {
          throw new Error("Server manifest not found");
        }

        // parse the manifest
        serverManifest = JSON.parse(
          bundleManifest[manifestPath].source as string
        );

        // make sure that we have a manifest
        if (!serverManifest) {
          throw new Error("Failed to parse server manifest");
        }
      } catch (error) {
        const panicError = handleError({
          error,
          logger: logger,
          panicThreshold: userOptions.panicThreshold,
          context: "writeBundle(bundleManifest)",
        });
        if (panicError != null) {
          throw panicError;
        } else {
          throw new Error("Failed to get bundle manifest");
        }
      }

      try {
        const staticManifestResult = await tryManifest({
          root: userOptions.projectRoot,
          outDir: join(userOptions.build.outDir, userOptions.build.static),
          manifestPath: resolvedConfig.build.manifest,
          ssrManifest: false,
        });
        if (staticManifestResult.type === "error") {
          throw staticManifestResult.error;
        }
        const staticManifest = staticManifestResult.manifest;
        
        // Don't create helper file - let resolveVirtualAndNodeModules shim handle it
        // Same approach as client environment - no special file needed
        
        const buildLoader = createBuildLoader(
          {
            userOptions: userOptions,
            serverManifest: serverManifest ?? {},
            staticManifest: staticManifest,
          },
          bundle,
          temporaryReferences,
          logger
        );
        // Create CSS props for each CSS file
        const { cssFilesByPage, globalCss } = processCssFilesForPages({
          userOptions,
          autoDiscoveredFiles,
          serverManifest,
          staticManifest,
          bundle,
          logger,
        });

        if (userOptions.verbose) {
          logger.info(
            `[plugin.server] cssFilesByPage size: ${cssFilesByPage.size}`
          );
          for (const [route, cssMap] of cssFilesByPage.entries()) {
            logger.info(
              `[plugin.server] Route ${route}: ${cssMap.size} CSS files`
            );
            
          }
        }

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
        // Get routes for worker configuration
        const routes = !autoDiscoveredFiles
          ? []
          : Array.from(autoDiscoveredFiles!.urlMap.keys());

        // If no pages to generate, skip static generation entirely (including worker creation)
        if (routes.length === 0) {
          logger?.info(
            "[plugin.server] No pages to generate, skipping static generation"
          );
          return;
        }

        const serializedUserOptions = serializedOptions(
          userOptions,
          autoDiscoveredFiles!
        );
        // Create HTML worker for HTML generation
        // IMPORTANT: We create a new worker for each page render to ensure completely clean state
        // This prevents race conditions where worker state persists between renders
        // Guard against duplicate worker creation if plugin is instantiated multiple times
        if (globalWorker) {
          logger?.warn("[plugin.server] Global worker already exists, reusing existing worker");
          worker = globalWorker;
        } else {
          const workerStartTime = performance.now();
          const viteEnvPrefix = envPrefixFromConfig(resolvedConfig);
          const routeCount = autoDiscoveredFiles?.urlMap.size ?? 0;
          const maxListeners = routeCount + 1;
          const workerResult = await createWorker({
            projectRoot: userOptions.projectRoot,
            workerPath: userOptions.htmlWorkerPath,
            currentCondition: "react-server",
            reverseCondition: "react-client", // HTML worker needs react-client for react-dom/server
            maxListeners: maxListeners,
            envPrefix: viteEnvPrefix,
            logger: logger,
            workerData: {
              resolvedConfig: serializeResolvedConfig(resolvedConfig),
              userOptions: serializedUserOptions,
              configEnv,
            },
          });
          if (workerResult.type === "error") {
            if (workerResult.error != null) {
              throw workerResult.error;
            }
            throw new Error("React static plugin failed to create worker");
          } else if (workerResult.type === "skip") {
            logger.info("Worker not created, skipping static build");
            return;
          } else {
            worker = workerResult.worker;
            // Emit worker startup metric after worker is created
            const workerStartupTime = performance.now() - workerStartTime;
            if (userOptions.onMetrics) {
              const workerStartupMetric = createWorkerStartupMetrics({
                route: "/", // Worker startup is global, not route-specific
                workerType: "html", // This is the HTML worker for server-side static generation
                startupTime: workerStartupTime,
                fromMainThread: true,
                fromRscWorker: false,
                fromHtmlWorker: false,
                description: `HTML worker startup for server-side static generation`,
              });
              // Only emit metrics from the server environment to prevent duplicates
              if (this.environment.name === "server") {
                userOptions.onMetrics(workerStartupMetric);
              }
            }
            // Store the worker globally to prevent duplicate creation
            globalWorker = worker;
          }
        }

        // No RSC worker needed for static generation - main thread runs with react-server conditions
        // Render pages - component resolution now happens per-route in renderPage
        const { onEvent, ...handlerOptions } = userOptions;

        // Emit the static site generation start event
        if (typeof userOptions.onEvent === "function") {
          try {
            const r = userOptions.onEvent({
              type: "build.ssg.start",
              data: {
                pages: Array.from(autoDiscoveredFiles?.urlMap.keys() ?? []),
                options: null as any, // No specific rollup output options for static generation
                bundle: bundle,
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
            } else {
              throw new Error("Failed to emit build.ssg.start event");
            }
          }
        }

        // Select render mode based on build config
        const renderMode = userOptions.build?.renderMode ?? "parallel";
        const renderPages = renderMode === "sequential" ? renderPagesSequential : renderPagesBatched;

        if (userOptions.verbose) {
          logger.info(`[static] Using ${renderMode} rendering${renderMode === "parallel" ? ` (batch size: ${userOptions.build?.batchSize ?? 8})` : ""}`);
        }

        // this will render the routes
        const renderPagesGenerator = renderPages(
          routes,
          {
            ...handlerOptions,
            loader: buildLoader,
            worker: worker,
            htmlWorker: worker, // Pass the HTML worker for HTML generation
            logger: logger,
            // Pass global CSS to downstream renderer
            globalCss,
            // Pass abort signal to cancel operations when errors occur
            signal: AbortSignal.timeout(handlerOptions.htmlTimeout),
            onEvent: onEvent,
            serverPipeableStreamOptions: serverPipeableStreamOptions,
            clientPipeableStreamOptions: clientPipeableStreamOptions,
            manifest: serverManifest ?? {},
            staticManifest: staticManifest, // Pass static manifest for path resolution
            autoDiscoveredFiles: autoDiscoveredFiles!,
            cssFilesByPage: cssFilesByPage,
            batchSize: userOptions.build?.batchSize,
          },
          renderPage
        );

        // Process render results
        let finalResult: RenderPagesResult | undefined;
        try {
          for await (const result of renderPagesGenerator) {
            // Handle error results immediately
            if (result.type === "error") {
              throw result.error;
            }

            // Handle failed routes based on panic threshold
            if (
              result.type === "success" &&
              result.failedRoutes &&
              result.failedRoutes.size > 0
            ) {
              // Use centralized panic threshold logic
              const firstError = result.failedRoutes.values().next().value;
              if (firstError != null && shouldCausePanic(firstError, { panicThreshold: userOptions.panicThreshold })) {
                // This should cause a panic, throw the error
                throw firstError;
              }
              // For non-panic errors, log warnings but continue
              for (const [route, error] of result.failedRoutes) {
                const err = error instanceof Error ? error : toError(error);
                this.warn(
                  new Error("Failed to render route: " + route + "\n" + err.message + "\n" + err.stack, { cause: err })
                );
              }
            }

            finalResult = result;
          }
        } catch (renderError) {
          // Handle render errors with panic threshold logic
          const renderPanicError = handleError({
            error: renderError,
            logger: logger,
            panicThreshold: userOptions.panicThreshold,
            context: "renderPages",
          });
          if (renderPanicError != null) {
            throw renderPanicError;
          }
          throw renderError;
        }

        if (!finalResult) {
          throw new Error("No render result produced");
        }
        // Calculate duration from timing
        const duration = Math.round(
          performance.now() - (timing.renderStart || timing.start)
        );

        this.info(
          `Rendered ${finalResult.completedRoutes.size} pages in ${duration}ms`
        );

        // Flash-free first render: inline each route's flight payload if
        // build.inlineFlight is enabled. The client-static plugin runs the
        // SAME call at the same post-write point, so the outcome is identical
        // in both build modes (runs before build.ssg.end so consumers see it).
        await maybeInlineFlight({
          build: userOptions.build,
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
                bundle: bundle,
              },
            });
            if (r != null && typeof r === "object" && "then" in r) {
              await (r as Promise<any>);
            }
          } catch (error) {
            if (error != null) {
              throw error; // Re-throw to abort the build
            } else {
              throw new Error("Failed to emit build.ssg.end event");
            }
          }
        }

        if (process.env["NODE_ENV"] !== "production") {
          this.warn(
            `THIS BUILD IS NOT INTENDED FOR PRODUCTION (${process.env["NODE_ENV"]})`
          );
        }

        // Update timing
        timing.render =
          performance.now() - (timing.renderStart ?? timing.start);
      } catch (error) {
        panicError = handleError({
          error,
          logger: logger,
          panicThreshold: userOptions.panicThreshold,
          context: "writeBundle",
        });

        // Let the finally block handle additional cleanup
      } finally {
        // Reset any cached state to prevent issues in subsequent builds
        autoDiscoveredFiles = null;
        serverManifest = undefined;
        
        // Clean up worker if it exists
        if (worker) {
          try {
            worker.removeAllListeners();
            // Await full worker exit before this writeBundle hook returns.
            // Without await, libuv-level handles in the worker (file
            // reads/writes pending at exit) can fire AFTER the build's
            // promise has resolved and the caller has restored cwd —
            // producing post-teardown ENOENT errors against relative paths
            // the worker started while cwd was the test fixture root.
            await worker.terminate();
          } catch (terminateError) {
            // Ignore termination errors
          }
          worker = undefined;
          // Reset global worker since it's been terminated
          globalWorker = undefined;
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
    },

    async closeBundle() {
      // Clean up _virtual files after build completes
      // These are Vite's internal virtual modules and aren't needed in the final output
      if (this.environment.name === "server") {
        try {
          const { existsSync } = await import("node:fs");
          const { join, resolve } = await import("node:path");
          
          // Use the resolved output directory from the environment config
          const resolvedOutDir = this.environment.config.build?.outDir 
            ? resolve(this.environment.config.root || userOptions.projectRoot, this.environment.config.build.outDir)
            : resolve(userOptions.projectRoot, userOptions.build.outDir);
          
          // Don't clean up server/_virtual - we need dynamic-import-helper.js for runtime
          // Only clean up static/_virtual if it exists (shouldn't, but just in case)
          const staticOutDir = join(resolvedOutDir, userOptions.build.static || "static");
          const staticVirtualDir = join(staticOutDir, "_virtual");
          if (existsSync(staticVirtualDir)) {
            const { rmSync } = await import("node:fs");
            rmSync(staticVirtualDir, { recursive: true, force: true });
            if (userOptions.verbose) {
              logger?.info(`[plugin.server] Cleaned up _virtual directory: ${staticVirtualDir}`);
            }
          }
        } catch (error) {
          // Non-critical - log but don't fail the build
          if (userOptions.verbose) {
            logger?.warn(`[plugin.server] Failed to clean up _virtual directory: ${error}`);
          }
        }
      }

      // Graceful worker shutdown - only at the end of the entire build process
      if (worker) {
        try {
          await Promise.race([
            new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error("Worker shutdown timeout"));
              }, userOptions.workerShutdownTimeout);

              const backupTimeout = setTimeout(() => {
                reject(new Error("Worker shutdown backup timeout"));
              }, Math.floor(userOptions.workerShutdownTimeout * 0.6)); // 60% of main timeout

              const messageHandler = (message: any) => {
                if (message.type === "SHUTDOWN_COMPLETE") {
                  if (userOptions.verbose) {
                    logger.info("Worker shutdown complete");
                  }
                  clearTimeout(timeout);
                  clearTimeout(backupTimeout);
                  worker?.removeListener("message", messageHandler);
                  // Remove all other event listeners as well
                  worker?.removeAllListeners();
                  resolve();
                } else if (message.type === "CLEANUP_COMPLETE") {
                  // Handle cleanup complete messages during shutdown - this is normal
                  if (userOptions.verbose) {
                    logger.info("Worker cleanup completed during shutdown");
                  }
                  // Don't resolve here - wait for SHUTDOWN_COMPLETE
                } else {
                  if (userOptions.verbose) {
                    logger.info(
                      "Worker is still busy, received message " + message?.type
                    );
                  }
                }
              };

              worker?.on("message", messageHandler);

              // Send shutdown message
              worker?.postMessage({
                type: "SHUTDOWN",
                id: "*",
              });
            }),
          ]);
        } catch (error) {
          // If shutdown protocol fails, force terminate
          this.warn(
            "Worker shutdown protocol failed, forcing termination: " +
              (error instanceof Error ? error.message : String(error))
          );
          // Don't try to clean up listeners in error case - just force terminate
        } finally {
          // Always force cleanup and termination
          if (worker) {
            try {
              worker.removeAllListeners();
              worker.terminate();
            } catch (terminateError) {
              // Ignore termination errors
            }
            worker = undefined;
            // Reset global worker since it's been terminated
            globalWorker = undefined;
          }
        }
      }
    },
  } as const;
};
