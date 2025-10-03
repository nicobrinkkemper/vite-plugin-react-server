import { parentPort, workerData } from "node:worker_threads";
import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { join } from "node:path";
import { createRscWorkerLoader } from "./createRscWorkerLoader.js";
import { handleRscRender } from "./handleRscRender.js";
import type {
  RscWorkerInputMessage,
  ComponentsResolvedMessage,
} from "./types.js";
import { toError } from "../../error/toError.js";

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
import { Root as DefaultRoot } from "../../components/root.js";
import { workerUserOptions } from "./workerUserOptions.js";
import { hydrateUserOptions } from "../../helpers/hydrateUserOptions.js";
import { React } from "../../vendor/vendor.server.js";
import { sendMessage } from "../sendMessage.js";
import { createModuleResolutionMetrics } from "../../metrics/createModuleResolutionMetrics.js";

const logger = createLogger(workerData.resolvedConfig?.logLevel ?? "info");
const verbose = workerData.userOptions.verbose ?? false;

// Add uncaught exception handler to catch React rendering errors
process.on("uncaughtException", (error) => {
  if (verbose) {
    logger?.error(`[RSC-WORKER] Uncaught exception: ${error.message}`, {
      error,
    });
  }

  // Send error through control port if we have active handlers
  if (parentPort) {
    parentPort.postMessage({
      type: "ERROR",
      id: "uncaught-exception",
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      context: "Uncaught Exception in RSC Worker",
    });
  }

  // Exit the worker with error code
  process.exit(1);
});

// Render state to track user options per render ID
const renderStates = new Map<
  string,
  {
    userOptions: any;
    initialized: boolean;
  }
>();

// Cache for fallback user options to avoid re-hydrating
let fallbackUserOptions: any = null;

// Helper function to get user options for a specific render
function getUserOptions(renderId?: string) {
  // If we have a render ID and it's initialized, use the render-specific options
  if (renderId && renderStates.has(renderId)) {
    const renderState = renderStates.get(renderId)!;
    if (renderState.initialized) {
      return renderState.userOptions;
    }
  }

  // Use cached fallback if available
  if (fallbackUserOptions) {
    return fallbackUserOptions;
  }

  // Fallback to workerData userOptions if no render-specific options are available
  const userOptionsResult = hydrateUserOptions(workerData.userOptions);
  if (userOptionsResult.type === "error") {
    throw userOptionsResult.error;
  }
  // Cache the result
  fallbackUserOptions = userOptionsResult.userOptions;
  if (verbose) {
    logger?.info(
      `[FALLBACK] Using fallback userOptions for renderId: ${
        renderId || "none"
      }`
    );
    logger?.info(
      `[FALLBACK] fallbackUserOptions.build: ${JSON.stringify(
        fallbackUserOptions.build
      )}`
    );
  }
  return fallbackUserOptions;
}

// Helper function to set user options for a specific render
function setRenderUserOptions(renderId: string, userOptions: any) {
  renderStates.set(renderId, {
    userOptions,
    initialized: true,
  });
}

// Helper function to cleanup render state
function cleanupRenderState(renderId: string) {
  renderStates.delete(renderId);
}

// Track active renders - store the RSC stream for each unique render (id)
const activeRenders = new Map<string, PassThrough>();

// Global variable to store the correct build configuration from INIT case
// let correctBuildConfig: any = null;

// Track active streams by route for reuse
const activeStreamsByRoute = new Map<string, string>(); // route -> streamId

