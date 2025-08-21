import type { CreateHandlerOptions, AutoDiscoveredFiles } from "../types.js";
import type { Logger } from "vite";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import { routeToURL } from "../utils/routeToURL.js";
import { resolveAutoDiscover } from "./autoDiscover/resolveAutoDiscover.js";
import {
  getStashedUserOptions,
  getStashedHandlerOptions,
  stashHandlerOptions,
  getEnvironmentId,
} from "./stashedOptionsState.js";
import { getNodeEnv } from "./getNodeEnv.js";
import { createLogger } from "vite";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { CreateHandlerOptionsParams, ResolvedDefaults } from "./createHandlerOptions.types.js";

/**
 * Client-specific handler options creation for HTML generation.
 * 
 * WHAT THIS DOES:
 * - Creates handler options optimized for client-side rendering
 * - Resolves file paths for pages, props, root, and HTML components
 * - Sets up client-specific loaders and configuration
 * - Handles caching with unique IDs
 * - Provides component placeholders (since client can't load server modules)
 * - Provides all necessary options for HTML stream creation
 * 
 * WHAT THIS DOESN'T DO:
 * - Does NOT load React components (that happens in workers or handlers)
 * - Does NOT create HTML streams (use createHandler for that)
 * - Does NOT handle server-side rendering (use .server.ts for that)
 * - Does NOT manage component lifecycle or state
 * 
 * USAGE:
 * ```typescript
 * const handlerOptions = await createHandlerOptions("/my-route", {
 *   logger: myLogger,
 *   defaults: { loader: () => Promise.resolve({}) }
 * });
 * ```
 */

function createDefaultOptions(): ResolvedDefaults {
  return {
    pageExportName: DEFAULT_CONFIG.PAGE_EXPORT_NAME,
    propsExportName: DEFAULT_CONFIG.PROPS_EXPORT_NAME,
    rootExportName: DEFAULT_CONFIG.ROOT_EXPORT_NAME,
    htmlExportName: DEFAULT_CONFIG.HTML_EXPORT_NAME,
    cssFiles: new Map(),
    globalCss: new Map(),
    manifest: {},
    css: DEFAULT_CONFIG.CSS,
  };
}

async function resolveAutoDiscoveredFiles(
  options: CreateHandlerOptionsParams,
  stashedOptions: any,
  logger: Logger
): Promise<AutoDiscoveredFiles> {
  if (options.autoDiscoveredFiles) {
    return options.autoDiscoveredFiles;
  }

  const result = await resolveAutoDiscover({
    config: options.config || {},
    configEnv: options.configEnv || { mode: "production", command: "build" },
    userOptions: stashedOptions,
    logger,
  });

  if (result.type === "error") {
    throw result.error || new Error("Failed to resolve autoDiscover");
  }

  return result.autoDiscoveredFiles;
}

export async function createHandlerOptions(
  route: string,
  options: CreateHandlerOptionsParams = {}
): Promise<CreateHandlerOptions> {
  const {
    mode = getNodeEnv(),
    logger = createLogger(),
    id = `${route}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 11)}`,
  } = options;

  // Check cache first
  const cachedOptions = getStashedHandlerOptions(id);
  if (cachedOptions) {
    return cachedOptions;
  }

  // Get stashed options for client environment
  const envId = getEnvironmentId("react-client", mode);
  const stashedOptions = getStashedUserOptions(envId);

  if (!stashedOptions) {
    throw new Error(
      `No stashed userOptions found for environment: ${envId}. Make sure resolveOptions() has been called first.`
    );
  }

  // Resolve defaults
  const defaults = { ...createDefaultOptions(), ...options.defaults };

  // Resolve auto-discovered files
  const autoDiscoveredFiles = await resolveAutoDiscoveredFiles(
    options,
    stashedOptions,
    logger
  );

  // Create URL
  const url = routeToURL(
    route,
    stashedOptions.moduleBaseURL,
    stashedOptions.build.rscOutputPath
  );

  // Get route files
  const routeFilesResult = await getRouteFiles(
    route,
    autoDiscoveredFiles,
    stashedOptions,
    logger
  );

  if (routeFilesResult.type === "error") {
    throw routeFilesResult.error || new Error("Failed to get route files");
  }

  // Create client-specific handler options
  const handlerOptions: CreateHandlerOptions = {
    ...stashedOptions,
    // File paths
    pagePath: routeFilesResult.page,
    propsPath: routeFilesResult.props,
    rootPath: routeFilesResult.root,
    htmlPath: routeFilesResult.html,
    
    // Export names
    pageExportName: stashedOptions.pageExportName,
    propsExportName: stashedOptions.propsExportName,
    rootExportName: stashedOptions.rootExportName,
    htmlExportName: stashedOptions.htmlExportName,
    
    // Route and loader
    route,
    loader: defaults.loader || (() => Promise.resolve({})),
    
    // Configuration
    panicThreshold: stashedOptions.panicThreshold,
    verbose: stashedOptions.verbose,
    moduleBaseURL: stashedOptions.moduleBaseURL,
    build: stashedOptions.build,
    logger,
    
    // Required properties
    normalizer: stashedOptions.normalizer,
    onEvent: stashedOptions.onEvent,
    onMetrics: stashedOptions.onMetrics,
    autoDiscover: stashedOptions.autoDiscover,
    css: stashedOptions.css,
    projectRoot: stashedOptions.projectRoot,
    moduleBase: stashedOptions.moduleBase,
    moduleBasePath: stashedOptions.moduleBasePath,
    moduleRootPath: stashedOptions.moduleRootPath,
    moduleID: stashedOptions.moduleID,
    url,
    manifest: defaults.manifest,
    cssFiles: defaults.cssFiles,
    globalCss: defaults.globalCss,
    
    // Timeouts and paths
    rscTimeout: stashedOptions.rscTimeout,
    htmlTimeout: stashedOptions.htmlTimeout,
    fileWriteTimeout: stashedOptions.fileWriteTimeout,
    workerShutdownTimeout: stashedOptions.workerShutdownTimeout,
    rscWorkerPath: stashedOptions.rscWorkerPath,
    htmlWorkerPath: stashedOptions.htmlWorkerPath,
    publicOrigin: stashedOptions.publicOrigin,
    
    // Stream options
    serverPipeableStreamOptions: stashedOptions.serverPipeableStreamOptions,
    clientPipeableStreamOptions: stashedOptions.clientPipeableStreamOptions,
    
    // Client-specific
    id,
    // Client needs component placeholders since it can't load server modules directly
    HtmlComponent: undefined,
    PageComponent: undefined,
    RootComponent: undefined,
  };

  // Cache and return
  stashHandlerOptions(id, handlerOptions);
  return handlerOptions;
}
