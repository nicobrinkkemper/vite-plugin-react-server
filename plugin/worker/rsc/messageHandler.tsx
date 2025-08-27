import { parentPort } from "node:worker_threads";
import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { workerData } from "node:worker_threads";
import { join } from "node:path";
import { createRscWorkerLoader } from "./createRscWorkerLoader.js";
import { createRenderToPipeableStreamHandler } from "../../stream/createRenderToPipeableStreamHandler.js";
import type {
  RscWorkerInputMessage,
  ComponentsResolvedMessage,
} from "./types.js";
import { toError } from "../../error/toError.js";
import { handleError } from "../../error/handleError.js";
import { createHandlers } from "./handlers.js";
import {
  addCssFileContent,
  addModuleId,
  cssFiles,
  hmrState,
  cacheComponent,
  getCachedComponent,
  hasCachedComponent,
} from "./state.js";
import {
  combineCssFiles,
  processInlineCssForState,
} from "../../helpers/createUnifiedCssProcessor.js";
import { routeToURL } from "../../utils/routeToURL.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { resolvePageAndProps } from "../../helpers/resolvePageAndProps.js";
import { resolveComponent } from "../../helpers/resolveComponent.js";
import { userOptions } from "./userOptions.js";
import { React } from "../../vendor/vendor.server.js";
import { sendMessage } from "../sendMessage.js";
import { createModuleResolutionMetrics } from "../../metrics/createModuleResolutionMetrics.js";

const logger = createLogger(workerData.resolvedConfig?.logLevel ?? "info");
const verbose = workerData.userOptions.verbose ?? false;

// Track active renders - store the RSC stream for each unique render (id)
const activeRenders = new Map<string, PassThrough>();

// Track active streams by route for reuse
const activeStreamsByRoute = new Map<string, string>(); // route -> streamId

// Track headless stream errors by route for full stream error propagation
const headlessStreamErrors = new Map<string, Error>(); // route -> error

function cleanupRender(id: string) {
  const rscStream = activeRenders.get(id);
  if (rscStream) {
    rscStream.destroy();
    activeRenders.delete(id);

    // Clean up route mapping
    for (const [route, streamId] of activeStreamsByRoute.entries()) {
      if (streamId === id) {
        activeStreamsByRoute.delete(route);
        break;
      }
    }
  }
}

function clearHeadlessError(route: string) {
  headlessStreamErrors.delete(route);
}

/**
 * Helper function to load components with caching
 */
