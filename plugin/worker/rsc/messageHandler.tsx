import { parentPort } from "node:worker_threads";
import { createRscWorkerLoader } from "./createRscWorkerLoader.js";
import { hydrateRscRenderMessage } from "./hydrateRscRenderMessage.js";
import { handleRscRender } from "./handleRscRender.js";
import { toError } from "../../error/toError.js";
import { handleError } from "../../error/handleError.js";
import { join } from "node:path";
import { workerData } from "node:worker_threads";
import type { RscWorkerInputMessage } from "./types.js";
import { addCssFileContent, addModuleId, cssFiles, hmrState } from "./state.js";
import { handlers } from "./handlers.js";
import { combineCssFiles, processInlineCssForState } from "../../helpers/createUnifiedCssProcessor.js";
import { routeToURL } from "../../utils/routeToURL.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { userOptions } from "./userOptions.js";
import { createLogger } from "vite";
import { PassThrough } from "node:stream";
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
  try {
    if (verbose) {
      logger.info(
        `[rsc-worker] Received message: ${msg.type} for id: ${msg.id}`
      );
    }

    switch (msg.type) {
      case "RSC_RENDER":
        // Clean up any previous render for this id
        cleanupRender(msg.id);

        // Determine if this is a headless or full RSC request
        const isHeadless = msg.htmlPath === '' || !msg.htmlPath;
        const rscVariant = isHeadless ? "rsc-headless" : "rsc-full";
        
        if (verbose) {
          logger.info(`[rsc-worker] Processing ${rscVariant} render for route: ${msg.route}`);
        }
        
        // Check if we can reuse an active headless stream for full page rendering
        if (!isHeadless) {
          const existingStreamId = activeStreamsByRoute.get(msg.route);
          if (existingStreamId && activeRenders.has(existingStreamId)) {
            if (verbose) {
              logger.info(`[rsc-worker] Reusing active headless stream ${existingStreamId} for full page render of route: ${msg.route}`);
            }
            
            // Reuse the existing stream directly
            if (verbose) {
              logger.info(`[rsc-worker] Reusing active headless stream ${existingStreamId} for full page render of route: ${msg.route}`);
            }
            // For now, just fall through to fresh render
            // TODO: Implement actual stream reuse logic
          }
        }

        // Create a new PassThrough stream for this render
        const rscStream = new PassThrough();
        activeRenders.set(msg.id, rscStream);

        // Start measuring module resolution time from first module load
        const moduleResolutionStartTime = performance.now();

        // Load modules (page, props, and components together)
        const loader = createRscWorkerLoader({
          verbose: msg.verbose ?? workerData.userOptions.verbose,
          logger,
          hmrState,
          projectRoot: workerData.userOptions.projectRoot,
          manifest: msg.manifest || workerData.serverManifest || {},
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
          msg.url ??
          routeToURL(
            msg.route,
            userOptions.moduleBaseURL,
            userOptions.build?.rscOutputPath ??
              DEFAULT_CONFIG.BUILD.rscOutputPath
          );

        const intermediateHandlerOptions = {
          url,
          pagePath: msg.pagePath,
          propsPath: msg.propsPath,
          rootPath: msg.rootPath,
          htmlPath: msg.htmlPath, // Ensure htmlPath is passed through
          pageExportName:
            msg.pageExportName ?? workerData.userOptions.pageExportName,
          propsExportName:
            msg.propsExportName ?? workerData.userOptions.propsExportName,
          rootExportName:
            msg.rootExportName ?? workerData.userOptions.rootExportName,
          htmlExportName:
            msg.htmlExportName ?? workerData.userOptions.htmlExportName,
          moduleRootPath: userOptions.moduleRootPath,
          moduleBasePath: userOptions.moduleBasePath,
          moduleBaseURL: userOptions.moduleBaseURL,
          projectRoot: userOptions.projectRoot,
          verbose: msg.verbose ?? userOptions.verbose,
          logger,
          userOptions,
          loader,
          hmrState,
          route: msg.route,
          id: msg.id,
          rscTimeout: msg.rscTimeout ?? userOptions.rscTimeout,
          build: msg.build ?? userOptions.build,
          manifest: msg.manifest || {}, // Add manifest for client component resolution
          // Add component overrides from the message
          HtmlComponent: msg.HtmlComponent,
          RootComponent: msg.RootComponent,
          // Add missing required properties
          normalizer: userOptions.normalizer,
          onEvent: userOptions.onEvent,
          onMetrics: userOptions.onMetrics,
          autoDiscover: userOptions.autoDiscover,
          css: userOptions.css,
          moduleBase: userOptions.moduleBase,
          moduleID: userOptions.moduleID,
          panicThreshold: userOptions.panicThreshold,
          cssFiles: msg.cssFiles ?? new Map(),
          globalCss: msg.globalCss ?? new Map(),
          htmlTimeout: userOptions.htmlTimeout,
          fileWriteTimeout: userOptions.fileWriteTimeout,
          workerShutdownTimeout: userOptions.workerShutdownTimeout,
          rscWorkerPath: userOptions.rscWorkerPath,
          htmlWorkerPath: userOptions.htmlWorkerPath,
          publicOrigin: userOptions.publicOrigin,
          serverPipeableStreamOptions: userOptions.serverPipeableStreamOptions,
          clientPipeableStreamOptions: userOptions.clientPipeableStreamOptions,
          components: userOptions.components,
        };

        if (verbose) {
          logger.info(
            `[rsc-worker] htmlPath from message: "${
              msg.htmlPath
            }" (type: ${typeof msg.htmlPath})`
          );
          logger.info(
            `[rsc-worker] htmlPath in options: "${
              intermediateHandlerOptions.htmlPath
            }" (type: ${typeof intermediateHandlerOptions.htmlPath})`
          );
          logger.info(
            `[rsc-worker] CSS files from message: ${msg.cssFiles?.size || 0} files`
          );
          logger.info(
            `[rsc-worker] Global CSS from message: ${msg.globalCss?.size || 0} files`
          );
        }

        // Use pre-resolved components if available, otherwise load them
        let PageComponent: any;
        if (msg.PageComponent) {
          if (verbose) {
            logger.info(`[rsc-worker] Using pre-resolved page component`);
          }
          PageComponent = msg.PageComponent;
        } else if (msg.pagePath) {
          if (verbose) {
            logger.info(`[rsc-worker] Loading page component from: ${msg.pagePath}`);
          }
          const pageModule = await loader(
            `${msg.pagePath}#${
              msg.pageExportName ?? workerData.userOptions.pageExportName
            }`
          );
          PageComponent = pageModule[
            msg.pageExportName ?? workerData.userOptions.pageExportName
          ] as any;
        } else {
          throw new Error(`[rsc-worker] No PageComponent or pagePath provided`);
        }
        
        if (verbose) {
          logger.info(`[rsc-worker] Page component loaded: ${typeof PageComponent}`);
        }

        // Emit module resolution metric after first module is loaded

        let RootComponent: any;
        if (msg.RootComponent !== undefined) {
          logger.info(`[rsc-worker] Using pre-resolved root component`);
          RootComponent = msg.RootComponent;
        } else if (msg.rootPath) {
          logger.info(`[rsc-worker] Loading root component from: ${msg.rootPath}`);
          RootComponent = ((
              await loader(
                `${msg.rootPath}#${
                  msg.rootExportName ?? workerData.userOptions.rootExportName
                }`
              )
            )[
              msg.rootExportName ?? workerData.userOptions.rootExportName
            ] as any);
        } else {
          RootComponent = undefined; // undefined = use default Root component (handled by hydrateRscRenderMessage)
        }

        let HtmlComponent: any;
        if (msg.HtmlComponent !== undefined) {
          logger.info(`[rsc-worker] Using pre-resolved html component`);
          HtmlComponent = msg.HtmlComponent;
        } else if (msg.htmlPath === '') {
          HtmlComponent = React.Fragment; // Empty string = headless (no HTML wrapper)
        } else if (msg.htmlPath) {
          logger.info(`[rsc-worker] Loading html component from: ${msg.htmlPath}`);
          HtmlComponent = ((
              await loader(
                `${msg.htmlPath}#${
                  msg.htmlExportName ?? workerData.userOptions.htmlExportName
                }`
              )
            )[
              msg.htmlExportName ?? workerData.userOptions.htmlExportName
            ] as any);
        } else {
          HtmlComponent = undefined; // undefined = use default HTML component (handled by hydrateRscRenderMessage)
        }

        // Load and resolve props properly - same as renderPage.server.ts
        let pageProps;
        if (msg.propsPath) {
          if (verbose) {
            logger.info(`[rsc-worker] Loading props from: ${msg.propsPath}`);
          }
          const propsModule = await loader(
            `${msg.propsPath}#${
              msg.propsExportName ?? workerData.userOptions.propsExportName
            }`
          );
          const propsFunction = propsModule[
            msg.propsExportName ?? workerData.userOptions.propsExportName
          ] as any;
          
          if (verbose) {
            logger.info(`[rsc-worker] Props function type: ${typeof propsFunction}`);
            logger.info(`[rsc-worker] Props function: ${propsFunction}`);
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
          pageProps = { url };
          if (verbose) {
            logger.info(`[rsc-worker] No props path, using default: ${JSON.stringify(pageProps, null, 2)}`);
          }
        }
        const moduleResolutionTime =
          performance.now() - moduleResolutionStartTime;
        if (handlers.onMetrics) {
          const moduleResolutionMetric = createModuleResolutionMetrics({
            route: msg.route,
            workerType: "rsc",
            resolutionTime: moduleResolutionTime,
            fromMainThread: false,
            fromRscWorker: true,
            fromHtmlWorker: false,
            description: `Module resolution for route ${msg.route}`,
          });
          handlers.onMetrics(msg.id, moduleResolutionMetric);
        }
        // Process CSS files using unified CSS processor
        const messageCssFiles = new Map(msg.cssFiles || []);
        
        // Process inline CSS for stateful system using unified helper
        processInlineCssForState(messageCssFiles, addCssFileContent, userOptions);

        // Combine stateful CSS with message CSS using unified helper
        const combinedCssFiles = combineCssFiles(cssFiles, messageCssFiles);

        const messageWithCss = {
          ...msg,
          cssFiles: combinedCssFiles,
        };

        const hydratedMessage = hydrateRscRenderMessage(
          {
            message: messageWithCss,
            pageProps: pageProps, // Use loaded pageProps
            PageComponent: PageComponent, // Use loaded PageComponent
            RootComponent: RootComponent, // Use loaded RootComponent
            HtmlComponent: HtmlComponent, // Use loaded HtmlComponent
            userOptions,
            logger,
            hmrState,
            manifest: msg.manifest || workerData.serverManifest || {},
          },
          { userOptions }
        );

        // Pass the rscStream to handleRscRender with proper CSS separation
        try {
          const result = handleRscRender(
            {
              ...hydratedMessage,
              cssFiles: combinedCssFiles, // Use stateful CSS system
              globalCss: msg.globalCss ?? new Map(), // Keep global CSS separate from stateful system
            },
            handlers,
            rscStream
          );
          
          // Track headless streams by route for potential reuse
          if (isHeadless) {
            activeStreamsByRoute.set(msg.route, msg.id);
            if (verbose) {
              logger.info(`[rsc-worker] Tracked headless stream ${msg.id} for route: ${msg.route}`);
            }
          }
          
          return result;
        } catch (error) {
          handlers.onError(msg.id, toError(error));
          cleanupRender(msg.id);
          return;
        }
      case "RESOLVE_COMPONENTS": {
        // Start measuring component resolution time
        const resolutionStartTime = performance.now();
        
        if (verbose) {
          logger.info(`[rsc-worker] Resolving components for route: ${msg.route}`);
        }

        try {
          // Create loader for component resolution
          const loader = createRscWorkerLoader({
            verbose: verbose,
            logger,
            hmrState,
            projectRoot: workerData.userOptions.projectRoot,
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

          const url = routeToURL(
            msg.route,
            userOptions.moduleBaseURL,
            userOptions.build?.rscOutputPath ?? DEFAULT_CONFIG.BUILD.rscOutputPath
          );

          // Resolve PageComponent
          let PageComponent;
          if (msg.pagePath) {
            const pageModule = await loader(
              `${msg.pagePath}#${msg.pageExportName ?? workerData.userOptions.pageExportName}`
            );
            PageComponent = pageModule[msg.pageExportName ?? workerData.userOptions.pageExportName];
          }

          // Resolve RootComponent
          let RootComponent;
          if (msg.rootPath) {
            const rootModule = await loader(
              `${msg.rootPath}#${msg.rootExportName ?? workerData.userOptions.rootExportName}`
            );
            RootComponent = rootModule[msg.rootExportName ?? workerData.userOptions.rootExportName];
          }

          // Resolve HtmlComponent
          let HtmlComponent;
          if (msg.htmlPath && msg.htmlPath !== '') {
            const htmlModule = await loader(
              `${msg.htmlPath}#${msg.htmlExportName ?? workerData.userOptions.htmlExportName}`
            );
            HtmlComponent = htmlModule[msg.htmlExportName ?? workerData.userOptions.htmlExportName];
          }

          // Resolve pageProps
          let pageProps: any = { url };
          if (msg.propsPath) {
            const propsModule = await loader(
              `${msg.propsPath}#${msg.propsExportName ?? workerData.userOptions.propsExportName}`
            );
            const propsFunction = propsModule[msg.propsExportName ?? workerData.userOptions.propsExportName];
            
            // Call the props function with the URL if it's a function
            if (typeof propsFunction === 'function') {
              pageProps = propsFunction(url);
            } else {
              pageProps = propsFunction;
            }
          }

          const resolutionTime = performance.now() - resolutionStartTime;

          if (verbose) {
            logger.info(`[rsc-worker] Components resolved for route: ${msg.route} in ${resolutionTime.toFixed(2)}ms`);
          }

          // Send COMPONENTS_RESOLVED message back to main thread
          if (port) {
            sendMessage(
              {
                type: "COMPONENTS_RESOLVED",
                id: msg.id,
                route: msg.route,
                PageComponent,
                pageProps,
                RootComponent,
                HtmlComponent,
                resolutionTime,
              },
              port
            );
          }

          return;
        } catch (error) {
          const resolutionTime = performance.now() - resolutionStartTime;
          logger.error(`[rsc-worker] Failed to resolve components for route ${msg.route}: ${error}`);
          
          // Emit error metrics
          if (handlers.onMetrics) {
            const moduleResolutionMetric = createModuleResolutionMetrics({
              route: msg.route,
              workerType: "rsc",
              resolutionTime,
              fromMainThread: false,
              fromRscWorker: true,
              fromHtmlWorker: false,
              description: `Component resolution failed for route ${msg.route} on RSC worker`,
            });
            handlers.onMetrics(msg.id, moduleResolutionMetric);
          }
          
          // Send error response
          if (port) {
            sendMessage(
              {
                type: "ERROR",
                id: msg.id,
                error: toError(error),
              },
              port
            );
          }
          return;
        }
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
          handlers.onServerActionResponse?.(msg.id, result);
        } catch (error: unknown) {
          const errorMessage = toError(error).message;
          // Send error response
          handlers.onServerActionResponse?.(msg.id, undefined, errorMessage);
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
        handlers.onHmrUpdate(msg.id, msg.routes || []);
        return;
      case "ABORT":
        // Abort the stream
        // activeStreams.get(msg.id)?.emit("abort"); // This line was removed as per the new_code
        return;
      case "HMR_CLEANUP":
        // Clear the invalidation state
        hmrState.delete(msg.id);
        // Notify the main thread that we've processed the cleanup
        handlers.onHmrAccept(msg.id, msg.routes || []);
        return;
      case "CSS_FILE":
        if (msg.id) {
          // Add to CSS registry
          addCssFileContent(msg.id, msg.content, userOptions);
        }
        handlers.onCssFile?.(msg.id, msg.content);
        return;
      case "SERVER_MODULE":
        addModuleId(msg.id, msg.url);
        handlers.onServerModule?.(msg.id, msg.url, msg.source);
        return;
      case "MODULE_REQUEST": {
        const { id, path } = msg;
        try {
          const module = await import(
            join(workerData.userOptions.projectRoot, path)
          );
          handlers.onServerModule?.(id, path, module);
        } catch (error) {
          handlers.onError(id, toError(error));
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
        handlers.onShutdown?.(msg.id);
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
