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


import { createLogger } from "vite";
import { resolveOptions } from "../config/resolveOptions.js";
import { resolveUserConfig } from "../config/resolveUserConfig.js";
import type {
  BuildTiming,
  VitePluginFn,
} from "../types.js";
import { renderPages } from "./renderPages.js";
import { resolveAutoDiscover } from "../config/autoDiscover/resolveAutoDiscover.js";
import { performance } from "node:perf_hooks";
import { renderPage } from "./renderPage.client.js";
import { fileWriter } from "./fileWriter.js";
import { createWorker } from "../worker/createWorker.js";
import { serializedOptions, serializeResolvedConfig } from "../helpers/serializeUserOptions.js";
import { getBundleManifest } from "../helpers/getBundleManifest.js";
import { createDefaultModuleID } from "../config/createModuleID.js";
import type { Manifest } from "vite";
import { join } from "node:path";
import { handleError } from "../error/handleError.js";
import { configurePreviewServer } from "./configurePreviewServer.js";

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
  let logger: any;
  let autoDiscoveredFiles: any = null;
  let rscWorker: any = null;
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
    name: "vite:plugin-react-server/static-client",
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
      if (typeof userOptions.moduleID !== "function") {
        userOptions.moduleID = createDefaultModuleID(
          userOptions,
          configEnv,
          userOptions.loader?.mode
        );
      }

      // Initialize auto-discovery for client environment
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

      // Resolve user config for client environment
      const resolvedConfigResult = resolveUserConfig({
        condition: "react-server",
        config,
        configEnv,
        userOptions,
        autoDiscoveredFiles,
      });

      if (resolvedConfigResult.type === "error") {
        throw resolvedConfigResult.error;
      }


    },

    configResolved(config) {
      timing.configResolved = performance.now();
      logger = config.customLogger || createLogger();
    },

    async buildStart() {
      timing.buildStart = performance.now();
      logger?.info("[react-static-client] Build started");
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
      try {
        if (!autoDiscoveredFiles?.urlMap) {
          logger?.warn("[react-static-client] No pages found for static generation");
          return;
        }

        const routes = Array.from(autoDiscoveredFiles.urlMap.keys()) as string[];
        logger?.info(`[react-static-client] Generating ${routes.length} static pages`);

        // Get the server manifest from the bundle
        let serverManifest: any = {};
        try {
          const bundleManifest = getBundleManifest<false>({
            bundle,
            normalizer: userOptions.normalizer,
          });

          logger?.info(`[react-static-client] Bundle manifest keys: ${Object.keys(bundleManifest).join(', ')}`);

          const manifestPath = ".vite/manifest.json";
          if (bundleManifest[manifestPath] && "source" in bundleManifest[manifestPath]) {
            serverManifest = JSON.parse(bundleManifest[manifestPath].source as string);
            logger?.info(`[react-static-client] Found server manifest with ${Object.keys(serverManifest).length} entries`);
          } else {
            logger?.warn(`[react-static-client] No server manifest found at ${manifestPath}`);
          }
        } catch (error) {
          logger?.warn(`[react-static-client] Failed to get server manifest: ${error}`);
        }

        // Create an RSC worker for generating RSC content
        logger?.info(`[react-static-client] Creating RSC worker with path: ${userOptions.rscWorkerPath}`);
        logger?.info(`[react-static-client] Worker data keys: ${Object.keys({
          userOptions: serializedOptions(userOptions, autoDiscoveredFiles),
                      resolvedConfig: serializeResolvedConfig({
              root: userOptions.projectRoot,
              base: userOptions.moduleBaseURL,
              build: {
                server: userOptions.build.server,
                outDir: userOptions.build.outDir,
                assetsDir: userOptions.build.assetsDir,
                ssr: true,
                ssrEmitAssets: false,
                ssrManifest: false,
                manifest: false,
                rollupOptions: {},
                modulePreload: false,
              },
              currentCondition: "react-client",
              reverseCondition: "react-server",
            } as any),
          serverManifest: serverManifest || {},
          id: "static-client-rsc-worker",
        }).join(', ')}`);

        const rscWorkerResult = await createWorker({
          projectRoot: userOptions.projectRoot,
          workerPath: userOptions.rscWorkerPath,
          currentCondition: "react-client",
          reverseCondition: "react-server",
          maxListeners: routes.length + 1,
          envPrefix: "VITE_",
          logger: logger,
          verbose: userOptions.verbose,
          workerData: {
            userOptions: serializedOptions(userOptions, autoDiscoveredFiles),
            resolvedConfig: serializeResolvedConfig({
              root: userOptions.projectRoot,
              base: userOptions.moduleBaseURL,
              mode: "production",
              build: {
                server: userOptions.build.server,
                outDir: userOptions.build.outDir,
                assetsDir: userOptions.build.assetsDir,
                ssr: true,
                ssrEmitAssets: false,
                ssrManifest: false,
                manifest: false,
                rollupOptions: {},
                modulePreload: false,
              },
              currentCondition: "react-client",
              reverseCondition: "react-server",
            } as any),
            serverManifest: serverManifest || {},
            bundle: bundle || {},
            id: "static-client-rsc-worker",
          },
        });

        logger?.info(`[react-static-client] RSC worker creation result type: ${rscWorkerResult.type}`);

        if (rscWorkerResult.type !== "success") {
          logger?.error(`[react-static-client] RSC worker creation failed: ${rscWorkerResult.error?.message}`);
          const errorMessage = rscWorkerResult.reason || 
            (rscWorkerResult.error ? rscWorkerResult.error.message : 'Unknown error');
          throw new Error(`Failed to create RSC worker: ${errorMessage}`);
        }

        rscWorker = rscWorkerResult.worker;

        // Set up message handler to emit build files for client components
        rscWorker.on('message', (message: any) => {
          if (message.type === 'SERVER_MODULE' && message.id) {
            const moduleId = message.id;
            
            // Check if this is a client component that needs to be emitted
            if (moduleId.endsWith('.client.tsx') || moduleId.endsWith('.client.ts')) {
              // Look up the compiled path in the static manifest
              const compiledEntry = autoDiscoveredFiles.staticManifest[moduleId];
              if (compiledEntry) {
                // Emit the build file to the static output directory
                const buildFilePath = join(userOptions.projectRoot, userOptions.build.outDir, userOptions.build.static, compiledEntry.file);
                
                // Read the compiled file and write it to the static output
                import('fs/promises').then(async (fs) => {
                  try {
                    const sourcePath = join(userOptions.projectRoot, userOptions.build.outDir, userOptions.build.static, compiledEntry.file);
                    const content = await fs.readFile(sourcePath, 'utf-8');
                    await fs.writeFile(buildFilePath, content);
                    
                    if (userOptions.verbose) {
                      logger?.info(`[react-static-client] Emitted client component: ${moduleId} -> ${compiledEntry.file}`);
                    }
                  } catch (error) {
                    if (userOptions.verbose) {
                      logger?.warn(`[react-static-client] Failed to emit client component ${moduleId}: ${error}`);
                    }
                  }
                });
              }
            }
          }
        });

        // Create a client manifest by merging staticManifest with our own references
        const clientManifest: Manifest = {
          ...autoDiscoveredFiles.staticManifest,
        };
        
        // Add any missing references for the paths that will be loaded by the RSC worker
        for (const [_route, { page, props, root, html }] of autoDiscoveredFiles.urlMap) {
          if (page && !clientManifest[page]) {
            const staticEntry = autoDiscoveredFiles.staticManifest[page];
            clientManifest[page] = { 
              file: page,
              ...(staticEntry?.css ? { css: staticEntry.css } : {})
            };
          }
          if (props && !clientManifest[props]) {
            const staticEntry = autoDiscoveredFiles.staticManifest[props];
            clientManifest[props] = { 
              file: props,
              ...(staticEntry?.css ? { css: staticEntry.css } : {})
            };
          }
          if (root && !clientManifest[root]) {
            const staticEntry = autoDiscoveredFiles.staticManifest[root];
            clientManifest[root] = { 
              file: root,
              ...(staticEntry?.css ? { css: staticEntry.css } : {})
            };
          }
          if (html && !clientManifest[html]) {
            const staticEntry = autoDiscoveredFiles.staticManifest[html];
            clientManifest[html] = { 
              file: html,
              ...(staticEntry?.css ? { css: staticEntry.css } : {})
            };
          }
        }

        // Create a simple no-op loader for client mode
        const clientLoader = async (_id: string) => {
          return { default: "" };
        };

        // Render pages using client-side renderer with RSC worker only
        const { onEvent, ...handlerOptions } = userOptions;
        const renderPagesGenerator = renderPages(routes, renderPage)({
          ...userOptions, // Use the clean options instead of the original handlerOptions
          worker: rscWorker, // Pass the RSC worker for RSC rendering only
          loader: clientLoader,
          logger: logger,
          autoDiscoveredFiles: autoDiscoveredFiles,
          cssFilesByPage: new Map(),
          serverPipeableStreamOptions: {},
          globalCss: new Map(),
          manifest: serverManifest, // Use the client manifest for component resolution
        });

        // Process the rendered pages
        for await (const result of renderPagesGenerator) {
          if (result.type === "error") {
            logger?.error(`[react-static-client] Error rendering page: ${String(result.error)}`);
            continue;
          }

          if (result.type === "success") {
            logger?.info(`[react-static-client] Successfully rendered ${result.completedRoutes.size} pages`);
            
            // Process each completed route
            for (const route of result.completedRoutes) {
              const routeResult = result.results.get(route);
              if (routeResult) {
                // RSC file is already written by collectRscContent, so we only need to write HTML
                const htmlWritePromise = fileWriter(
                  routeResult.html as any,
                  "html",
                  {
                    ...handlerOptions,
                    route,
                    onEvent: (event) => {
                      // Update metrics when file write is complete
                      if (event.type === "file.write.done" && event.data.fileType === "html") {
                        // Update the metrics to reflect the actual file content size (trimmed)
                        const routeMetrics = result.results.get(route)?.metrics;
                        if (routeMetrics && routeMetrics.rscFull) {
                          routeMetrics.rscFull.bytes = event.data.content.length;
                          logger?.info(
                            `[react-static-client] Updated HTML metrics to file size: ${event.data.content.length} bytes for route: ${route}`
                          );
                        }
                      }
                      // Forward the event to the user's event handler
                      if (userOptions.onEvent) {
                        userOptions.onEvent(event);
                      }
                    },
                    logger: logger,
                  }
                );

                // Wait for HTML file to be written
                await htmlWritePromise;
              }
            }
            
            // Emit event for successful page generation
            userOptions.onEvent?.({
              type: "build.writeBundle.static-client",
              data: {
                pages: Array.from(result.completedRoutes),
                options: {} as any,
                bundle: {} as any,
              },
            });
          }
        }

        logger?.info("[react-static-client] Static generation completed");
        
        // Clean up the RSC worker
        if (rscWorker) {
          rscWorker.terminate();
        }
      } catch (error) {
        const panicError = handleError({
          error,
          context: "react-static-client",
          logger,
          panicThreshold: userOptions.panicThreshold,
        });
        // Clean up the RSC worker on error
        if (rscWorker) {
          rscWorker.terminate();
        }
        if(panicError != null) {
          throw panicError;
        }
      }
    },
  };
};
