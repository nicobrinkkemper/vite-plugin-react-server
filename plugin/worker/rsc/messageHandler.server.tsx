import { parentPort, workerData } from "node:worker_threads";
import { PassThrough } from "node:stream";
import { createLogger, type Logger } from "vite";
import { join, relative } from "node:path";
import { createRscWorkerLoader } from "./createRscWorkerLoader.js";
import { handleRscRender } from "./handleRscRender.server.js";
import { setMaxListenersOnPort } from "../../stream/setMaxListeners.js";
import { describeProps } from "../../helpers/describeProps.js";
import { isLoaderSignal } from "../../router/loaderSignals.js";
import type {
  RscWorkerInputMessage,
  ComponentsResolvedMessage,
} from "./types.js";
import { toError } from "../../error/toError.js";
// Import decodeReply for server action argument decoding
import { decodeReply } from "react-server-dom-esm/server";

import { createHandlers } from "./handlers.js";
import {
  addCssFileContent,
  addModuleId,
  referenceGate,
  cssFiles,
  hmrState,
  cacheComponent,
  getCachedComponent,
  hasCachedComponent,
  clearCachedComponent,
  isModuleInvalidated,
  clearAllCachedComponents,
} from "./state.server.js";
import { getRunner, getRpc } from "./runnerInstance.js";
import {
  combineCssFiles,
  processInlineCssForState,
} from "../../helpers/createUnifiedCssProcessor.js";
import { routeToURL } from "../../utils/routeToURL.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { resolvePageAndProps } from "../../helpers/resolvePageAndProps.js";
import {
  resolveLayoutChain,
  type ResolvedLayoutLayer,
} from "../../helpers/resolveLayoutChain.js";
import { matchRoutes, normalizePathForMatch } from "../../router/matchRoute.js";
import { resolveComponent } from "../../helpers/resolveComponent.js";
import { handleError } from "../../error/handleError.js";
import type { PanicThreshold } from "../../types.js";
import type { RouteLayer } from "../../router/scanRoutes.js";
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
 * Load the built-in Html document wrapper (used when the app configures no
 * `html` path). Imported lazily so the static import graph never roots React.
 * A failure here means the plugin's own runtime can't load — never degrade to a
 * headless fragment, which would ship every route without <html>/<head>/<body>.
 */