// Track headless stream elements by stream ID for reuse in full streams
const headlessStreamElements = new Map<string, any>(); // streamId -> React elements

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

    // Clean up reusable elements only if we know which headless stream this full stream consumed
    // The caller should tell us which headless stream to clean up, not infer from ID patterns
    // Note: Element cleanup should be handled explicitly by the stream reuse system
  }

  // Clean up render state
  cleanupRenderState(id);
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
    url,
    loader,
    verbose,
    logger,
  } = options;

  let PageComponent: any;
  let pageProps: any;
  let RootComponent: any;
  let HtmlComponent: any;

  // Load page and props using the unified helper
  if (verbose) {
    logger?.info(
      `[loadComponentsWithCache] pagePath=${pagePath}, propsPath=${propsPath}, url=${url}`
    );
  }
  if (pagePath) {
    if (verbose) {
      logger?.info(
        `[loadComponentsWithCache] Loading page and props for pagePath=${pagePath}`
      );
    }
    try {
      const pageAndPropsResult = await resolvePageAndProps({
        pagePath,
        propsPath,
        pageExportName,
        propsExportName,
        url,
        loader,
        verbose: verbose || false,
        logger,
      });

      if (verbose) {
        logger?.info(
          `[loadComponentsWithCache] pageAndPropsResult for ${pagePath}:`,
          pageAndPropsResult
        );
      }

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
          if (verbose) {
            logger?.info(`[rsc-worker] Loaded pageProps:`, pageProps);
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
    } catch (error) {
      if (verbose) {
        logger?.error(
          `[loadComponentsWithCache] Failed to resolve page and props for ${pagePath}`,
          { error }
        );
      }
      // Handle error gracefully - use fallback components
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
    // No rootPath provided - use built-in default Root component
    RootComponent = DefaultRoot;
    if (verbose) {
      logger?.info(`[rsc-worker] Using built-in default Root component`);
    }
  }

  // Load Html component
  if (verbose) {
    logger?.info(`[rsc-worker] Html component resolution: htmlPath='${htmlPath}' (type: ${typeof htmlPath})`);
  }
  
  if (htmlPath === "") {
    HtmlComponent = React.Fragment; // Empty string = explicitly headless (no HTML wrapper)
    if (verbose) {
      logger?.info(`[rsc-worker] Using headless Html component (empty string)`);
    }
  } else if (htmlPath === undefined) {
    // undefined = use default HTML component
    if (verbose) {
      logger?.info(`[rsc-worker] htmlPath is undefined, using default Html component`);
    }
    try {
      const { Html } = await import("../../components/html.js");
      HtmlComponent = Html;
      if (verbose) {
        logger?.info(`[rsc-worker] Successfully loaded default Html component`);
      }
    } catch (error) {
      logger?.warn(
        `[rsc-worker] Error loading default Html component: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      HtmlComponent = React.Fragment; // Fallback to headless if default fails
    }
  } else if (htmlPath) {
    if (verbose) {
      logger?.info(`[rsc-worker] Attempting to load custom Html component from: ${htmlPath}`);
    }
    const htmlId = `${htmlPath}#${htmlExportName}`;
    if (hasCachedComponent(htmlId)) {
      HtmlComponent = getCachedComponent(htmlId);
      if (verbose) {
        logger?.info(
          `[rsc-worker] Using cached Html component from: ${htmlPath}`
        );
      }
    } else {
      if (verbose) {
        logger?.info(`[rsc-worker] Component not cached, calling resolveComponent with path: ${htmlPath}, exportName: ${htmlExportName}`);
      }
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
        // Handle component resolution failure gracefully (same as server environment)
        if (verbose) {
          logger?.warn(
            `[rsc-worker] Failed to load Html component from ${htmlPath}: ${htmlResult.error?.message || 'Unknown error'}`
          );
          logger?.warn(`[rsc-worker] Html resolution error details:`, htmlResult.error);
        }
        // Use React.Fragment as fallback (same as server environment)
        HtmlComponent = React.Fragment;
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

/**
 * Main message handler for RSC worker thread.
 *
 * **Purpose**: Processes messages from the main thread and handles RSC stream creation,
 * component resolution, and error handling in the worker thread.
 *
 * **Key Responsibilities**:
 * - **Component Resolution**: Loads and caches React components for routes
 * - **RSC Stream Creation**: Creates React Server Component streams using ReactDOMServer
 * - **Error Handling**: Catches React rendering errors and communicates them to main thread
 * - **Stream Reuse**: Manages headless stream element reuse for performance optimization
 * - **Lifecycle Management**: Handles worker initialization, shutdown, and cleanup
 *
 * **Error Handling Strategy**:
 * - React rendering errors are caught by ReactDOMServer.onError callback
 * - Errors are sent to main thread via control port with context information
 * - Uncaught exceptions are handled by process.on('uncaughtException') handler
 * - Main thread decides panic behavior based on panicThreshold configuration
 *
 * @param msg - Message from main thread (INIT, RESOLVE_COMPONENTS, SHUTDOWN, etc.)
 * @param port - MessagePort for communication (defaults to parentPort)
 */
// Store ports for consistent two-port communication
let storedFromWorker: any;
let storedToWorker: any;

export async function messageHandler(
  msg: RscWorkerInputMessage
) {
  // Store ports from INIT message for consistent two-port communication
  if (msg.type === "INIT") {
    storedFromWorker = msg.dataPort;    // dataPort: worker → main (for streaming data out)
    storedToWorker = msg.controlPort;   // controlPort: main → worker (for control messages in)
  }

  // Create handlers for two-port communication using stored ports
  const effectiveHandlers = createHandlers(storedFromWorker, storedToWorker);

  try {
    if (verbose) {
      logger.info(
        `[rsc-worker] Received message: ${msg.type} for id: ${msg.id}`
      );
    }

    switch (msg.type) {
      case "INIT":
        // Use the ID from options if provided, otherwise fall back to msg.id
        const currentStreamId = msg.options.id || msg.id;

        // Initialize render-specific user options from init message
        const renderUserOptions = workerUserOptions(msg.options);
        setRenderUserOptions(currentStreamId, renderUserOptions);
        if (verbose) {
          logger?.info(
            `[INIT] Set render state for renderId: ${currentStreamId}`
          );
          logger?.info(
            `[INIT] renderUserOptions.build: ${JSON.stringify(
              renderUserOptions.build
            )}`
          );
        }

        // Cache user options to avoid repeated getUserOptions calls
        const userOptions = renderUserOptions;

        // Clean up any previous render for this id
        cleanupRender(currentStreamId);

        // Determine if this is a headless RSC stream (no HTML wrapper)
        // undefined = use default HTML component, "" = explicitly headless
        const isHeadless = msg.options.htmlPath === "";
        const rscVariant = isHeadless ? "rsc-headless" : "rsc-full";

        if (verbose) {
          logger.info(
            `[rsc-worker] Processing ${rscVariant} render for route: ${msg.options.route} with ID: ${currentStreamId}`
          );
        }

        // Create a new PassThrough stream for this render, or use the one provided
        const rscStream = (msg as any).rscStream || new PassThrough();
        activeRenders.set(currentStreamId, rscStream);

        // Start measuring module resolution time from first module load
        const moduleResolutionStartTime = performance.now();

        // Load modules (page, props, and components together) - same as server environment
        const projectRoot = msg.options.projectRoot || userOptions.projectRoot || workerData.userOptions?.projectRoot || process.cwd();
        const buildConfig = {
          server:
            msg.options.build?.server || userOptions.build?.server || DEFAULT_CONFIG.BUILD.server,
          client:
            msg.options.build?.client || userOptions.build?.client || DEFAULT_CONFIG.BUILD.client,
          static:
            msg.options.build?.static || userOptions.build?.static || DEFAULT_CONFIG.BUILD.static,
          outDir:
            msg.options.build?.outDir || userOptions.build?.outDir || DEFAULT_CONFIG.BUILD.outDir,
          assetsDir: 
            msg.options.build?.assetsDir || userOptions.build?.assetsDir || DEFAULT_CONFIG.BUILD.assetsDir,
          rscOutputPath:
            msg.options.build?.rscOutputPath || userOptions.build?.rscOutputPath || DEFAULT_CONFIG.BUILD.rscOutputPath,
          htmlOutputPath:
            msg.options.build?.htmlOutputPath || userOptions.build?.htmlOutputPath || DEFAULT_CONFIG.BUILD.htmlOutputPath,
          preserveModulesRoot: 
            msg.options.build?.preserveModulesRoot || userOptions.build?.preserveModulesRoot || DEFAULT_CONFIG.BUILD.preserveModulesRoot,
        };
        const serverManifest = workerData.serverManifest || msg.options.manifest || {};

        // Always log build config for debugging
        if (verbose) {
          logger?.info(
            `[rsc-worker:${msg.options.route}] 
msg.options.build: ${JSON.stringify(msg.options.build)}
msg.options.route
userOptions.build: ${JSON.stringify(userOptions.build)}
final buildConfig: ${JSON.stringify(buildConfig)}`
          );
        }
        const loader = createRscWorkerLoader({
          verbose: msg.options.verbose ?? workerData.userOptions.verbose,
          logger,
          projectRoot,
          manifest: serverManifest,
          build: buildConfig,
          // bundle: workerData.bundle || {},
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
        if (verbose) {
          logger?.info(`[rsc-worker:messageHandler] Component paths for route ${msg.options.route}:`);
          logger?.info(`  pagePath: ${msg.options.pagePath}`);
          logger?.info(`  propsPath: ${msg.options.propsPath}`);
          logger?.info(`  rootPath: ${msg.options.rootPath}`);
          logger?.info(`  htmlPath: ${msg.options.htmlPath}`);
        }

        const { PageComponent, pageProps, RootComponent, HtmlComponent } =
          await loadComponentsWithCache({
            pagePath: msg.options.pagePath,
            propsPath: msg.options.propsPath,
            rootPath: msg.options.rootPath,
            htmlPath: msg.options.htmlPath,
            pageExportName:
              msg.options.pageExportName ?? userOptions.pageExportName,
            propsExportName:
              msg.options.propsExportName ?? userOptions.propsExportName,
            rootExportName:
              msg.options.rootExportName ?? userOptions.rootExportName,
            htmlExportName:
              msg.options.htmlExportName ?? userOptions.htmlExportName,
            url,
            loader,
            verbose,
            logger,
          });

        if (verbose) {
          logger.info(
            `[rsc-worker] Loaded components for route ${msg.options.route}:`
          );
          logger.info(`[rsc-worker] - PageComponent: ${typeof PageComponent}`);
          logger.info(`[rsc-worker] - pageProps: ${JSON.stringify(pageProps)}`);
          logger.info(`[rsc-worker] - RootComponent: ${typeof RootComponent}`);
          logger.info(`[rsc-worker] - HtmlComponent: ${typeof HtmlComponent}`);
        }

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
            const options =
              msg.options.serverPipeableStreamOptions ||
              workerData.userOptions?.serverPipeableStreamOptions;

            if (verbose) {
              logger.info(
                `[rsc-worker] ${
                  isHeadless ? "Headless" : "Full"
                } stream serverPipeableStreamOptions: ${JSON.stringify(
                  options
                )}`
              );
            }

            return options;
          })(),
        };

        // Use handleRscRender for proper worker-side rendering
        let result: void;

        // Check if there was a headless error for this route
        const headlessError = headlessStreamErrors.get(msg.options.route);
        const shouldUseFallback = headlessError && !isHeadless;

        // If this is a headless stream, we need to track any errors that occur
        // so that subsequent full streams can use fallback components
        if (isHeadless) {
          // Clear any previous error for this route when starting a new headless stream
          headlessStreamErrors.delete(msg.options.route);
        }

        // Check if we should reuse elements from a previous headless stream
        const shouldReuseElements =
          !isHeadless && msg.options.reuseHeadlessStreamId;
        let reusableElements = null;

        if (shouldReuseElements && msg.options.reuseHeadlessStreamId) {
          // Look up elements directly by the headless stream ID
          reusableElements = headlessStreamElements.get(
            msg.options.reuseHeadlessStreamId
          );
          if (verbose) {
            if (reusableElements) {
              logger.info(
                `[rsc-worker] Found reusable elements from headless stream ${msg.options.reuseHeadlessStreamId}`
              );
            } else if (msg.options.reuseHeadlessStreamId) {
              logger.info(
                `[rsc-worker] No reusable elements found for headless stream ${msg.options.reuseHeadlessStreamId}`
              );
            }
          }
        }

        const isStaticGeneration =
          msg.options.build &&
          (msg.options.build.outDir || msg.options.build.static);

        if (verbose) {
          logger.info(
            `[rsc-worker] Route: ${msg.options.route}, isHeadless: ${isHeadless}, isStaticGeneration: ${isStaticGeneration}`
          );
          logger.info(
            `[rsc-worker] msg.options.build: ${JSON.stringify(
              msg.options.build
            )}`
          );
        }

        if (shouldUseFallback) {
          if (verbose) {
            logger.info(
              `[rsc-worker] Using fallback components due to previous error: ${headlessError.message}`
            );
          }
          // Create a fallback handler with React.Fragment for PageComponent but keep original HtmlComponent
          const fallbackHandlerOptions = {
            ...handlerOptions,
            PageComponent: React.Fragment,
            // Keep the original HtmlComponent to ensure bootstrapScripts are rendered
          };
          result = handleRscRender(
            {
              ...fallbackHandlerOptions,
              id: currentStreamId,
              reuseHeadlessStreamId: msg.options.reuseHeadlessStreamId,
            },
            effectiveHandlers,
            undefined,
            headlessStreamElements,
            headlessStreamErrors
          );
        } else {
          try {
            if (isHeadless) {
              // Headless stream: use HtmlComponent: React.Fragment (no HTML wrapper) but keep RootComponent
              if (verbose) {
                logger.info(
                  `[rsc-worker] Creating headless RSC stream for route ${msg.options.route} (no HTML wrapper)`
                );
              }

              const headlessHandlerOptions = {
                ...handlerOptions,
                HtmlComponent: React.Fragment, // Headless RSC - no HTML wrapper
              };

              result = handleRscRender(
                {
                  ...headlessHandlerOptions,
                  id: currentStreamId,
                  reuseHeadlessStreamId: msg.options.reuseHeadlessStreamId,
                },
                effectiveHandlers,
                undefined,
                headlessStreamElements,
                headlessStreamErrors
              );
            } else {
              // Full stream: reuse elements from headless stream if available
              if (shouldReuseElements && reusableElements) {
                if (verbose) {
                  logger.info(
                    `[rsc-worker] Creating full RSC stream with reused elements from headless stream for route ${msg.options.route}`
                  );
                }

                // Create handler options that reuse the headless stream's elements
                const reuseHandlerOptions = {
                  ...handlerOptions,
                  PageComponent: (() => reusableElements) as any, // Reuse the headless stream's elements
                };

                result = handleRscRender(
                  {
                    ...reuseHandlerOptions,
                    id: currentStreamId,
                    reuseHeadlessStreamId: msg.options.reuseHeadlessStreamId,
                  },
                  effectiveHandlers,
                  undefined,
                  headlessStreamElements,
                  headlessStreamErrors
                );
              } else {
                // No reusable elements - create normal full stream
                if (verbose) {
                  logger.info(
                    `[rsc-worker] Creating full RSC stream for route ${msg.options.route} (no element reuse)`
                  );
                }
                result = handleRscRender(
                  {
                    ...handlerOptions,
                    id: currentStreamId,
                    reuseHeadlessStreamId: msg.options.reuseHeadlessStreamId,
                  },
                  effectiveHandlers,
                  undefined,
                  headlessStreamElements,
                  headlessStreamErrors
                );
              }
            }
          } catch (error) {
            // Handle error the same way as server environment - create fallback with React.Fragment
            if (verbose) {
              logger.warn(
                `[rsc-worker] Original PageComponent failed during creation for route ${msg.options.route}: ${error}`
              );
            }

            // Create a fallback handler with React.Fragment for PageComponent but keep original HtmlComponent
            const fallbackHandlerOptions = {
              ...handlerOptions,
              PageComponent: React.Fragment,
              // Keep the original HtmlComponent to ensure bootstrapScripts are rendered
            };

            result = handleRscRender(
              {
                ...fallbackHandlerOptions,
                id: currentStreamId,
                reuseHeadlessStreamId: msg.options.reuseHeadlessStreamId,
              },
              effectiveHandlers,
              undefined,
              headlessStreamElements,
              headlessStreamErrors
            );
          }
        }

        // Do not automatically track streams for reuse
        // Only full streams that explicitly request reuse of a headless stream will trigger reuse logic
        if (verbose) {
          logger.info(
            `[rsc-worker] Processing single-use stream ${currentStreamId} for route: ${msg.options.route}`
          );
        }

        // Clear any previous error for this route
        clearHeadlessError(msg.options.route);

        // handleRscRender handles everything internally including error handling

        // handleRscRender handles everything internally including error handling and control messages

        return result;
      case "RESOLVE_COMPONENTS": {
        const resolutionStartTime = performance.now();

        // Cache user options to avoid repeated getUserOptions calls
        const resolveUserOptions = getUserOptions(msg.id);

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
          if (verbose) {
            logger?.info(
              `[rsc-worker:${msg.route}] pagePath=${msg.pagePath}, propsPath=${msg.propsPath}`
            );
          }

          // Create loader for component resolution with correct build config
          // Use the render-specific build config from the INIT case
          const buildConfig = {
            server: resolveUserOptions.build?.server || "server",
            client: resolveUserOptions.build?.client || "client",
            static: resolveUserOptions.build?.static || "static",
            outDir: resolveUserOptions.build?.outDir || "dist",
          };

          // Debug log to see what outDir we're using
          if (verbose) {
            logger?.info(
              `[RESOLVE_COMPONENTS] Using outDir: ${buildConfig.outDir}`
            );
            logger?.info(
              `[RESOLVE_COMPONENTS] renderId: ${
                msg.id
              }, hasRenderState: ${renderStates.has(msg.id)}`
            );
            if (renderStates.has(msg.id)) {
              const renderState = renderStates.get(msg.id)!;
              logger?.info(
                `[RESOLVE_COMPONENTS] renderState.initialized: ${renderState.initialized}`
              );
              logger?.info(
                `[RESOLVE_COMPONENTS] renderState.userOptions.build: ${JSON.stringify(
                  renderState.userOptions.build
                )}`
              );
            }
          }

          const loader = createRscWorkerLoader({
            verbose: verbose,
            logger,
            projectRoot: workerData.userOptions?.projectRoot,
            manifest: workerData.serverManifest || {},
            build: buildConfig,
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

          // Always send error to main thread - let main thread decide panic status
          effectiveHandlers.onError(msg.id, toError(error), {
            route: msg.route,
            context: `Component resolution failed for route ${msg.route}`,
          });
        }
        return;
      }
      case "SERVER_ACTION": {
        try {
          // Cache user options to avoid repeated getUserOptions calls
          const serverActionUserOptions = getUserOptions();

          // Parse the server action ID to get the file path and export name
          const [filePath, exportName] = msg.id.split("#");
          if (!filePath || !exportName) {
            throw new Error(
              `Invalid server action ID format: ${msg.id}. Expected format: "path/to/file.ts#exportName"`
            );
          }
          // Convert the server action ID to a file path
          const actionPath = filePath.startsWith(
            serverActionUserOptions.moduleBasePath
          )
            ? filePath.slice(serverActionUserOptions.moduleBasePath.length)
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
          // Cache user options to avoid repeated getUserOptions calls
          const cssFileUserOptions = getUserOptions();
          // Add to CSS registry
          addCssFileContent(msg.id, msg.content, cssFileUserOptions);
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
        logger?.info(`[SHUTDOWN] Received shutdown message with id: ${msg.id}`);
        
        // If id is "*", clean up all render states and worker state
        // activeStreams.forEach((stream, renderId) => { // This line was removed as per the new_code
        //   stream.end();
        //   activeStreams.delete(renderId);
        // });
        // parentPort?.removeAllListeners(); // This line was removed as per the new_code
        effectiveHandlers.onShutdown?.(msg.id);
        // Send SHUTDOWN_COMPLETE message to signal that shutdown is complete
        if (parentPort) {
          logger?.info(`[SHUTDOWN] Sending SHUTDOWN_COMPLETE message with id: ${msg.id}`);
          sendMessage(
            {
              type: "SHUTDOWN_COMPLETE",
              id: msg.id,
            },
            parentPort
          );
        } else {
          logger?.warn(`[SHUTDOWN] No parentPort available to send SHUTDOWN_COMPLETE`);
        }
        return;
      }
      default: {
        logger.info(`Unknown message: ${msg.type}`);
        return;
      }
    }
  } catch (error) {
    // Just communicate the error directly - let the main thread handle panic threshold logic
    effectiveHandlers.onError("worker/rsc", toError(error));
    // Always send SHUTDOWN_COMPLETE to prevent hanging
    effectiveHandlers.onShutdown?.("*");
  }
}
