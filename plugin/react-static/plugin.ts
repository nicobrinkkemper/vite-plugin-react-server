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
import { type Manifest, type ResolvedConfig, createLogger } from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { createBuildLoader } from "./createBuildLoader.js";
import type {
  BuildTiming,
  ReactStreamPluginMeta,
  ResolvedUserConfig,
  PluginEvent,
  RenderPagesResult,
  AutoDiscoveredFiles,
  CssContent,
  ReactStreamPluginFn,
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
import { logError } from "../error/logError.js";
import { toError } from "../error/toError.js";
import { createDefaultModuleID } from "../config/createModuleID.js";


export type ReactStaticPluginFn = ReactStreamPluginFn<{
  meta: ReactStreamPluginMeta;
}>;

export const reactStaticPlugin: ReactStaticPluginFn =
  function _reactStaticPlugin(options) {
    let worker: Worker;
    let userConfig: ResolvedUserConfig;
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
        if (config.root && config.root !== userOptions.projectRoot) {
          userOptions.projectRoot = config.root;
        }
        if (configEnv.command !== "build") {
          return;
        }
        if(typeof userOptions.moduleID !== "function") {
          userOptions.moduleID = createDefaultModuleID(userOptions, configEnv, userOptions.loader?.mode);
        }
        // Initialize autoDiscoveredFiles for both server and client builds
        const autoDiscoverResult = await resolveAutoDiscover({
          config,
          configEnv,
          userOptions,
          condition: "react-server",
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

        userConfig = resolvedConfig.userConfig;
        timing.configResolved = Date.now();
      },
      configResolved(config) {
        resolvedConfig = config;
      },
      async buildStart() {
        timing.buildStart = Date.now();
        if (userOptions.onEvent && autoDiscoveredFiles) {
          userOptions.onEvent({
            type: "build.start",
            data: {
              pages: Array.from(autoDiscoveredFiles.urlMap.keys()),
              files: autoDiscoveredFiles,
            },
          });
        }
      },

      async renderStart() {
        timing.renderStart = Date.now();
      },

      async writeBundle(options, bundle) {
        if (userOptions.onEvent) {
          userOptions.onEvent({
            type: "build.writeBundle.static-server",
            data: {
              pages: Array.from(autoDiscoveredFiles?.urlMap.keys() ?? []),
              options,
              bundle,
            },
          });
        }
        try {
          const bundleManifest = getBundleManifest<false>({
            bundle,
            normalizer: userOptions.normalizer,
          });
          const manifestPath =
            typeof resolvedConfig.build.manifest === "string"
              ? resolvedConfig.build.manifest
              : ".vite/manifest.json";
          if (!bundleManifest[manifestPath] || !("source" in bundleManifest[manifestPath])) {
            throw new Error("Server manifest not found");
          }

          serverManifest = JSON.parse(
            bundleManifest[manifestPath].source as string
          );

          if (!serverManifest) {
            throw new Error("Failed to parse server manifest");
          }

          const buildLoader = createBuildLoader(
            {
              userConfig,
              userOptions: userOptions,
              serverManifest: serverManifest ?? {},
              staticManifest: autoDiscoveredFiles?.staticManifest ?? {},
              clientManifest: {},
            },
            bundle
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

          const globalCss = new Map();
          // Collect CSS files for each page and its props
          for (const [url, { page, props }] of autoDiscoveredFiles?.urlMap ??
            []) {
            const transformedServerManifest = Object.fromEntries(
              Object.entries(serverManifest).map(([key, value]) => {
                if (!value.css?.length) {
                  return [key, value];
                }
                return [
                  key,
                  {
                    ...value,
                    css:
                      autoDiscoveredFiles?.staticManifest[key]?.css ??
                      value.css,
                  },
                ];
              })
            );
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
              try {
                const cssContent = await buildLoader(`${value}?inline`).then(
                  (r) => String(r.default)
                );
                if (
                  typeof cssContent !== "string" ||
                  cssContent === "undefined"
                ) {
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
              } catch (error) {
                console.warn(`Failed to process CSS file ${value}:`, error);
                continue;
              }
            }
            cssFilesByPage.set(url, pageCssMap);
          }

          const staticManifest = autoDiscoveredFiles?.staticManifest ?? {};
          const indexHtml = staticManifest?.["index.html"]?.file;
          const pipeableStreamOptions = {
            ...userOptions.pipeableStreamOptions,
            bootstrapModules: [
              ...(indexHtml ? [baseURL(indexHtml)] : []),
              ...(userOptions.pipeableStreamOptions?.bootstrapModules ?? []),
            ],
          };
          userOptions.pipeableStreamOptions = pipeableStreamOptions;
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
              logger: this.environment.logger,
              workerData: {
                resolvedConfig: serializeResolvedConfig(resolvedConfig),
                userOptions: serializedUserOptions,
              },
            });
            if (workerResult.type === "error") {
              throw workerResult.error;
            } else if (workerResult.type === "skip") {
              this.environment.logger.info(
                "Worker not created, skipping static build"
              );
              return;
            } else {
              worker = workerResult.worker;
            }
          }
          // Render pages - component resolution now happens per-route in renderPage
          const { onEvent, ...handlerOptions } = userOptions;
          const renderPagesGenerator = renderPages(
            autoDiscoveredFiles!,
            {
              ...handlerOptions,
              loader: buildLoader,
              worker: worker,
              logger: createLogger(),
              onEvent: async (event: PluginEvent) => {
                if (onEvent) {
                  onEvent(event);
                }
                // Add file write completion event
                if (event.type === "file.write") {
                  await event.data.onComplete();
                }
              },
              pipeableStreamOptions: pipeableStreamOptions,
              manifest: serverManifest ?? {},
              build: {
                htmlOutputPath: userOptions.build.htmlOutputPath,
                rscOutputPath: userOptions.build.rscOutputPath,
                outDir: userOptions.build.outDir,
                pages: userOptions.build.pages,
                server: userOptions.build.server,
                static: userOptions.build.static,
                client: userOptions.build.client,
              },
              globalCss: globalCss,
              css: {
                ...handlerOptions.css,
                inlineCss: handlerOptions.css.inlineCss,
              },

            },
            cssFilesByPage
          );

          // Process render results
          let finalResult: RenderPagesResult | undefined;
          const errors: Error[] = [];
          for await (const result of renderPagesGenerator) {
            if (result.type === "error") {
              errors.push(result.error);
              
              // Provide developer-friendly error messages for common issues
              if (result.error.message.includes("Attempted to load a Client Module outside the hosted root")) {
                const failedRoutes = Array.from(result.failedRoutes || []);
                const failingPage = failedRoutes[failedRoutes.length - 1] || 'unknown';
                const hostedRoot = userOptions.moduleBaseURL || '/';
                this.environment.logger.error(
                  `❌ Page: ${failingPage} | Hosted root: ${hostedRoot} | Client modules registered outside hosted root`
                );
              } else {
                this.environment.logger.warn(
                  `Failed to render page, skipping: ${result.error.message}`
                );
              }
              
              // Continue processing other pages instead of throwing
              finalResult = {
                type: "success",
                completedRoutes: result.completedRoutes,
                failedRoutes: undefined,
                htmlSizes: result.htmlSizes,
                rscSizes: result.rscSizes,
                streamMetrics: result.streamMetrics,
                results: result.results,
              };
              continue;
            }
            finalResult = result;
          }

          if (!finalResult) {
            throw new Error("No render result produced");
          }
          finalResult.streamMetrics.duration = Math.round(
            performance.now() - finalResult.streamMetrics.startTime
          );

          this.environment.logger.info(
            `Rendered ${finalResult.completedRoutes.size} unique routes in ${finalResult.streamMetrics.duration}ms`
          );
          if (errors.length > 0) {
            this.environment.logger.warn(
              `${errors.length} pages failed to render and were skipped`
            );
          }
          if (process.env["NODE_ENV"] !== "production") {
            this.environment.logger.warn(
              `THIS IS BUILD IS NOT INTENDED FOR PRODUCTION (${process.env["NODE_ENV"]})`
            );
          }

          // Update timing
          timing.render = Date.now() - (timing.renderStart ?? timing.start);
        } catch (error) {
          logError(toError(error), this.environment.logger);
        } finally {
          // Cleanup
          if (worker) {
            try {
              // Force terminate the worker without waiting for graceful shutdown
              await worker.terminate();
            } catch (error) {
              logError(toError(error), this.environment.logger);
            }
          }
        }
      },
    } as const;
  };