async function loadDefaultHtml({
  logger,
  panicThreshold,
  verbose,
}: {
  logger?: Logger;
  panicThreshold?: PanicThreshold;
  verbose?: boolean;
}): Promise<React.ElementType> {
  try {
    const { Html } = await import("../../components/html.js");
    if (verbose) {
      logger?.info(`[rsc-worker] Using built-in default Html component`);
    }
    return Html;
  } catch (error) {
    const htmlError = toError(error);
    const panicError = handleError({
      error: htmlError,
      logger,
      panicThreshold,
      critical: true,
      context: `rsc-worker: load built-in Html component`,
      log: true,
    });
    throw panicError ?? htmlError;
  }
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
  panicThreshold?: PanicThreshold;
  routePatterns?: readonly string[];  // For request-time param resolution
  resolvedPageProps?: Record<string, unknown>;  // Pre-resolved props from main thread
  layouts?: RouteLayer[];  // Root→leaf route.tsx chain for nested layouts
  layoutExportName?: string;
  rscOutputPath?: string;  // Transport suffix, for stripping when matching params
  request?: Request;  // Rebuilt from serializedRequest; threaded into loader ctx
  /**
   * Written, not read, by this function: `moduleRunAt` is stamped (wall-clock,
   * once) right before the FIRST actual load call — the moment module code
   * runs, as opposed to cache hits. The caller folds it into the
   * module-resolution metric so a cold first batch is attributable.
   */
  marks?: { moduleRunAt?: number };
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
    panicThreshold = "none",
    routePatterns,
    resolvedPageProps,
    layouts,
    layoutExportName = DEFAULT_CONFIG.LAYOUT_EXPORT_NAME,
    rscOutputPath = DEFAULT_CONFIG.BUILD.rscOutputPath,
    request,
    marks,
  } = options;

  // Nested layouts: resolved once per request (independent of the page-cache
  // fast paths below), so a cache hit still folds the chain. Filled in after
  // the page/props block once params are known.
  let layoutChain: ResolvedLayoutLayer[] | undefined;
  
  // Normalize URL for cache key - ensure trailing slash for folder routes
  // This ensures /8mmc/levels and /8mmc/levels/ use the same cache key
  const normalizeUrlForCache = (urlStr: string): string => {
    // Don't add trailing slash to paths with file extensions
    if (urlStr.includes('.')) return urlStr;
    return urlStr.endsWith('/') ? urlStr : urlStr + '/';
  };
  const normalizedUrl = normalizeUrlForCache(url);

  let PageComponent: any;
  let pageProps: any = resolvedPageProps;  // Use pre-resolved props if available
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
    
    // CRITICAL: Check if Page module is invalidated before using cache
    const pageId = `${pagePath}#${pageExportName}`;
    const isPageInvalidated = isModuleInvalidated(pagePath);
    
    // Track if we need to load props separately (when Page is cached but props for this URL aren't)
    let needToLoadProps = false;
    
    // Check cache first, but only if not invalidated.
    //
    // bd-5xu (2026-04-30): we cache the Page component (a stable function from
    // the source file) but NOT the props result. Props functions read mutable
    // server state — DB rows, in-memory stores, request-scoped data — and a
    // cross-request cache silently serves stale data after a server action
    // mutates that state. The pre-bd-5xu code keyed pageProps by URL and only
    // invalidated on file change, so e.g. deleting a todo via a server action
    // was correctly persisted to the DB but the next /todos/index.rsc still
    // returned the pre-delete cached props. dev:rsc didn't go through this
    // worker path so it didn't repro there. Always reload props in dev.
    if (hasCachedComponent(pageId) && !isPageInvalidated) {
      PageComponent = getCachedComponent(pageId);
      if (verbose) {
        logger?.info(
          `[rsc-worker] Using cached Page component from: ${pagePath}`
        );
      }

      if (!resolvedPageProps) {
        // Props are intentionally NOT cached across requests — see comment
        // above. Drop any pre-existing cache entry from older versions, then
        // fall through to the separate-load path below. No propsPath gate:
        // props may live in the page module itself (resolvePageAndProps falls
        // back to pagePath), and gating on propsPath dropped those on every
        // cached-Page render — first dev render had props, refresh lost them.
        const propsId = `${propsPath || pagePath}#${propsExportName}@${normalizedUrl}`;
        if (hasCachedComponent(propsId)) {
          clearCachedComponent(propsId);
        }
        needToLoadProps = true;
      } else if (resolvedPageProps) {
        if (verbose) {
          logger?.info(
            `[rsc-worker] Using pre-resolved pageProps from main thread: ${Object.keys(resolvedPageProps).length} keys`
          );
        }
      }
    } else {
      // Page invalidated or not cached - need to reload
      if (isPageInvalidated && hasCachedComponent(pageId)) {
        clearCachedComponent(pageId);
        if (verbose) {
          logger?.info(
            `[rsc-worker] Cleared invalidated Page component cache: ${pagePath}`
          );
        }
      }
      
      // Also clear props cache if page is invalidated
      if (isPageInvalidated) {
        const propsId = `${propsPath || pagePath}#${propsExportName}@${normalizedUrl}`;
        if (hasCachedComponent(propsId)) {
          clearCachedComponent(propsId);
        }
      }
      
      // Reload page and props
      try {
        if (marks) marks.moduleRunAt ??= Date.now();
        const pageAndPropsResult = await resolvePageAndProps({
          pagePath,
          propsPath,
          pageExportName,
          propsExportName,
          url: normalizedUrl,
          routePatterns,
          request,
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
          // Use pre-resolved props from main thread if available, otherwise use loaded props
          if (!resolvedPageProps) {
            pageProps = pageAndPropsResult.pageProps;
          }

          // Cache the Page component (stable across requests). Props are
          // not cached — see bd-5xu note above for why.
          cacheComponent(pageId, PageComponent);

          if (verbose) {
            logger?.info(
              `[rsc-worker] Loaded and cached PageComponent from: ${pagePath}`
            );
            if (propsPath) {
              logger?.info(`[rsc-worker] Loaded fresh pageProps from: ${propsPath}`);
              logger?.info(`[rsc-worker] Loaded pageProps:`, pageProps);
            }
          }
        } else {
          // Page module failed to resolve. Previously fell back to React.Fragment
          // silently — the route would then render blank with no error surfaced
          // anywhere. Route through handleError so log dedup ("repeated (N)")
          // and panicThreshold handling match the rest of the plugin; then
          // throw so the outermost worker catch propagates via
          // effectiveHandlers.onError to the main thread's customLogger.
          const pageError = pageAndPropsResult.error ?? new Error(
            `[rsc-worker] Failed to load page module from ${pagePath}`,
          );
          // Loader control flow (redirect()/notFound()): throw the signal
          // untouched. handleError would panic-mark it (killing the worker
          // under critical_errors) or dedup-wrap repeats, stripping the
          // marker fields the request pipeline translates on.
          if (isLoaderSignal(pageError)) throw pageError;
          const panicError = handleError({
            error: pageError,
            logger,
            panicThreshold,
            critical: true,
            context: `rsc-worker: load page from ${pagePath}`,
            log: true,
          });
          throw panicError ?? pageError;
        }
      } catch (error) {
        // Loader signals pass through untouched (see above).
        if (isLoaderSignal(error)) throw error;
        // resolvePageAndProps threw. Route through handleError for dedup +
        // panic handling, then re-throw so the outer worker catch propagates
        // to the main thread.
        const panicError = handleError({
          error,
          logger,
          panicThreshold,
          critical: true,
          context: `rsc-worker: resolvePageAndProps for ${pagePath}`,
          log: true,
        });
        throw panicError ?? error;
      }
    }
    
    // If Page was cached but props for this URL weren't, load props separately.
    // Runs with propsPath undefined too: resolvePageAndProps then reads the
    // props export off the page module.
    if (needToLoadProps) {
      if (verbose) {
        logger?.info(
          `[rsc-worker] Loading props separately for URL: ${url} (Page was cached)`
        );
      }
      try {
        if (marks) marks.moduleRunAt ??= Date.now();
        const pageAndPropsResult = await resolvePageAndProps({
          pagePath,
          propsPath,
          pageExportName,
          propsExportName,
          url: normalizedUrl,
          routePatterns,
          request,
          loader,
          verbose: verbose || false,
          logger,
        });

        if (pageAndPropsResult.type === "success") {
          pageProps = pageAndPropsResult.pageProps;

          // Props are not cached across requests — see bd-5xu note earlier.
          if (verbose) {
            logger?.info(
              `[rsc-worker] Loaded fresh pageProps for URL: ${url}`
            );
          }
        } else {
          if (verbose) {
            logger?.warn(
              `[rsc-worker] Failed to load props for URL ${url}: ${pageAndPropsResult.error?.message}`
            );
          }
          pageProps = {};
        }
      } catch (error) {
        if (verbose) {
          logger?.error(
            `[rsc-worker] Error loading props for URL ${url}`,
            { error }
          );
        }
        pageProps = {};
      }
    }
  }

  // Nested layouts: resolve the matched route's `route.tsx` chain (components +
  // per-layer loader props) once. Params mirror the page's own resolution
  // (`normalizePathForMatch` strips the transport suffix). `request` is rebuilt
  // from the serialized request (dev), so layout loaders can gate on
  // cookies/headers here too; undefined at static build.
  if (layouts?.length) {
    const params = routePatterns?.length
      ? matchRoutes(routePatterns, normalizePathForMatch(url, rscOutputPath))
          ?.params ?? {}
      : {};
    if (marks) marks.moduleRunAt ??= Date.now();
    layoutChain = await resolveLayoutChain({
      layouts,
      url: normalizedUrl,
      ctx: { params, request },
      loader,
      layoutExportName,
      propsExportName,
      verbose,
      logger,
    });
  }

  // Load Root component
  if (rootPath) {
    const rootId = `${rootPath}#${rootExportName}`;
    // CRITICAL: Check if module is invalidated before using cache
    // This ensures file changes are picked up immediately
    const isRootInvalidated = isModuleInvalidated(rootPath);
    if (hasCachedComponent(rootId) && !isRootInvalidated) {
      RootComponent = getCachedComponent(rootId);
      if (verbose) {
        logger?.info(
          `[rsc-worker] Using cached Root component from: ${rootPath}`
        );
      }
    } else {
      // Clear cache if invalidated
      if (isRootInvalidated && hasCachedComponent(rootId)) {
        clearCachedComponent(rootId);
        if (verbose) {
          logger?.info(
            `[rsc-worker] Cleared invalidated Root component cache: ${rootPath}`
          );
        }
      }
      if (marks) marks.moduleRunAt ??= Date.now();
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
          logger?.info(
            `[rsc-worker] Root component type: ${typeof RootComponent}, isSymbol: ${typeof RootComponent === 'symbol'}, keys: ${RootComponent ? Object.keys(RootComponent) : 'null'}`
          );
        }
      } else {
        // Root module failed to resolve. Previously fell back to React.Fragment
        // under !verbose — same silent-failure pattern as the Page path. Route
        // through handleError for dedup + panic handling, then re-throw so
        // the outer worker catch propagates to the main thread's customLogger.
        const rootError = rootResult.error ?? new Error(
          `[rsc-worker] Failed to load Root component from ${rootPath}`,
        );
        const panicError = handleError({
          error: rootError,
          logger,
          panicThreshold,
          critical: true,
          context: `rsc-worker: load Root from ${rootPath}`,
          log: true,
        });
        throw panicError ?? rootError;
      }
    }
  } else {
    // No rootPath provided - use built-in default Root component. Imported
    // lazily here (matching the Html path below) so the static import graph
    // never roots React.
    const { Root: DefaultRoot } = await import("../../components/root.js");
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
  } else if (htmlPath) {
    if (verbose) {
      logger?.info(`[rsc-worker] Attempting to load custom Html component from: ${htmlPath}`);
    }
    const htmlId = `${htmlPath}#${htmlExportName}`;
    // CRITICAL: Check if module is invalidated before using cache
    const isHtmlInvalidated = isModuleInvalidated(htmlPath);
    if (hasCachedComponent(htmlId) && !isHtmlInvalidated) {
      HtmlComponent = getCachedComponent(htmlId);
      if (verbose) {
        logger?.info(
          `[rsc-worker] Using cached Html component from: ${htmlPath}`
        );
      }
    } else {
      // Clear cache if invalidated
      if (isHtmlInvalidated && hasCachedComponent(htmlId)) {
        clearCachedComponent(htmlId);
        if (verbose) {
          logger?.info(
            `[rsc-worker] Cleared invalidated Html component cache: ${htmlPath}`
          );
        }
      }
      if (verbose) {
        logger?.info(`[rsc-worker] Component not cached, calling resolveComponent with path: ${htmlPath}, exportName: ${htmlExportName}`);
      }
      if (marks) marks.moduleRunAt ??= Date.now();
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
        // The document wrapper failed to load. Falling back to React.Fragment
        // here renders every route as an <html>-less fragment — a silent
        // degrade that hides the real load error (the fileWriter's
        // degraded-document guard then reports the symptom, not the cause).
        // Mirror the Root path: route through handleError for dedup + panic
        // handling, then re-throw so the outer worker catch propagates it.
        const htmlError = htmlResult.error ?? new Error(
          `[rsc-worker] Failed to load Html component from ${htmlPath}`,
        );
        const panicError = handleError({
          error: htmlError,
          logger,
          panicThreshold,
          critical: true,
          context: `rsc-worker: load Html from ${htmlPath}`,
          log: true,
        });
        throw panicError ?? htmlError;
      }
    }
  } else {
    // No html configured (undefined) — use the built-in document wrapper.
    if (verbose) {
      logger?.info(`[rsc-worker] No htmlPath configured, using default Html component`);
    }
    HtmlComponent = await loadDefaultHtml({ logger, panicThreshold, verbose });
  }

  return { PageComponent, pageProps, RootComponent, HtmlComponent, layoutChain };
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
    
    // Increase max listeners on transferred ports to prevent warnings
    // Each request creates a new MessagePortWritable that adds listeners to these ports
    if (storedFromWorker) {
      setMaxListenersOnPort(storedFromWorker, 500);
    }
    if (storedToWorker) {
      setMaxListenersOnPort(storedToWorker, 500);
    }
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

        // Start measuring module resolution time from first module load.
        // performance.now() for the duration; Date.now() for the cross-thread
        // absolute timestamps the metric carries (each thread has its own
        // performance timeOrigin).
        const moduleResolutionStartTime = performance.now();
        const moduleResolveStartAt = Date.now();
        const loadMarks: { moduleRunAt?: number } = {};

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

        const { PageComponent, pageProps, RootComponent, HtmlComponent, layoutChain } =
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
            panicThreshold: msg.options.panicThreshold,
            routePatterns: msg.options.routePatterns ?? userOptions.routePatterns,
            resolvedPageProps: msg.options.resolvedPageProps,  // Pre-resolved from main thread
            layouts: msg.options.layouts,
            layoutExportName:
              msg.options.layoutExportName ?? userOptions.layoutExportName,
            rscOutputPath:
              userOptions.build?.rscOutputPath ??
              DEFAULT_CONFIG.BUILD.rscOutputPath,
            // Rebuild a Request from the serialized parts (dev only) so layout
            // and page loaders can read cookies/headers in the worker. A malformed
            // stand-in must never abort the render, so guard the construction.
            request: (() => {
              const sr = msg.options.serializedRequest;
              if (!sr?.url) return undefined;
              try {
                return new Request(sr.url, {
                  method: sr.method || "GET",
                  headers: sr.headers || {},
                });
              } catch {
                return undefined;
              }
            })(),
            marks: loadMarks,
          });

        if (verbose) {
          logger.info(
            `[rsc-worker] Loaded components for route ${msg.options.route}:`
          );
          logger.info(`[rsc-worker] - PageComponent: ${typeof PageComponent}`);
          logger.info(`[rsc-worker] - pageProps: ${describeProps(pageProps)}`);
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
            resolveStartAt: moduleResolveStartAt,
            moduleRunAt: loadMarks.moduleRunAt,
            moduleRunTime: loadMarks.moduleRunAt
              ? Date.now() - loadMarks.moduleRunAt
              : 0,
            fromMainThread: false,
            fromRscWorker: true,
            fromHtmlWorker: false,
            description: `Module resolution for route ${msg.options.route}`,
          });
          effectiveHandlers.onMetrics(msg.id, moduleResolutionMetric);
        }

        // Runner-mode CSS collection: the worker's Node ESM CSS loader
        // never fires for runner-loaded modules, so the global cssFiles
        // Map stays empty. Ask the main thread to walk Vite's server
        // module graph for the page (populated as a side effect of the
        // runner.import we just finished) and push the raw CSS code back.
        // We feed each entry through addCssFileContent so it merges into
        // the same global state the loader used to produce.
        const rpc = getRpc();
        if (rpc && msg.options.pagePath) {
          try {
            const cssFileUserOptions = getUserOptions();
            const collected = (await rpc<
              Array<{ id: string; code: string }>
            >("collectCss", [
              msg.options.pagePath,
              projectRoot,
              (msg.options.layouts ?? []).map((l) => l.component),
            ])) || [];
            for (const { id, code } of collected) {
              addCssFileContent(id, code, cssFileUserOptions);
            }
            if (verbose) {
              logger?.info(
                `[rsc-worker] runner CSS bridge: collected ${collected.length} file(s) for ${msg.options.pagePath}`
              );
            }
          } catch (err) {
            if (verbose) {
              logger?.warn(
                `[rsc-worker] runner CSS bridge failed: ${String(err)}`
              );
            }
          }
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
          layoutChain,
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
            routePatterns: workerData.userOptions?.routePatterns,
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

          const action = (await referenceGate.resolveServerReference(
            msg.id
          )) as (...args: unknown[]) => unknown;

          // Decode args if they're in React's encoded format
          let decodedArgs = msg.args;
          if (msg.args.length === 1 && typeof msg.args[0] === "string") {
            // Might be React's encoded format - try to decode
            try {
              const moduleBasePath = serverActionUserOptions.moduleBasePath ?? "/";
              decodedArgs = await decodeReply(msg.args[0], moduleBasePath);
              if (verbose) {
                logger?.info(`[rsc-worker] Decoded server action args: ${JSON.stringify(decodedArgs)}`);
              }
            } catch {
              // Not encoded format, use as-is
              if (verbose) {
                logger?.info(`[rsc-worker] Using raw server action args`);
              }
            }
          }

          // Execute the server action
          const result = await action(...decodedArgs);

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
        // Normalize the path - use path if provided (full path), otherwise use id (normalized path)
        const filePath = (msg as any).path || msg.id;
        const hmrProjectRoot = workerData.userOptions?.projectRoot || process.cwd();
        const normalizedPath = filePath.startsWith(hmrProjectRoot)
          ? relative(hmrProjectRoot, filePath)
          : filePath;
        
        // Mark the module as invalidated
        hmrState.set(normalizedPath, {
          timestamp: (msg as any).timestamp || Date.now(),
          invalidated: true,
          routes: (msg as any).routes || [],
        });
        
        if (verbose) {
          logger?.info(
            `[rsc-worker] HMR_UPDATE: Invalidated module ${normalizedPath} (from ${filePath})`
          );
        }
        
        // CRITICAL: Clear ALL caches when files change
        // This ensures fresh components are loaded instead of cached ones
        
        // Clear headless stream elements cache
        if (headlessStreamElements.size > 0) {
          if (verbose) {
            logger?.info(
              `[rsc-worker] HMR_UPDATE: Clearing ${headlessStreamElements.size} cached headless stream elements`
            );
          }
          headlessStreamElements.clear();
        }
        
        // Clear all component caches (temporaryReferences)
        // This is critical because Node.js caches ES modules, and even if we reload,
        // the component cache might still have the old component
        clearAllCachedComponents();
        if (verbose) {
          logger?.info(
            `[rsc-worker] HMR_UPDATE: Cleared all cached components from temporaryReferences`
          );
        }

        // Invalidate the Vite ModuleRunner cache when the experimental
        // runner path is in use. We clear the entire runner cache: the
        // EvaluatedModules graph doesn't track reverse deps (importers),
        // so invalidating just the changed file would leave consumers
        // (e.g. a page.tsx that imports the edited *.module.css) holding
        // a stale module reference with the old class-name hashes. The
        // clear is still much cheaper than a full worker restart because
        // there's no Node startup, register-vendor.js, or loader re-init.
        const runner = getRunner();
        if (runner) {
          runner.clearCache();
          if (verbose) {
            logger?.info(
              `[rsc-worker] HMR_UPDATE: runner cache cleared (trigger: ${filePath})`
            );
          }
        }

        // Also clear headless stream errors since we're reloading
        headlessStreamErrors.clear();
        
        // Notify the main thread that we've processed the update
        effectiveHandlers.onHmrUpdate(normalizedPath, (msg as any).routes || []);
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
        effectiveHandlers.onShutdown?.(msg.id);
        // Send SHUTDOWN_COMPLETE message to signal that shutdown is complete
        if (parentPort) {
          sendMessage(
            {
              type: "SHUTDOWN_COMPLETE",
              id: msg.id,
            },
            parentPort
          );
        }
        return;
      }
      default: {
        // Unexpected input, not progress narration: always visible, as a warn.
        logger.warn(`[rsc-worker] unknown message type: ${msg.type}`);
        return;
      }
    }
  } catch (error) {
    const workerError = toError(error);
    // Just communicate the error directly - let the main thread handle panic threshold logic
    effectiveHandlers.onError("worker/rsc", workerError);
    // A loader redirect()/notFound() must reach the receiver BEFORE the
    // end-of-stream null, or the response commits as an empty 200 first.
    // The control-port ERROR above races the data port; this copy is ordered.
    if (isLoaderSignal(workerError)) {
      effectiveHandlers.onDataError?.("worker/rsc", workerError);
    }
    // Signal end-of-stream so the main thread's response completes. Without
    // this, a fatal failure before any data flowed (e.g. a page/root
    // module-load throw from loadComponentsWithCache) leaves the response
    // hung — no null end-signal is sent via the data port and no RSC_END is
    // posted via the control port. onEnd posts both, matching the normal
    // happy path. The ERROR control message above carries the diagnostic;
    // the in-band RSC error frame may or may not have flowed, but the
    // response will at least complete instead of timing out.
    effectiveHandlers.onEnd?.("worker/rsc");
    // Always send SHUTDOWN_COMPLETE to prevent hanging
    effectiveHandlers.onShutdown?.("*");
  }
}
