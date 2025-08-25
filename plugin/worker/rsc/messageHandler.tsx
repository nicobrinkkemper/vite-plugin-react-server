import { parentPort } from "node:worker_threads";
import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { workerData } from "node:worker_threads";
import { join } from "node:path";
import { createRscWorkerLoader } from "./createRscWorkerLoader.js";
import { createRenderToPipeableStreamHandler } from "../../stream/createRenderToPipeableStreamHandler.js";
import type { RscWorkerInputMessage } from "./types.js";
import { toError } from "../../error/toError.js";
import { handleError } from "../../error/handleError.js";
import { createHandlers } from "./handlers.js";
import { addCssFileContent, addModuleId, cssFiles, hmrState } from "./state.js";
import { combineCssFiles, processInlineCssForState } from "../../helpers/createUnifiedCssProcessor.js";
import { routeToURL } from "../../utils/routeToURL.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { userOptions } from "./userOptions.js";
import { React } from "../../vendor/vendor.server.js";
import { sendMessage } from "../sendMessage.js";
import { createModuleResolutionMetrics } from "../../metrics/createModuleResolutionMetrics.js";

const logger = createLogger(workerData.resolvedConfig.logLevel ?? "info");
const verbose = workerData.userOptions.verbose ?? false;

// Track active renders - store the RSC stream for each unique render (id)
const activeRenders = new Map<string, PassThrough>();