async function loadComponentsWithCache(options: {
  pagePath?: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName?: string;
  propsExportName?: string;
  rootExportName?: string;
  htmlExportName?: string;
  url: string;
  loader: any;
  verbose?: boolean;
  logger?: any;
}) {
  const {
    pagePath,
    propsPath,
    rootPath,
    htmlPath,
    pageExportName = "Page",
    propsExportName = "props",
    rootExportName = "Root",
    htmlExportName = "Html",
    loader,
    verbose,
    logger,
  } = options;

  let PageComponent: any;
  let pageProps: any;
  let RootComponent: any;
  let HtmlComponent: any;

  // Load page and props using the unified helper
  if (pagePath) {
    const pageAndPropsResult = await resolvePageAndProps({
      pagePath,
      propsPath,
      pageExportName,
      propsExportName,
      url: "/",
      loader,
      verbose: verbose || false,
      logger,
    });

    if (pageAndPropsResult.type === "success") {
      PageComponent = pageAndPropsResult.PageComponent;
      pageProps = pageAndPropsResult.pageProps;

      // Cache the components
      const pageId = `${pagePath}#${pageExportName}`;
      cacheComponent(pageId, PageComponent);

      if (propsPath) {
        const propsId = `${propsPath}#${propsExportName}`;
        cacheComponent(propsId, pageProps);
      }

      if (verbose) {
        logger?.info(
          `[rsc-worker] Loaded and cached PageComponent from: ${pagePath}`
        );
        if (propsPath) {
          logger?.info(
            `[rsc-worker] Loaded and cached pageProps from: ${propsPath}`
          );
        }
      }
    } else {
      // Handle component resolution failure gracefully (same as server environment)
      if (verbose) {
        logger?.warn(
          `[rsc-worker] Failed to load page and props: ${pageAndPropsResult.error?.message}`
        );
      }
      // Use React.Fragment as fallback (same as server environment)
      PageComponent = React.Fragment;
      pageProps = {};
    }
  }

  // Load Root component
  if (rootPath) {
    const rootId = `${rootPath}#${rootExportName}`;
    if (hasCachedComponent(rootId)) {
      RootComponent = getCachedComponent(rootId);
      if (verbose) {
        logger?.info(
          `[rsc-worker] Using cached Root component from: ${rootPath}`
        );
      }
    } else {
      const rootResult = await resolveComponent({
        componentPath: rootPath,
        exportName: rootExportName,
        loader,
      });

      if (rootResult.type === "success") {
        RootComponent = rootResult.component;
        cacheComponent(rootId, RootComponent);
        if (verbose) {
          logger?.info(
            `[rsc-worker] Loaded and cached Root component from: ${rootPath}`
          );
        }
      } else {
        // Handle component resolution failure gracefully (same as server environment)
        if (verbose) {
          logger?.warn(
            `[rsc-worker] Failed to load Root component: ${rootResult.error?.message}`
          );
        }
        // Use React.Fragment as fallback (same as server environment)
        RootComponent = React.Fragment;
      }
    }
  } else {
    // Use default Root component
    try {
      const { Root } = await import("../../components/root.js");
      RootComponent = Root;
      if (verbose) {
        logger?.info(`[rsc-worker] Using default Root component`);
      }
    } catch (error) {
      logger?.warn(
        `[rsc-worker] Error loading default Root component: ${error}`
      );
    }
  }

  // Load Html component
  if (htmlPath === "") {
    HtmlComponent = React.Fragment; // Empty string = headless (no HTML wrapper)
  } else if (htmlPath) {
    const htmlId = `${htmlPath}#${htmlExportName}`;
    if (hasCachedComponent(htmlId)) {
      HtmlComponent = getCachedComponent(htmlId);
      if (verbose) {
        logger?.info(
          `[rsc-worker] Using cached Html component from: ${htmlPath}`
        );
      }
    } else {
      const htmlResult = await resolveComponent({
        componentPath: htmlPath,
        exportName: htmlExportName,
        loader,
      });

      if (htmlResult.type === "success") {
        HtmlComponent = htmlResult.component;
        cacheComponent(htmlId, HtmlComponent);
        if (verbose) {
          logger?.info(
            `[rsc-worker] Loaded and cached Html component from: ${htmlPath}`
          );
        }
      } else {
        throw new Error(
          `Failed to load Html component: ${htmlResult.error?.message}`
        );
      }
    }
  } else {
    // Use default Html component
    try {
      const { Html } = await import("../../components/html.js");
      HtmlComponent = Html;
      if (verbose) {
        logger?.info(`[rsc-worker] Using default Html component`);
      }
    } catch (error) {
      logger?.warn(
        `[rsc-worker] Error loading default Html component: ${error}`
      );
    }
  }

  return { PageComponent, pageProps, RootComponent, HtmlComponent };
}

