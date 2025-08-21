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
import { routeToURL } from "../../utils/routeToURL.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { userOptions } from "./userOptions.js";
import { createLogger } from "vite";
import { PassThrough } from "node:stream";
import React from "react";
import { sendMessage } from "../sendMessage.js";
import { createModuleResolutionMetrics } from "../../metrics/createModuleResolutionMetrics.js";

const logger = createLogger(workerData.resolvedConfig.logLevel ?? "info");
const verbose = workerData.userOptions.verbose ?? false;

// Track active renders - store the RSC stream for each unique render (id)
const activeRenders = new Map<string, PassThrough>();

function cleanupRender(id: string) {
  const rscStream = activeRenders.get(id);
  if (rscStream) {
    rscStream.destroy();
    activeRenders.delete(id);
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
            outDir: userOptions.build?.outDir || "dist",
          },
          bundle: workerData.bundle || {},
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

        // Load the components using the loader
        const pageModule = await loader(
          `${msg.pagePath}#${
            msg.pageExportName ?? workerData.userOptions.pageExportName
          }`
        );
        const PageComponent = pageModule[
          msg.pageExportName ?? workerData.userOptions.pageExportName
        ] as any;

        // Emit module resolution metric after first module is loaded

        const RootComponent = msg.rootPath
          ? ((
              await loader(
                `${msg.rootPath}#${
                  msg.rootExportName ?? workerData.userOptions.rootExportName
                }`
              )
            )[
              msg.rootExportName ?? workerData.userOptions.rootExportName
            ] as any)
          : undefined; // undefined = use default Root component (handled by hydrateRscRenderMessage)

        const HtmlComponent = msg.htmlPath === ''
          ? React.Fragment // Empty string = headless (no HTML wrapper)
          : msg.htmlPath
          ? ((
              await loader(
                `${msg.htmlPath}#${
                  msg.htmlExportName ?? workerData.userOptions.htmlExportName
                }`
              )
            )[
              msg.htmlExportName ?? workerData.userOptions.htmlExportName
            ] as any)
          : undefined; // undefined = use default HTML component (handled by hydrateRscRenderMessage)

        // Load and resolve props properly
        let pageProps;
        if (msg.propsPath) {
          const propsModule = await loader(
            `${msg.propsPath}#${
              msg.propsExportName ?? workerData.userOptions.propsExportName
            }`
          );
          const propsFunction = propsModule[
            msg.propsExportName ?? workerData.userOptions.propsExportName
          ] as any;
          
          // Call the props function with the URL if it's a function
          if (typeof propsFunction === 'function') {
            pageProps = propsFunction(url);
          } else {
            pageProps = propsFunction;
          }
        } else {
          pageProps = { url };
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
        // Consolidate CSS handling: Add CSS files from message to stateful CSS system
        if (msg.cssFiles && msg.cssFiles.size > 0) {
          if (verbose) {
            logger.info(`[rsc-worker] Adding ${msg.cssFiles.size} CSS files to stateful system`);
          }
          for (const [id, cssContent] of msg.cssFiles.entries()) {
            if (verbose) {
              logger.info(`[rsc-worker] CSS file ${id}: as=${cssContent.as}, children=${typeof cssContent.children}`);
            }
            if (cssContent.children && typeof cssContent.children === 'string') {
              // Add inline CSS to stateful system
              addCssFileContent(id, cssContent.children, userOptions);
              if (verbose) {
                logger.info(`[rsc-worker] Added CSS file ${id} to stateful system`);
              }
            }
          }
        }

        // Also add global CSS files from message to stateful CSS system
        if (msg.globalCss && msg.globalCss.size > 0) {
          if (verbose) {
            logger.info(`[rsc-worker] Adding ${msg.globalCss.size} global CSS files to stateful system`);
          }
          for (const [id, cssContent] of msg.globalCss.entries()) {
            if (verbose) {
              logger.info(`[rsc-worker] Global CSS file ${id}: as=${cssContent.as}, children=${typeof cssContent.children}`);
            }
            if (cssContent.children && typeof cssContent.children === 'string') {
              // Add global CSS to stateful system
              addCssFileContent(id, cssContent.children, userOptions);
              if (verbose) {
                logger.info(`[rsc-worker] Added global CSS file ${id} to stateful system`);
              }
            }
          }
        }

        // Consolidate CSS handling: Use stateful CSS system for cssFiles, keep globalCss separate
        const messageWithCss = {
          ...msg,
          cssFiles,
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
            cssFiles: cssFiles, // Use stateful CSS system
            globalCss: msg.globalCss ?? new Map(), // Keep global CSS separate from stateful system
          },
          { userOptions }
        );

        // Pass the rscStream to handleRscRender with proper CSS separation
        try {
          const result = handleRscRender(
            {
              ...hydratedMessage,
              cssFiles: cssFiles, // Use stateful CSS system
              globalCss: msg.globalCss ?? new Map(), // Keep global CSS separate from stateful system
            },
            handlers
          );
          return result;
        } catch (error) {
          handlers.onError(msg.id, toError(error));
          cleanupRender(msg.id);
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