// Track active streams by route for reuse
const activeStreamsByRoute = new Map<string, string>(); // route -> streamId

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
        const isHeadless = msg.options.htmlPath === '' || !msg.options.htmlPath;
        const rscVariant = isHeadless ? "rsc-headless" : "rsc-full";
        
        if (verbose) {
          logger.info(`[rsc-worker] Processing ${rscVariant} render for route: ${msg.options.route}`);
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
          projectRoot: workerData.userOptions.projectRoot,
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

        const url = msg.options.url || routeToURL(
          msg.options.route,
          userOptions.moduleBaseURL,
          userOptions.build?.rscOutputPath ?? DEFAULT_CONFIG.BUILD.rscOutputPath
        );

        // Load components exactly like the server environment does
        let PageComponent: any;
        if (msg.options.pagePath) {
          logger.info(`[rsc-worker] Loading page component from: ${msg.options.pagePath}`);
          const pageModule = await loader(
            `${msg.options.pagePath}#${
              msg.options.pageExportName ?? workerData.userOptions.pageExportName
            }`
          );
          PageComponent = pageModule[
            msg.options.pageExportName ?? workerData.userOptions.pageExportName
          ] as any;
        } else {
          throw new Error(`[rsc-worker] No pagePath provided`);
        }
        
        if (verbose) {
          logger.info(`[rsc-worker] Page component loaded: ${typeof PageComponent}`);
        }

        let RootComponent: any;
        if (msg.options.rootPath) {
          logger.info(`[rsc-worker] Loading root component from: ${msg.options.rootPath}`);
          RootComponent = ((
              await loader(
                `${msg.options.rootPath}#${
                  msg.options.rootExportName ?? workerData.userOptions.rootExportName
                }`
              )
            )[
              msg.options.rootExportName ?? workerData.userOptions.rootExportName
            ] as any);
        } else {
          // Use default Root component like server environment
          try {
            const { Root } = await import("../../components/root.js");
            RootComponent = Root;
            if (verbose) {
              logger.info(`[rsc-worker] Using default Root component`);
            }
          } catch (error) {
            logger.warn(`[rsc-worker] Error loading default Root component: ${error}`);
          }
        }

        let HtmlComponent: any;
        if (msg.options.htmlPath === '') {
          HtmlComponent = React.Fragment; // Empty string = headless (no HTML wrapper)
        } else if (msg.options.htmlPath) {
          logger.info(`[rsc-worker] Loading html component from: ${msg.options.htmlPath}`);
          HtmlComponent = ((
              await loader(
                `${msg.options.htmlPath}#${
                  msg.options.htmlExportName ?? workerData.userOptions.htmlExportName
                }`
              )
            )[
              msg.options.htmlExportName ?? workerData.userOptions.htmlExportName
            ] as any);
        } else {
          // Use default Html component like server environment
          try {
            const { Html } = await import("../../components/html.js");
            HtmlComponent = Html;
            if (verbose) {
              logger.info(`[rsc-worker] Using default Html component`);
            }
          } catch (error) {
            logger.warn(`[rsc-worker] Error loading default Html component: ${error}`);
          }
        }

        // Load and resolve props exactly like server environment
        let pageProps;
        if (msg.options.propsPath) {
          if (verbose) {
            logger.info(`[rsc-worker] Loading props from: ${msg.options.propsPath}`);
          }
          const propsModule = await loader(
            `${msg.options.propsPath}#${
              msg.options.propsExportName ?? workerData.userOptions.propsExportName
            }`
          );
          const propsFunction = propsModule[
            msg.options.propsExportName ?? workerData.userOptions.propsExportName
          ] as any;
          
          if (verbose) {
            logger.info(`[rsc-worker] Props function type: ${typeof propsFunction}`);
          }
          
          // Call the props function with the URL if it's a function
          if (typeof propsFunction === 'function') {
            if (verbose) {
              logger.info(`[rsc-worker] Calling props function with URL: ${url}`);
            }
            pageProps = await propsFunction(url);
            if (verbose) {
              logger.info(`[rsc-worker] Props result: ${JSON.stringify(pageProps, null, 2)}`);
            }
          } else {
            pageProps = propsFunction;
            if (verbose) {
              logger.info(`[rsc-worker] Using props as object: ${JSON.stringify(pageProps, null, 2)}`);
            }
          }
        } else {
          pageProps = undefined; // Match server environment behavior
          if (verbose) {
            logger.info(`[rsc-worker] No props path, using undefined (matching server behavior)`);
          }
        }

        // Emit module resolution metric after components are loaded
        const moduleResolutionTime = performance.now() - moduleResolutionStartTime;
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
        processInlineCssForState(messageCssFiles, addCssFileContent, userOptions);

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
          projectRoot: workerData.userOptions.projectRoot,
          moduleBase: userOptions.moduleBase || "",
          moduleBasePath: userOptions.moduleBasePath || "",
          moduleBaseURL: userOptions.moduleBaseURL || "/",
          moduleRootPath: userOptions.moduleRootPath || "",
          verbose: msg.options.verbose || verbose,
          logger,
          panicThreshold: msg.options.panicThreshold || "none",
          rscTimeout: msg.options.rscTimeout,
          serverPipeableStreamOptions: msg.options.serverPipeableStreamOptions,
          onEvent: userOptions.onEvent,
          onMetrics: userOptions.onMetrics,
        };

        // Use the same createRenderToPipeableStreamHandler as server environment
        try {
          const result = createRenderToPipeableStreamHandler(handlerOptions);
          
          // Track headless streams by route for potential reuse
          if (isHeadless) {
            activeStreamsByRoute.set(msg.options.route, msg.id);
            if (verbose) {
              logger.info(`[rsc-worker] Tracked headless stream ${msg.id} for route: ${msg.options.route}`);
            }
          }
          
          // Process the stream using the handlers
          const streamId = msg.id;
          const passThrough = result.rscStream;
          
          // Set up stream event handlers
          if (passThrough) {
            passThrough.on("data", (chunk) => {
              if (verbose) {
                logger.info(`[rsc-worker] RSC stream data chunk: ${chunk.length} bytes`);
              }
              effectiveHandlers.onData(streamId, chunk);
            });
            
            passThrough.on("end", () => {
              if (verbose) {
                logger.info(`[rsc-worker] RSC stream ended`);
              }
              effectiveHandlers.onEnd(streamId);
              cleanupRender(streamId);
            });
            
            passThrough.on("error", (error) => {
              if (verbose) {
                logger.error(`[rsc-worker] RSC stream error: ${error.message}`);
              }
              effectiveHandlers.onError(streamId, toError(error));
              cleanupRender(streamId);
            });
          }
          
          // Send RSC_RENDER_START control message
          effectiveHandlers.onRscRender(streamId, msg);
          
          return result;
        } catch (error) {
          effectiveHandlers.onError(msg.id, toError(error));
          cleanupRender(msg.id);
          return;
        }
      case "RESOLVE_COMPONENTS": {
        // This case is now handled by createHandlerOptions
        if (verbose) {
          logger.info(`[rsc-worker] RESOLVE_COMPONENTS case - now handled by createHandlerOptions`);
        }
        break;
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
          const fullPath = join(workerData.userOptions.projectRoot, actionPath);

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
          effectiveHandlers.onServerActionResponse?.(msg.id, undefined, errorMessage);
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
            join(workerData.userOptions.projectRoot, path)
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
