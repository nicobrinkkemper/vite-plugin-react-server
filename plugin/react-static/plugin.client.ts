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

import { createLogger, type ResolvedConfig, type Manifest, type ConfigEnv } from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import type { BuildTiming, VitePluginFn, AutoDiscoveredFiles } from "../types.js";
import type { OutputBundle } from "rollup";
import { renderPages } from "./renderPages.js";
import { performance } from "node:perf_hooks";
import { renderPage } from "./renderPage.client.js";

import { createWorker } from "../worker/createWorker.js";
import {
  serializedOptions,
  serializeResolvedConfig,
} from "../helpers/serializeUserOptions.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";

import { handleError } from "../error/handleError.js";
import { configurePreviewServer } from "./configurePreviewServer.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { envPrefixFromConfig } from "../config/envPrefixFromConfig.js";
import { createWorkerStartupMetrics } from "../metrics/createWorkerStartupMetrics.js";
import { processCssFilesForPages } from "./processCssFilesForPages.js";
import { createBuildLoader } from "./createBuildLoader.client.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import { toError } from "../error/toError.js";
import { addStaticManifest, manifests } from "../bundle/manifests.js";
import type { Worker } from "node:worker_threads";
import { resolveAutoDiscover } from "../config/index.js";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { baseURL } from "../utils/envUrls.node.js";
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

  let clientComponentMessageHandler: ((message: any) => void) | undefined;
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
      timing.configResolved = performance.now();
      logger = config.customLogger || createLogger();
      resolvedConfig = config;

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
      logger?.info("[react-static-client] Auto-discovery completed");
    },

    async buildStart() {
      timing.buildStart = performance.now();
      logger?.info("[react-static-client] Build started");

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
            this.error(panicError);
            throw panicError;
          }
        }
      }
    },

    async renderStart() {
      timing.renderStart = performance.now();
      logger?.info("[react-static-client] Render started");
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
          logger?.warn(
            "[react-static-client] No pages found for static generation"
          );
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
          logger?.info(
            `[react-static-client] Stored static manifest with ${Object.keys(bundleManifest).length} entries`
          );
          staticBundle = bundle;
          // Collect CSS from static build
          // cssCollector removed - using filesystem-based CSS processing
          logger?.info(
            "[react-static-client] Captured static manifest and CSS"
          );
        } else if (this.environment.name === "client") {
          // Client build manifest (SSR modules) - stored globally now
          
          // Update client build filenames to match static manifest
          logger?.info(
            `[react-static-client] Client build: static manifest available: ${manifests.static ? 'yes' : 'no'}`
          );
          if (manifests.static) {
            const staticManifest = manifests.static;
            
            // Update bundle filenames to match static manifest
            for (const [key, chunk] of Object.entries(bundle)) {
              if (chunk.type === 'chunk' && chunk.fileName) {
                const normalized = userOptions.normalizer(chunk.fileName);
                let value = normalized[1];
                if (value.startsWith(userOptions.moduleBasePath)) {
                  value = value.slice(userOptions.moduleBasePath.length);
                }
                
                const entry = staticManifest[value];
                if (entry && entry.file !== chunk.fileName) {
                  // Update the filename to match static manifest
                  chunk.fileName = entry.file;
                  logger?.info(
                    `[react-static-client] Updated client filename: ${key} -> ${entry.file}`
                  );
                }
              }
            }
          }
          
          // Collect CSS from client build
          // cssCollector removed - using filesystem-based CSS processing
          logger?.info(
            "[react-static-client] Captured client manifest and CSS"
          );
        } else if (this.environment.name === "server") {
          // Server build manifest (server components) - stored globally now
          serverBundle = bundle;
          // Collect CSS from server build
          // cssCollector removed - using filesystem-based CSS processing
          logger?.info(
            "[react-static-client] Captured server manifest and CSS"
          );
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
          this.error(panicError);
          throw panicError;
        }
      }
    },

    async closeBundle() {
      // This runs after all writeBundle hooks are complete
      // Now we can do static generation with access to both client and server builds
      try {
        if (!autoDiscoveredFiles?.urlMap || autoDiscoveredFiles?.urlMap.size === 0) {
          logger?.warn(
            "[react-static-client] No pages found for static generation"
          );
          return;
        }


        const manifestPath = typeof resolvedConfig?.build?.manifest === "string" 
          ? resolvedConfig.build.manifest 
          : ".vite/manifest.json";
        const serverManifestPath = join(
          userOptions.projectRoot,
          userOptions.build.outDir,
          userOptions.build.server,
          manifestPath
        );
        if (!existsSync(serverManifestPath)) {
          logger?.warn(
            "[react-static-client] Server build not found, skipping static generation"
          );
          return;
        }

        serverManifest = JSON.parse(readFileSync(serverManifestPath, "utf-8"));
        logger?.info(
          "[react-static-client] Loaded server manifest for static generation"
        );

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
          bootstrapScripts: [
            ...(indexHtml ? [baseURL(indexHtml)] : []),
            ...(userOptions.clientPipeableStreamOptions?.bootstrapScripts ?? []),
          ],
        }
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
          logger.info(
            `[react-static-client] cssFilesByPage size: ${cssFilesByPage.size}`
          );
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
        logger?.info(
          `[react-static-client] Generating ${routes.length} static pages`
        );

        // If no pages to generate, skip static generation
        if (routes.length === 0) {
          logger?.info("[react-static-client] No pages to generate, skipping static generation");
          return;
        }

        // Use the static manifest to ensure consistent module IDs between RSC stream and client build
        // The static manifest contains the correct hashes that should be used for both builds
        // (staticManifest already loaded above)

        // Create a simple no-op loader for client mode (RSC worker handles module loading)
        const buildLoader = createBuildLoader();

        // Create an RSC worker for generating RSC content
        logger?.info(
          `[react-static-client] Creating RSC worker with path: ${userOptions.rscWorkerPath}`
        );

        const workerStartTime = performance.now();
        const rscWorkerResult = await createWorker({
          projectRoot: userOptions.projectRoot,
          workerPath: userOptions.rscWorkerPath,
          currentCondition: "react-client",
          reverseCondition: "react-server",
          maxListeners: Math.max(routes.length * 3, 10), // Account for multiple listeners per route
          envPrefix: envPrefixFromConfig(resolvedConfig as any),
          logger: logger,
          verbose: userOptions.verbose,
          mode: getNodeEnv(),
          workerData: {
            userOptions: serializedOptions(userOptions, autoDiscoveredFiles),
            resolvedConfig: serializeResolvedConfig(resolvedConfig as any),
            configEnv: (() => {
              const fallback = resolvedConfig ? {
                command: resolvedConfig.command,
                mode: resolvedConfig.mode,
                isSsrBuild: false,
                isPreview: false,
              } : undefined;
              const finalConfigEnv = configEnv || fallback;
              console.log(`[react-static-client] Worker configEnv - original:`, configEnv, `fallback:`, fallback, `resolvedConfig:`, resolvedConfig ? 'available' : 'null', `final:`, finalConfigEnv);
              console.log(`[react-static-client] Environment info - NODE_ENV:`, process.env.NODE_ENV, `MODE:`, process.env['MODE'], `VITE_MODE:`, process.env['VITE_MODE']);
              console.log(`[react-static-client] Config env info - command:`, resolvedConfig?.command, `mode:`, resolvedConfig?.mode);
              return finalConfigEnv;
            })(),
            serverManifest: staticManifest || {}, // Use static manifest for client-side path resolution
            bundle: staticBundle || serverBundle || {}, // Use static bundle for client-side path resolution, server bundle as fallback
            staticBundle: staticBundle || {}, // Pass static bundle separately for path resolution
            id: "static-client-rsc-worker",
          },
        });

        if (rscWorkerResult.type !== "success") {
          const errorMessage = toError(rscWorkerResult.error).message;
          logger?.error(
            `[react-static-client] RSC worker creation failed: ${errorMessage}`
          );
          throw new Error(`Failed to create RSC worker: ${errorMessage}`);
        }

        rscWorker = rscWorkerResult.worker;

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
        if (typeof userOptions.onEvent === "function") {
          try {
            const r = userOptions.onEvent({
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
              this.error(eventPanicError);
              throw eventPanicError; // Re-throw to abort the build
            }
          }
        }

        const renderPagesGenerator = renderPages(
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
        for await (const result of renderPagesGenerator) {
          if (result.type === "error") {
            throw result.error;
          }

          // Handle failed routes based on panic threshold
          if (
            result.type === "success" &&
            result.failedRoutes &&
            result.failedRoutes.size > 0
          ) {
            if (userOptions.panicThreshold === "all_errors") {
              // For "all_errors", throw on any failed route
              const firstError = result.failedRoutes.values().next().value;
              if (firstError != null) {
                throw firstError;
              }
              throw new Error("Failed to render pages");
            }
            // For other panic thresholds, log warnings but continue
            for (const [route, error] of result.failedRoutes) {
              this.warn(
                new Error("Failed to render route: " + route, { cause: error })
              );
            }
          }

          finalResult = result;
        }

        if (!finalResult) {
          throw new Error("No render result produced");
        }

        // File writes are handled by renderPages, no need to do them here

        // Calculate duration from timing
        const duration = Math.round(
          performance.now() - (timing.renderStart || timing.start)
        );

        this.info(
          `Rendered ${finalResult.completedRoutes.size} pages in ${duration}ms`
        );

        if (process.env["NODE_ENV"] !== "production") {
          this.warn(
            `THIS BUILD IS NOT INTENDED FOR PRODUCTION (${process.env["NODE_ENV"]})`
          );
        }

        // Update timing
        timing.render =
          performance.now() - (timing.renderStart ?? timing.start);

        logger?.info("[react-static-client] Static generation completed");

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
              this.error(eventPanicError);
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

        // Ensure immediate cleanup on error
        if (rscWorker) {
          try {
            // Remove specific listeners first
            if (typeof clientComponentMessageHandler === "function") {
              rscWorker.removeListener(
                "message",
                clientComponentMessageHandler
              );
            }
            // Force immediate termination on error to prevent resource leaks
            rscWorker.removeAllListeners();
            rscWorker.terminate();
            rscWorker = undefined;
          } catch (cleanupError) {
            logger.warn(`Failed to cleanup worker on error: ${cleanupError}`);
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

          this.error(finalError);
          throw finalError;
        }

        // Graceful worker shutdown - only at the end of the entire build process
        if (rscWorker) {
          try {
            await Promise.race([
              new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                  reject(new Error("Worker shutdown timeout"));
                }, userOptions.workerShutdownTimeout);

                const backupTimeout = setTimeout(() => {
                  reject(new Error("Worker shutdown backup timeout"));
                }, Math.floor(userOptions.workerShutdownTimeout * 0.6)); // 60% of main timeout

                const shutdownMessageHandler = (message: any) => {
                  if (message.type === "SHUTDOWN_COMPLETE") {
                    clearTimeout(timeout);
                    clearTimeout(backupTimeout);
                    rscWorker?.removeListener(
                      "message",
                      shutdownMessageHandler
                    );
                    // Remove client component message handler
                    if (clientComponentMessageHandler) {
                      rscWorker?.removeListener(
                        "message",
                        clientComponentMessageHandler
                      );
                    }
                    // Remove all other event listeners as well
                    rscWorker?.removeAllListeners();
                    resolve();
                  }
                };

                rscWorker?.on("message", shutdownMessageHandler);

                // Send shutdown message
                rscWorker?.postMessage({
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
          } finally {
            // Remove specific listeners first
            if (clientComponentMessageHandler) {
              rscWorker.removeListener(
                "message",
                clientComponentMessageHandler
              );
            }
            rscWorker.removeAllListeners();
            rscWorker.terminate();
            rscWorker = undefined;
          }
        }
      } finally {
        // Reset any cached state to prevent issues in subsequent builds
        autoDiscoveredFiles = null;
        serverManifest = undefined;
      }
    },


  };
};
