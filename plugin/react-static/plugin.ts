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
import { Worker } from "node:worker_threads";
import {
  type Manifest,
  type ResolvedConfig,
  type Plugin as VitePlugin,
  createLogger,
} from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import { createBuildLoader } from "../loader/createBuildLoader.js";
import type {
  BuildTiming,
  ReactStreamPluginMeta,
  ResolvedUserConfig,
  ResolvedUserOptions,
  PluginEvent,
  RenderPagesResult,
  AutoDiscoveredFiles,
  CssContent,
  PagePropOpt,
  InlineCssOpt,
} from "../types.js";
import { type StreamPluginOptions } from "../types.js";
import { renderPages } from "./renderPages.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import { createWorker } from "../worker/createWorker.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { getCondition } from "../config/getCondition.js";
import {
  serializedOptions,
  serializeResolvedConfig,
} from "../helpers/serializeUserOptions.js";
import { collectManifestCss } from "../helpers/collectManifestCss.js";
import { createCssProps } from "../helpers/createCssProps.js";
import { tryManifest } from "../helpers/tryManifest.js";
import { performance } from "node:perf_hooks";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { baseURL } from "../utils/envUrls.node.js";
import { readFile } from "node:fs/promises";

if (getCondition() !== "react-server") {
  throw new Error(
    "Condition mismatch, should be react-server but got " +
      process.env["NODE_OPTIONS"]
  );
}

export function reactStaticPlugin<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(
  options: StreamPluginOptions<T, InlineCSS>
): VitePlugin<{
  meta: ReactStreamPluginMeta;
}> {
  let worker: Worker;
  let userConfig: ResolvedUserConfig;
  let resolvedConfig: ResolvedConfig;
  let userOptions: ResolvedUserOptions<T, InlineCSS>;
  let autoDiscoveredFiles: AutoDiscoveredFiles | null = null;
  let serverManifest: Manifest | undefined = undefined;
  let buildLoader: Awaited<ReturnType<typeof createBuildLoader>> | undefined;
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
  userOptions = resolvedOptions.userOptions;

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
      if(configEnv.command !== "build") {
        return;
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
        if (!("source" in bundleManifest[".vite/manifest.json"])) {
          throw new Error("Server manifest not found");
        }

        serverManifest = JSON.parse(
          bundleManifest[".vite/manifest.json"].source as string
        );

        if (!serverManifest) {
          throw new Error("Failed to parse server manifest");
        }
        
        const clientManifestResult = await tryManifest({
          root: userOptions.projectRoot,
          outDir: join(userOptions.build.outDir, userOptions.build.client),
          ssrManifest: false,
        });
        if (clientManifestResult.type === "error") {
          throw clientManifestResult.error;
        }
        const clientManifest = clientManifestResult.manifest;

        buildLoader = await createBuildLoader<T, InlineCSS>(
          {
            userConfig,
            userOptions: userOptions as ResolvedUserOptions<T, InlineCSS>,
            serverManifest: serverManifest ?? {},
            staticManifest: autoDiscoveredFiles?.staticManifest ?? {},
            clientManifest: clientManifest ?? {},
          },
          bundle
        );

        // Create CSS props for each CSS file
        const cssFilesByPage = new Map();

        // First collect global styles from index.html
        const globalCssInputs = collectManifestCss(
          autoDiscoveredFiles?.staticManifest ?? {},
          "index.html",
          userOptions
        );

        const globalCss: Map<string, CssContent<InlineCSS>> = new Map();
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
                    autoDiscoveredFiles?.staticManifest[key]?.css ?? value.css,
                },
              ];
            })
          );
          const cssInputs = collectManifestCss(
            transformedServerManifest,
            props ? [page, props] : page,
            userOptions
          );

          // Create a map for this page's CSS files
          const pageCssMap: Map<string, CssContent> = new Map();
          // Add global styles if they exist
          if (Object.keys(globalCssInputs).length > 0) {
            for (const [key, value] of Object.entries(globalCssInputs)) {
              let cssContent = await buildLoader(value + "?inline").then((r) =>
                String(r.default)
              );
              if (cssContent === "undefined" || !cssContent) {
                cssContent = await readFile(
                  join(
                    userOptions.projectRoot,
                    userOptions.build.outDir,
                    userOptions.build.static,
                    key + ".css"
                  ),
                  "utf-8"
                ) ?? ""
              }
              if (cssContent) {
                globalCss.set(
                  value,
                  createCssProps<T, InlineCSS>({
                    id: value,
                    code: cssContent,
                    userOptions: userOptions,
                  })
                );
              }
            }
          }

          // Add page-specific styles
          for (const [, value] of Object.entries(cssInputs)) {
            try {
              const { default: cssContent } = await buildLoader(
                value + "?inline"
              );
              if (typeof cssContent !== "string") {
                continue;
              }
              if (cssContent) {
                // Ensure the CSS file path is properly resolved
                const cssPath = value.startsWith("/") ? value.slice(1) : value;
                pageCssMap.set(
                  cssPath,
                  createCssProps({
                    id: cssPath,
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
              userOptions: {
                ...serializedUserOptions,
              },
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
        // Render pages
        const { onEvent, ...handlerOptions } = userOptions;
        const renderPagesGenerator = renderPages(
          autoDiscoveredFiles!,
          {
            ...handlerOptions,
            loader: buildLoader,
            worker: worker,
            logger: createLogger(),
            onEvent: async (event: PluginEvent) => {
              if (userOptions.onEvent) {
                userOptions.onEvent(event);
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
              inlineCss: handlerOptions.css?.inlineCss ?? true,
            },
          },
          cssFilesByPage
        );

        // Process render results
        let finalResult: RenderPagesResult | undefined;
        for await (const result of renderPagesGenerator) {
          if (result.type === "error") {
            throw result.error;
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
        if (process.env["NODE_ENV"] !== "production") {
          this.environment.logger.warn(
            `THIS IS BUILD IS NOT INTENDED FOR PRODUCTION (${process.env["NODE_ENV"]})`
          );
        }

        // Update timing
        timing.render = Date.now() - (timing.renderStart ?? timing.start);
      } catch (error) {
        throw error;
      }

      // Cleanup
      try {
        worker.postMessage({ type: "SHUTDOWN", id: "*" });
        await new Promise<void>((resolve, reject) => {
          const shutdownHandler = (msg: any) => {
            if (msg.type === "SHUTDOWN_COMPLETE") {
              worker.removeListener("message", shutdownHandler);
              worker
                .terminate()
                .then((code) =>
                  code === 1
                    ? resolve()
                    : reject(new Error(`Worker terminated with code ${code}`))
                )
                .catch(reject);
            }
          };
          worker.on("message", shutdownHandler);
        });
      } catch (error) {
        throw error;
      }
    },
  } as const;
}
