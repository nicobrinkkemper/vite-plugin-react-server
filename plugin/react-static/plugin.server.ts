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
import { renderPages } from "./renderPages.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import { createWorker } from "../worker/createWorker.js";
import {
  serializedOptions,
  serializeResolvedConfig,
} from "../helpers/serializeUserOptions.js";
import { performance } from "node:perf_hooks";
import { baseURL } from "../utils/envUrls.node.js";
import { handleError } from "../error/handleError.js";
import { renderPage } from "./renderPage.server.js";
import { temporaryReferences } from "./temporaryReferences.server.js";
import { configurePreviewServer } from "./configurePreviewServer.js";
import { envPrefixFromConfig } from "../config/envPrefixFromConfig.js";

import { processCssFilesForPages } from "./processCssFilesForPages.js";
import { createWorkerStartupMetrics } from "../metrics/createWorkerStartupMetrics.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { join } from "node:path";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { assertReactServer } from "../config/getCondition.js";

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
            this.error(panicError);
            throw panicError;
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
    async writeBundle(_options, bundle) {
      // Debug logging removed for performance

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
          this.error(panicError);
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
            for (const [key, value] of cssMap.entries()) {
              logger.info(
                `[plugin.server]   CSS file: ${key} -> ${value.as} (${
                  value.children ? "inline" : "link"
                })`
              );
            }
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
          bootstrapScripts: [
            ...(indexHtml ? [baseURL(indexHtml)] : []),
            ...(userOptions.clientPipeableStreamOptions?.bootstrapScripts ?? []),
          ],
        }
        const serializedUserOptions = serializedOptions(
          userOptions,
          autoDiscoveredFiles!
        );
        // Create HTML worker for HTML generation
        if (!worker) {
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
              userOptions.onMetrics(workerStartupMetric);
            }
          }
        }

        // Get routes for worker configuration
        const routes = !autoDiscoveredFiles
          ? []
          : Array.from(autoDiscoveredFiles!.urlMap.keys());

        // No RSC worker needed for static generation - main thread runs with react-server conditions
        // Render pages - component resolution now happens per-route in renderPage
        const { onEvent, ...handlerOptions } = userOptions;

        // If no pages to generate, skip static generation
        if (routes.length === 0) {
          logger?.info("[plugin.server] No pages to generate, skipping static generation");
          return;
        }

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
              this.error(eventPanicError);
              throw eventPanicError; // Re-throw to abort the build
            }
          }
        }

        // this will render the routes
        const renderPagesGenerator = renderPages(
          routes,
          {
            ...handlerOptions,
            loader: buildLoader,
            worker: worker, // Pass the worker for HTML generation
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
          },
          renderPage
        );

        // Process render results
        let finalResult: RenderPagesResult | undefined;
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
        // Calculate duration from timing
        const duration = Math.round(
          performance.now() - (timing.renderStart || timing.start)
        );

        this.info(
          `Rendered ${finalResult.completedRoutes.size} pages in ${duration}ms`
        );

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
      }
    },

    async closeBundle() {
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
                  clearTimeout(timeout);
                  clearTimeout(backupTimeout);
                  worker?.removeListener("message", messageHandler);
                  // Remove all other event listeners as well
                  worker?.removeAllListeners();
                  resolve();
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
        } finally {
          worker.removeAllListeners();
          worker.terminate();
          worker = undefined;
        }
      }
    },
  } as const;
};
