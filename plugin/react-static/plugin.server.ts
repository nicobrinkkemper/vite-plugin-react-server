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

import { join } from "node:path";
import type { Worker } from "node:worker_threads";
import {
  type Logger,
  type Manifest,
  type ManifestChunk,
  type ResolvedConfig,
  createLogger,
} from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { createBuildLoader } from "./createBuildLoader.server.js";
import type {
  BuildTiming,
  PluginEvent,
  RenderPagesResult,
  AutoDiscoveredFiles,
  CssContent,
  VitePluginFn,
} from "../types.js";
import { renderPages } from "./renderPages.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import { createWorker } from "../worker/createWorker.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import {
  serializedOptions,
  serializeResolvedConfig,
} from "../helpers/serializeUserOptions.js";
import { collectManifestCss } from "../helpers/collectManifestCss.js";
import { createCssProps } from "../helpers/createCssProps.js";
import { performance } from "node:perf_hooks";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { baseURL } from "../utils/envUrls.node.js";
import { readFile } from "node:fs/promises";
import { handleError } from "../error/handleError.js";
import { createDefaultModuleID } from "../config/createModuleID.js";
import { assertReactServer } from "../config/getCondition.js";
import { renderPage } from "./renderPage.server.js";
import { temporaryReferences } from "./temporaryReferences.server.js";
import { configurePreviewServer } from "./configurePreviewServer.js";

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
  let worker: Worker;
  let logger: Logger;
  let resolvedConfig: ResolvedConfig;
  let autoDiscoveredFiles: AutoDiscoveredFiles | null = null;
  let serverManifest: Manifest | undefined = undefined;
  const timing: BuildTiming = {
    start: Date.now(),
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
    name: "vite:plugin-react-server/static",
    enforce: "post",

    api: {
      meta: { timing },
    },
    async config(config, configEnv) {
      console.log("🔍 Static plugin config hook called");
      console.log("🔍 Static plugin config hook - configEnv:", configEnv);
      console.log("🔍 Static plugin config hook - has builder:", !!config.builder);
      if (config.root && config.root !== userOptions.projectRoot) {
        userOptions.projectRoot = config.root;
      }
      if (configEnv.command !== "build") {
        return;
      }
      if (typeof userOptions.moduleID !== "function") {
        userOptions.moduleID = createDefaultModuleID(
          userOptions,
          configEnv,
          userOptions.loader?.mode
        );
      }
      // Initialize autoDiscoveredFiles for server environment only
      const autoDiscoverResult = await resolveAutoDiscover({
        config,
        configEnv,
        userOptions,
        condition: "react-server",
        logger: config.customLogger || createLogger(),
      });
      if (autoDiscoverResult.type === "error") {
        throw autoDiscoverResult.error;
      }
      autoDiscoveredFiles = autoDiscoverResult.autoDiscoveredFiles;
      const resolvedConfig = resolveUserConfig({
        condition: "react-server",
        config,
        configEnv,
        userOptions,
        autoDiscoveredFiles,
      });
      if (resolvedConfig.type === "error") {
        throw resolvedConfig.error;
      }

      timing.configResolved = Date.now();
    },
    configResolved(config) {
      resolvedConfig = config;
      if (!logger) {
        logger = config.customLogger ?? createLogger();
      }
    },
    async buildStart() {
      
      if (!logger) {
        logger = this.environment.logger;
      }
      timing.buildStart = Date.now();
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
      timing.renderStart = Date.now();
    },
    async writeBundle(options, bundle) {
      console.log("🔍 Static plugin writeBundle hook called in environment:", this.environment?.name || 'unknown');
      
      // Run in any environment for debugging
      console.log("🔍 Static plugin writeBundle - proceeding with bundle");
      
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
      // handle user's onEvent callback
      if (typeof userOptions.onEvent === "function") {
        try {
          userOptions.onEvent({
            type: "build.writeBundle.static-server",
            data: {
              pages: Array.from(autoDiscoveredFiles?.urlMap.keys() ?? []),
              options,
              bundle,
            },
          });
        } catch (error) {
          const panicError = handleError({
            error,
            logger: logger,
            panicThreshold: userOptions.panicThreshold,
            context: "onEvent(build.writeBundle.static-server)",
          });
          if (panicError != null) {
            this.error(panicError);
          }
        }
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

      // this is the main try, that will never fail.
      try {
        const buildLoader = createBuildLoader(
          {
            userOptions: userOptions,
            serverManifest: serverManifest ?? {},
            staticManifest: autoDiscoveredFiles?.staticManifest ?? {},
          },
          bundle,
          temporaryReferences,
          logger
        );

        // Create CSS props for each CSS file
        const cssFilesByPage = new Map();

        // First collect global styles from index.html
        const indexHtmlCssInputs = collectManifestCss(
          autoDiscoveredFiles?.staticManifest ?? {},
          "index.html"
        );
        const clientEntryCssInputs = userOptions.clientEntry
          ? collectManifestCss(
              autoDiscoveredFiles?.staticManifest ?? {},
              userOptions.clientEntry
            )
          : null;
        const globalCssInputs = {
          ...indexHtmlCssInputs,
          ...clientEntryCssInputs,
        };

        // transform the server manifest to include the css files from the static manifest
        const transformedServerManifest = Object.fromEntries(
          Object.entries(serverManifest ?? {}).map(([key, value]) => {
            if (!value.css?.length) {
              return [key, value];
            }
            return [
              key,
              {
                ...value,
                css: autoDiscoveredFiles?.staticManifest[key]?.css ?? value.css,
              },
            ];
          })
        );
        const globalCss = new Map();
        const { urlMap = new Map() } = autoDiscoveredFiles ?? {};
        // Collect CSS files for each page and its props
        for (const [url, { page, props }] of urlMap) {
          const cssInputs = collectManifestCss(
            transformedServerManifest,
            props ? [page, props] : page
          );
          // Create a map for this page's CSS files
          const pageCssMap: Map<string, CssContent> = new Map();
          // Add global styles if they exist
          if (Object.keys(globalCssInputs).length > 0) {
            for (const [key, value] of Object.entries(globalCssInputs)) {
              let cssContent = await buildLoader(`${value}?inline`).then(
                (r) => r.default
              );
              if (cssContent === "undefined" || !cssContent) {
                cssContent =
                  (await readFile(
                    join(
                      userOptions.projectRoot,
                      userOptions.build.outDir,
                      userOptions.build.static,
                      key
                    ),
                    "utf-8"
                  )) ?? "";
              }
              if (cssContent) {
                globalCss.set(
                  key,
                  createCssProps({
                    id: key,
                    code: cssContent,
                    userOptions: userOptions,
                  })
                );
              }
            }
          }

          // Add page-specific styles
          for (const [key, value] of Object.entries(cssInputs)) {
            const cssContent = await buildLoader(`${value}?inline`).then((r) =>
              String(r.default)
            );
            if (typeof cssContent !== "string" || cssContent === "undefined") {
              continue;
            }
            if (cssContent) {
              // Ensure the CSS file path is properly resolved
              pageCssMap.set(
                key,
                createCssProps({
                  id: key,
                  code: cssContent,
                  userOptions: userOptions,
                })
              );
            }
          }
          cssFilesByPage.set(url, pageCssMap);
        }

        const staticManifest = autoDiscoveredFiles?.staticManifest ?? {};
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
        const serializedUserOptions = serializedOptions(
          userOptions,
          autoDiscoveredFiles!
        );
        // Create worker
        if (!worker) {
          const viteEnvPrefix =
            typeof resolvedConfig.envPrefix === "string"
              ? resolvedConfig.envPrefix
              : Array.isArray(resolvedConfig.envPrefix)
              ? resolvedConfig.envPrefix[0]
              : DEFAULT_CONFIG.ENV_PREFIX;
          const routeCount = autoDiscoveredFiles?.urlMap.size ?? 0;
          const maxListeners = routeCount + 1;
          const workerResult = await createWorker({
            projectRoot: userOptions.projectRoot,
            workerPath: userOptions.htmlWorkerPath,
            currentCondition: "react-server",
            reverseCondition: "react-client",
            maxListeners: maxListeners,
            envPrefix: viteEnvPrefix,
            logger: logger,
            workerData: {
              resolvedConfig: serializeResolvedConfig(resolvedConfig),
              userOptions: serializedUserOptions,
            },
          });
          if (workerResult.type === "error") {
            throw workerResult.error;
          } else if (workerResult.type === "skip") {
            logger.info("Worker not created, skipping static build");
            return;
          } else {
            worker = workerResult.worker;
          }
        }
        // Render pages - component resolution now happens per-route in renderPage
        const { onEvent, ...handlerOptions } = userOptions;
        const routes = !autoDiscoveredFiles
          ? ["/"]
          : Array.from(autoDiscoveredFiles!.urlMap.keys());



        // this will render the routes
        const renderPagesGenerator = renderPages(routes, renderPage)({
          ...handlerOptions,
          loader: buildLoader,
          worker: worker,
          logger: logger,
          onEvent: async (event: PluginEvent) => {
            try {
              if (onEvent) {
                onEvent(event);
              }
            } catch (error) {
              // Store the error
              panicError = error as Error;


              if (userOptions.verbose) {
                logger.error(
                  `[react-static] Error in onEvent callback: ${error}`
                );
              }
            }
          },
          serverPipeableStreamOptions: serverPipeableStreamOptions,
          manifest: serverManifest ?? {},
          globalCss: globalCss,
          autoDiscoveredFiles: autoDiscoveredFiles!,
          cssFilesByPage: cssFilesByPage,
        });

        // Process render results
        let finalResult: RenderPagesResult | undefined;
        for await (const result of renderPagesGenerator) {
        

          if (userOptions.panicThreshold === "all_errors") {
            // For "all_errors", check both error type results and success results with failed routes
            if (
              result.type === "error" ||
              (result.type === "success" &&
                result.failedRoutes &&
                result.failedRoutes.size > 0)
            ) {
              // Get the first error from failed routes
              const failedRoutes =
                result.type === "error"
                  ? result.failedRoutes
                  : result.failedRoutes!;
              const firstError = failedRoutes.values().next().value;
              throw firstError;
            }
          }
          // For "none" and "critical_errors" panic thresholds, continue processing
          // and use the last result (whether success or error)
          finalResult = result;
        }

        if (!finalResult) {
          throw new Error("No render result produced");
        }
        finalResult.streamMetrics.duration = Math.round(
          performance.now() - finalResult.streamMetrics.startTime
        );

        this.info(
          `Rendered ${finalResult.completedRoutes.size} unique routes in ${finalResult.streamMetrics.duration}ms`
        );

        // Log failed routes if any
        if (finalResult.failedRoutes && finalResult.failedRoutes.size > 0) {
          for (const [route, error] of finalResult.failedRoutes) {
            this.warn(
              new Error("Failed to render route: " + route, { cause: error })
            );
          }
        }

        if (process.env["NODE_ENV"] !== "production") {
          this.warn(
            `THIS BUILD IS NOT INTENDED FOR PRODUCTION (${process.env["NODE_ENV"]})`
          );
        }

        // Update timing
        timing.render = Date.now() - (timing.renderStart ?? timing.start);
      } catch (error) {
        panicError = handleError({
          error,
          logger: logger,
          panicThreshold: userOptions.panicThreshold,
          context: "writeBundle",
        });
        // Let the finally block handle the shutdown
      } finally {
        // Graceful worker shutdown
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
                    worker.removeListener("message", messageHandler);
                    // Remove all other event listeners as well
                    worker.removeAllListeners();
                    resolve();
                  }
                };

                worker.on("message", messageHandler);

                // Send shutdown message
                worker.postMessage({
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
          }
        }
      }
      if (panicError != null) {
        this.error(panicError);
      }
    },
  } as const;
};