export async function messageHandler(
  msg: RscWorkerInputMessage,
  port = parentPort
) {
  // Create handlers based on whether we have ports (two-port) or not (single-port)
  const effectiveHandlers = createHandlers(
    msg.type === "INIT" ? (msg as any).dataPort : undefined,
    msg.type === "INIT" ? (msg as any).controlPort : undefined
  );

  try {
    if (verbose) {
      logger.info(
        `[rsc-worker] Received message: ${msg.type} for id: ${msg.id}`
      );
    }

    switch (msg.type) {
      case "INIT":
        // Clean up any previous render for this id
        cleanupRender(msg.id);

        // Determine if this is a headless or full RSC request
        const isHeadless = msg.options.htmlPath === "" || !msg.options.htmlPath;
        const rscVariant = isHeadless ? "rsc-headless" : "rsc-full";

        if (verbose) {
          logger.info(
            `[rsc-worker] Processing ${rscVariant} render for route: ${msg.options.route}`
          );
        }

        // Create a new PassThrough stream for this render, or use the one provided
        const rscStream = (msg as any).rscStream || new PassThrough();
        activeRenders.set(msg.id, rscStream);

        // Start measuring module resolution time from first module load
        const moduleResolutionStartTime = performance.now();

        // Load modules (page, props, and components together) - same as server environment
        const loader = createRscWorkerLoader({
          verbose: msg.options.verbose ?? workerData.userOptions.verbose,
          logger,
          hmrState,
          projectRoot: workerData.userOptions?.projectRoot || process.cwd(),
          manifest: msg.options.manifest || workerData.serverManifest || {},
          build: {
            server: userOptions.build?.server || "server",
            client: userOptions.build?.client || "client",
            static: userOptions.build?.static || "static",
            outDir: userOptions.build?.outDir || "dist",
          },
          bundle: workerData.bundle || {},
          clientPattern: userOptions.autoDiscover?.clientPattern,
        });

        const url =
          msg.options.url ||
          routeToURL(
            msg.options.route,
            userOptions.moduleBaseURL,
            userOptions.build?.rscOutputPath ??
              DEFAULT_CONFIG.BUILD.rscOutputPath
          );

        // Load components using the unified helper function
        const { PageComponent, pageProps, RootComponent, HtmlComponent } =
          await loadComponentsWithCache({
            pagePath: msg.options.pagePath,
            propsPath: msg.options.propsPath,
            rootPath: msg.options.rootPath,
            htmlPath: msg.options.htmlPath,
            pageExportName:
              msg.options.pageExportName ??
              workerData.userOptions.pageExportName,
            propsExportName:
              msg.options.propsExportName ??
              workerData.userOptions.propsExportName,
            rootExportName:
              msg.options.rootExportName ??
              workerData.userOptions.rootExportName,
            htmlExportName:
              msg.options.htmlExportName ??
              workerData.userOptions.htmlExportName,
            url,
            loader,
            verbose,
            logger,
          });

        // Emit module resolution metric after components are loaded
        const moduleResolutionTime =
          performance.now() - moduleResolutionStartTime;
        if (effectiveHandlers.onMetrics) {
          const moduleResolutionMetric = createModuleResolutionMetrics({
            route: msg.options.route,
            workerType: "rsc",
            resolutionTime: moduleResolutionTime,
            fromMainThread: false,
            fromRscWorker: true,
            fromHtmlWorker: false,
            description: `Module resolution for route ${msg.options.route}`,
          });
          effectiveHandlers.onMetrics(msg.id, moduleResolutionMetric);
        }

        // Process CSS files using unified CSS processor
        const messageCssFiles = new Map(msg.options.cssFiles || []);

        // Process inline CSS for stateful system using unified helper
        processInlineCssForState(
          messageCssFiles,
          addCssFileContent,
          userOptions
        );

        // Combine stateful CSS with message CSS using unified helper
        const combinedCssFiles = combineCssFiles(cssFiles, messageCssFiles);

        // Create handler options exactly like server environment
        const handlerOptions = {
          route: msg.options.route,
          url,
          pageProps,
          PageComponent,
          RootComponent,
          HtmlComponent,
          cssFiles: combinedCssFiles,
          globalCss: msg.options.globalCss ?? new Map(),
          manifest: msg.options.manifest || {},
          projectRoot:
            userOptions.projectRoot ||
            workerData.userOptions?.projectRoot ||
            process.cwd(),
          moduleBase:
            userOptions.moduleBase ||
            workerData.userOptions?.moduleBase ||
            DEFAULT_CONFIG.MODULE_BASE,
          moduleBasePath:
            userOptions.moduleBasePath ||
            workerData.userOptions?.moduleBasePath ||
            DEFAULT_CONFIG.MODULE_BASE_PATH,
          moduleBaseURL:
            userOptions.moduleBaseURL ||
            workerData.userOptions?.moduleBaseURL ||
            DEFAULT_CONFIG.MODULE_BASE_URL,
          moduleRootPath:
            userOptions.moduleRootPath ||
            workerData.userOptions?.moduleRootPath,
          verbose: msg.options.verbose || verbose,
          logger,
          panicThreshold: msg.options.panicThreshold || "none",
          rscTimeout: msg.options.rscTimeout,
          serverPipeableStreamOptions: (() => {
            // Both headless and full streams should use the constructed serverPipeableStreamOptions with bootstrapModules
            const options = msg.options.serverPipeableStreamOptions || workerData.userOptions?.serverPipeableStreamOptions;
            
            if (verbose) {
              logger.info(
                `[rsc-worker] ${isHeadless ? 'Headless' : 'Full'} stream serverPipeableStreamOptions: ${JSON.stringify(options)}`
              );
            }
            
            return options;
          })(),
          clientPipeableStreamOptions: msg.options.clientPipeableStreamOptions,
          onEvent: userOptions.onEvent,
          onMetrics: userOptions.onMetrics,
        };

        // Use the same createRenderToPipeableStreamHandler as server environment
        let result;
        
        // Check if there was a headless error for this route
        const headlessError = headlessStreamErrors.get(msg.options.route);
        const shouldUseFallback = headlessError && !isHeadless;
        
        if (shouldUseFallback) {
          if (verbose) {
            logger.info(
              `[rsc-worker] Using fallback components for full stream due to headless error: ${headlessError.message}`
            );
          }
          // Create a fallback handler with React.Fragment for PageComponent but keep original HtmlComponent
          // This ensures bootstrapScripts are still rendered even in fallback scenarios
          const fallbackHandlerOptions = {
            ...handlerOptions,
            PageComponent: React.Fragment,
            // Keep the original HtmlComponent to ensure bootstrapScripts are rendered
          };
          result = createRenderToPipeableStreamHandler(fallbackHandlerOptions);
        } else {
          try {
            result = createRenderToPipeableStreamHandler(handlerOptions);
          } catch (error) {
            // Handle error the same way as server environment - create fallback with React.Fragment
            if (verbose) {
              logger.warn(
                `[rsc-worker] Original PageComponent failed during creation for route ${msg.options.route}: ${error}`
              );
            }

            // Create a fallback handler with React.Fragment for PageComponent but keep original HtmlComponent
            // This ensures bootstrapScripts are still rendered even in fallback scenarios
            const fallbackHandlerOptions = {
              ...handlerOptions,
              PageComponent: React.Fragment,
              // Keep the original HtmlComponent to ensure bootstrapScripts are rendered
            };

            result = createRenderToPipeableStreamHandler(fallbackHandlerOptions);
          }
        }

        // Track headless streams by route for potential reuse
        if (isHeadless) {
          activeStreamsByRoute.set(msg.options.route, msg.id);
          // Clear any previous headless error for this route
          clearHeadlessError(msg.options.route);
          if (verbose) {
            logger.info(
              `[rsc-worker] Tracked headless stream ${msg.id} for route: ${msg.options.route}`
            );
          }
        } else {
          // This is a full stream - check if there was a headless error for this route
          const headlessError = headlessStreamErrors.get(msg.options.route);
          if (headlessError) {
            if (verbose) {
              logger.info(
                `[rsc-worker] Full stream ${msg.id} for route ${msg.options.route} detected headless error: ${headlessError.message}`
              );
            }
            // Track the error but let the main thread handle the PageComponent modification
            // (same approach as server environment)
          }
        }

        // Process the stream using the handlers
        const streamId = msg.id;
        const passThrough = result.rscStream;

        // Set up stream event handlers
        if (passThrough) {
          passThrough.on("data", (chunk) => {
            if (verbose) {
              logger.info(
                `[rsc-worker] RSC stream data chunk: ${chunk.length} bytes`
              );
            }
            effectiveHandlers.onData(streamId, chunk);
          });

          passThrough.on("end", () => {
            if (verbose) {
              logger.info(`[rsc-worker] RSC stream ended`);
            }
            
            // If headless stream completed successfully, clear any error tracking
            if (isHeadless) {
              clearHeadlessError(msg.options.route);
              if (verbose) {
                logger.info(
                  `[rsc-worker] Headless stream completed successfully for route ${msg.options.route}, cleared error tracking`
                );
              }
            }
            
            effectiveHandlers.onEnd(streamId);
            cleanupRender(streamId);
          });

          passThrough.on("error", (error) => {
            if (verbose) {
              logger.error(`[rsc-worker] RSC stream error: ${error.message}`);
            }
            
            // Track headless stream errors for full stream error propagation
            if (isHeadless) {
              headlessStreamErrors.set(msg.options.route, error);
              if (verbose) {
                logger.info(
                  `[rsc-worker] Tracked headless error for route ${msg.options.route}: ${error.message}`
                );
              }
              // Send control message to inform about headless error
              effectiveHandlers.onError(streamId, toError(error));
            } else {
              effectiveHandlers.onError(streamId, toError(error));
            }
            
            cleanupRender(streamId);
          });
        }

        // Send RSC_RENDER_START control message
        effectiveHandlers.onRscRender(streamId, msg);

        return result;
      case "RESOLVE_COMPONENTS": {
        const resolutionStartTime = performance.now();

        try {
          if (verbose) {
            logger.info(
              `[rsc-worker] Resolving components for route: ${msg.route}`
            );
            logger.info(`[rsc-worker] pagePath: ${msg.pagePath}`);
            logger.info(`[rsc-worker] propsPath: ${msg.propsPath}`);
            logger.info(`[rsc-worker] rootPath: ${msg.rootPath}`);
            logger.info(`[rsc-worker] htmlPath: ${msg.htmlPath}`);
          }

          // Create loader for component resolution
          const loader = createRscWorkerLoader({
            verbose: verbose,
            logger,
            hmrState,
            projectRoot: workerData.userOptions?.projectRoot,
            manifest: workerData.serverManifest || {},
            build: {
              server: userOptions.build?.server || "server",
              client: userOptions.build?.client || "client",
              static: userOptions.build?.static || "static",
              outDir: userOptions.build?.outDir || "dist",
            },
            bundle: workerData.bundle || {},
            clientPattern: userOptions.autoDiscover?.clientPattern,
          });

          // Load components using the unified helper function (caching is handled internally)
          await loadComponentsWithCache({
            pagePath: msg.pagePath,
            propsPath: msg.propsPath,
            rootPath: msg.rootPath,
            htmlPath: msg.htmlPath,
            pageExportName: msg.pageExportName || "default",
            propsExportName: msg.propsExportName || "props",
            rootExportName: msg.rootExportName || "Root",
            htmlExportName: msg.htmlExportName || "Html",
            url: `/${msg.route}`, // Simple URL for component resolution
            loader,
            verbose,
            logger,
          });

          const resolutionTime = performance.now() - resolutionStartTime;

          if (verbose) {
            logger.info(
              `[rsc-worker] Components resolved for route: ${
                msg.route
              } in ${resolutionTime.toFixed(2)}ms`
            );
          }

          // Send success response (without the actual components)
          const response: ComponentsResolvedMessage = {
            type: "COMPONENTS_RESOLVED",
            id: msg.id,
            route: msg.route,
            resolutionTime,
          };

          parentPort?.postMessage(response);
        } catch (error) {
          logger.error(
            `[rsc-worker] Failed to resolve components for route ${msg.route}: ${error}`
          );

          // Send error response
          parentPort?.postMessage({
            type: "ERROR",
            id: msg.id,
            route: msg.route,
            error: toError(error),
          });
        }
        return;
      }
      case "SERVER_ACTION": {
        try {
          // Parse the server action ID to get the file path and export name
          const [filePath, exportName] = msg.id.split("#");
          if (!filePath || !exportName) {
            throw new Error(
              `Invalid server action ID format: ${msg.id}. Expected format: "path/to/file.ts#exportName"`
            );
          }
          // Convert the server action ID to a file path
          const actionPath = filePath.startsWith(userOptions.moduleBasePath)
            ? filePath.slice(userOptions.moduleBasePath.length)
            : filePath;
          const fullPath = join(
            workerData.userOptions?.projectRoot,
            actionPath
          );

          // Load the server action module
          const module = await import(fullPath);
          const action = module[exportName];

          if (typeof action !== "function") {
            throw new Error(`Server action not found: ${msg.id}`);
          }

          // Execute the server action
          const result = await action(...msg.args);

          // Send success response
          effectiveHandlers.onServerActionResponse?.(msg.id, result);
        } catch (error: unknown) {
          const errorMessage = toError(error).message;
          // Send error response
          effectiveHandlers.onServerActionResponse?.(
            msg.id,
            undefined,
            errorMessage
          );
        }
        return;
      }
      case "INITIALIZED_REACT_LOADER":
      case "INITIALIZED_CSS_LOADER":
      case "INITIALIZED_ENV_LOADER":
        return;
      case "HMR_UPDATE":
        // Mark the module as invalidated
        hmrState.set(msg.id, {
          timestamp: msg.timestamp || Date.now(),
          invalidated: true,
          routes: msg.routes || [],
        });
        // Notify the main thread that we've processed the update
        effectiveHandlers.onHmrUpdate(msg.id, msg.routes || []);
        return;
      case "ABORT":
        // Abort the stream
        // activeStreams.get(msg.id)?.emit("abort"); // This line was removed as per the new_code
        return;
      case "HMR_CLEANUP":
        // Clear the invalidation state
        hmrState.delete(msg.id);
        // Notify the main thread that we've processed the cleanup
        effectiveHandlers.onHmrAccept(msg.id, msg.routes || []);
        return;
      case "CSS_FILE":
        if (msg.id) {
          // Add to CSS registry
          addCssFileContent(msg.id, msg.content, userOptions);
        }
        effectiveHandlers.onCssFile?.(msg.id, msg.content);
        return;
      case "SERVER_MODULE":
        addModuleId(msg.id, msg.url);
        effectiveHandlers.onServerModule?.(msg.id, msg.url, msg.source);
        return;
      case "MODULE_REQUEST": {
        const { id, path } = msg;
        try {
          const module = await import(
            join(workerData.userOptions?.projectRoot, path)
          );
          effectiveHandlers.onServerModule?.(id, path, module);
        } catch (error) {
          effectiveHandlers.onError(id, toError(error));
        }
        return;
      }
      case "SHUTDOWN": {
        // If id is "*", clean up all render states and worker state
        // activeStreams.forEach((stream, renderId) => { // This line was removed as per the new_code
        //   stream.end();
        //   activeStreams.delete(renderId);
        // });
        // parentPort?.removeAllListeners(); // This line was removed as per the new_code
        effectiveHandlers.onShutdown?.(msg.id);
        // Send SHUTDOWN_COMPLETE message to signal that shutdown is complete
        if (port) {
          sendMessage(
            {
              type: "SHUTDOWN_COMPLETE",
              id: msg.id,
            },
            port
          );
        }
        return;
      }
      default: {
        logger.info(`Unknown message: ${msg.type}`);
        return;
      }
    }
  } catch (error) {
    // Handle panic threshold logic
    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: workerData.userOptions.panicThreshold,
      critical: false,
      context: "RSC Worker Error",
    });
    if (panicError != null) {
      if (port) {
        sendMessage(
          {
            type: "ERROR",
            id: "rsc-worker",
            error: panicError,
          },
          port
        );
      }
      // Don't throw the error - it's already been sent as a message to the main thread
      // The main thread will handle it according to the panic threshold
    }
    // Always send SHUTDOWN_COMPLETE to prevent hanging, regardless of panic threshold
    if (port) {
      sendMessage(
        {
          type: "SHUTDOWN_COMPLETE",
          id: "*",
        },
        port
      );
    }
  }
}
