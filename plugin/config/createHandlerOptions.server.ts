import type { CreateHandlerOptions, AutoDiscoveredFiles, RootComponentType, HtmlComponentType } from "../types.js";
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
import { resolveComponent } from "../helpers/resolveComponent.js";
import { serializedOptions } from "../helpers/serializeUserOptions.js";
import { createWorker } from "../worker/createWorker.js";

/**
 * Server-specific handler options creation for React Server Components (RSC).
 * 
 * WHAT THIS DOES:
 * - Creates handler options optimized for server-side rendering
 * - Resolves file paths for pages, props, root, and HTML components
 * - Sets up server-specific loaders and configuration
 * - Handles caching with unique IDs
 * - Provides all necessary options for RSC stream creation
 * 
 * WHAT THIS DOESN'T DO:
 * - Does NOT load React components (that happens in the actual handlers)
 * - Does NOT create RSC streams (use createHandler for that)
 * - Does NOT handle client-side rendering (use .client.ts for that)
 * - Does NOT manage component lifecycle or state
 * 
 * USAGE:
 * ```typescript
 * const handlerOptions = await createHandlerOptions("/my-route", {
 *   logger: myLogger,
 *   defaults: { loader: server.ssrLoadModule }
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
    configEnv = { mode: mode || "production", command: "build" },
    id = `${route}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 11)}`,
    envId = getEnvironmentId("react-server", mode),
    userOptions = getStashedUserOptions(envId),
  } = options;

  // Check cache first
  const cachedOptions = getStashedHandlerOptions(id);
  if (cachedOptions) {
    return cachedOptions;
  }


  if (!userOptions) {
    throw new Error(
      `No stashed userOptions found for environment: ${envId}. Make sure resolveOptions() has been called first.`
    );
  }

  // Resolve defaults
  const defaults = { ...createDefaultOptions(), ...options.defaults };

  // Resolve auto-discovered files
  const autoDiscoveredFiles = await resolveAutoDiscoveredFiles(
    options,
    userOptions,
    logger
  );

  // Create URL
  const url = routeToURL(
    route,
    userOptions.moduleBaseURL,
    userOptions.build.rscOutputPath
  );

  // Get route files
  const routeFilesResult = await getRouteFiles(
    route,
    autoDiscoveredFiles,
    userOptions,
    logger
  );

  if (routeFilesResult.type === "error") {
    throw routeFilesResult.error || new Error("Failed to get route files");
  }

  // Load components from resolved file paths
  let PageComponent = userOptions.components?.Page;
  let RootComponent = userOptions.components?.Root;
  let HtmlComponent = userOptions.components?.Html;

  // Load Page component if pagePath is available
  if (routeFilesResult.page && !PageComponent) {
    try {
      if (userOptions.verbose) {
        logger.info(`[createHandlerOptions] Attempting to load component from: ${routeFilesResult.page} export: ${userOptions.pageExportName}`);
      }
      
      // In development mode (serve), use dynamic import loader for TypeScript support
      const isServeMode = configEnv?.command === "serve" || configEnv?.mode === "development" || mode === "development";
      const componentLoader = isServeMode 
        ? async (path: string) => {
            if (userOptions.verbose) {
              logger.info(`[createHandlerOptions] Development mode: loading ${path} via dynamic import`);
            }
            return await import(path);
          }
        : defaults.loader || (() => Promise.resolve({}));
      
      const pageResult = await resolveComponent({
        componentPath: routeFilesResult.page,
        exportName: userOptions.pageExportName,
        loader: componentLoader,
      });

      if (pageResult.type === "success") {
        PageComponent = pageResult.component;
        logger.info(`[createHandlerOptions] Loaded Page component from ${routeFilesResult.page}`);
      } else {
        logger.warn(
          `[createHandlerOptions] Failed to load Page component from ${routeFilesResult.page}: ${
            pageResult.error?.message || "Unknown error"
          }`
        );
      }
    } catch (error) {
      logger.warn(
        `[createHandlerOptions] Error loading Page component from ${routeFilesResult.page}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Load Root component if rootPath is available, or use default Root component if rootPath is undefined
  if (!RootComponent && routeFilesResult.root !== undefined) {
    // If rootPath is explicitly set to empty string, don't load any Root component (headless mode)
    if (routeFilesResult.root === '') {
      if (userOptions.verbose) {
        logger.info(`[createHandlerOptions] Root component explicitly disabled (headless mode)`);
      }
      RootComponent = undefined;
    } else {
      // Load custom Root component from specified path
      try {
        // Use same development mode loader logic
        const isServeMode = configEnv?.command === "serve" || configEnv?.mode === "development" || mode === "development";
        const componentLoader = isServeMode 
          ? async (path: string) => import(path)
          : defaults.loader || (() => Promise.resolve({}));
        
        const rootResult = await resolveComponent({
          componentPath: routeFilesResult.root,
          exportName: userOptions.rootExportName,
          loader: componentLoader,
        });

        if (rootResult.type === "success") {
          RootComponent = rootResult.component as RootComponentType;
          logger.info(`[createHandlerOptions] Loaded custom Root component from ${routeFilesResult.root}`);
        }
      } catch (error) {
        logger.warn(
          `[createHandlerOptions] Error loading custom Root component: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  } else if(!RootComponent) {
    // rootPath is undefined, use default Root component
    try {
      const { Root } = await import("../components/root.js");
      RootComponent = Root;
      if (userOptions.verbose) {
        logger.info(`[createHandlerOptions] Using default Root component`);
      }
    } catch (error) {
      logger.warn(
        `[createHandlerOptions] Error loading default Root component: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Load Html component if htmlPath is available, or use default Html component if htmlPath is undefined
  if (!HtmlComponent && routeFilesResult.html !== undefined) {
    // If htmlPath is explicitly set to empty string, don't load any Html component (headless mode)
    if (routeFilesResult.html === '') {
      if (userOptions.verbose) {
        logger.info(`[createHandlerOptions] Html component explicitly disabled (headless mode)`);
      }
      HtmlComponent = undefined;
    } else {
      // Load custom Html component from specified path
      try {
        
        // Use same development mode loader logic
        const isServeMode = configEnv?.command === "serve" || configEnv?.mode === "development" || mode === "development";
        const componentLoader = isServeMode 
          ? async (path: string) => await import(path)
          : defaults.loader || (() => Promise.resolve({}));
        
        const htmlResult = await resolveComponent({
          componentPath: routeFilesResult.html,
          exportName: userOptions.htmlExportName,
          loader: componentLoader,
        });

        if (htmlResult.type === "success") {
          HtmlComponent = htmlResult.component as HtmlComponentType;
          logger.info(`[createHandlerOptions] Loaded custom Html component from ${routeFilesResult.html}`);
        }
      } catch (error) {
        logger.warn(
          `[createHandlerOptions] Error loading custom Html component: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  } else if(!HtmlComponent) {
    // htmlPath is undefined, use default Html component
    try {
      const { Html } = await import("../components/html.js");
      HtmlComponent = Html;
      if (userOptions.verbose) {
        logger.info(`[createHandlerOptions] Using default Html component`);
      }
    } catch (error) {
      logger.warn(
        `[createHandlerOptions] Error loading default Html component: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Create workers for server environment based on configuration and configEnv
  let rscWorker: any = undefined;
  let htmlWorker: any = undefined;
  
  // Determine if we need workers based on configEnv and dev config
  const isServeMode = configEnv?.command === "serve" || configEnv?.mode === "development" || mode === "development";
  const isBuildMode = configEnv?.command === "build";
  
  // Create RSC worker if:
  // 1. useRscWorker is enabled in dev config AND we're in serve mode, OR
  // 2. useRscWorker is enabled in build config AND we're in build mode
  const shouldCreateRscWorker = (userOptions.dev?.useRscWorker && isServeMode) || 
                               (userOptions.build?.useRscWorker && isBuildMode);
  
  if (shouldCreateRscWorker) {
    if (userOptions.verbose) {
      logger.info(`[createHandlerOptions.server] Creating RSC worker for route: ${route}`);
    }
    
    try {
      
      const serializedUserOptions = serializedOptions(userOptions, autoDiscoveredFiles);
      
      // We don't need to create the RSC worker, but if the user wants to use their own worker
      // it can be done by setting dev.useRscWorker=true or build.useRscWorker=true
      const workerResult = await createWorker({
        currentCondition: "react-server",
        // same CONDITION as the current one (this worker may be redundant)
        reverseCondition: "react-server",
        workerPath: userOptions.rscWorkerPath,
        verbose: userOptions.verbose,
        logger,
        workerData: {
          id: route,
          userOptions: serializedUserOptions,
          resolvedConfig: {
            configEnv,
            mode,
          },
        },
      });

      if (workerResult.type === "error") {
        logger.warn(`[createHandlerOptions.server] Failed to create RSC worker: ${workerResult.error?.message}`);
        rscWorker = undefined;
      } else if (workerResult.type === "skip") {
        logger.warn(`[createHandlerOptions.server] RSC worker creation skipped: ${workerResult.reason}`);
        rscWorker = undefined;
      } else {
        rscWorker = workerResult.worker;
        if (userOptions.verbose) {
          logger.info(`[createHandlerOptions.server] RSC worker created successfully`);
        }
      }
    } catch (error) {
      logger.warn(`[createHandlerOptions.server] RSC worker creation failed: ${error instanceof Error ? error.message : String(error)}`);
      rscWorker = undefined;
    }
  }

  // Create HTML worker if:
  // Create HTML worker if:
  // 1. useHtmlWorker is enabled in dev config AND we're in serve mode, OR
  // 2. useHtmlWorker is enabled in build config AND we're in build mode
  const shouldCreateHtmlWorker = (userOptions.dev?.useHtmlWorker && isServeMode) || 
                                (userOptions.build?.useHtmlWorker && isBuildMode);
  
  if (shouldCreateHtmlWorker) {
    if (userOptions.verbose) {
      logger.info(`[createHandlerOptions.server] Creating HTML worker for route: ${route}`);
    }
    
    try {
      
      const serializedUserOptions = serializedOptions(userOptions, autoDiscoveredFiles);
      
      const workerResult = await createWorker({
        currentCondition: "react-server",
        reverseCondition: "react-client", // HTML worker needs react-client condition
        workerPath: userOptions.htmlWorkerPath,
        verbose: userOptions.verbose,
        logger,
        workerData: {
          id: route,
          userOptions: serializedUserOptions,
          resolvedConfig: {
            configEnv,
            mode,
          },
        },
      });

      if (workerResult.type === "error") {
        logger.warn(`[createHandlerOptions.server] Failed to create HTML worker: ${workerResult.error?.message}`);
        htmlWorker = undefined;
      } else if (workerResult.type === "skip") {
        logger.warn(`[createHandlerOptions.server] HTML worker creation skipped: ${workerResult.reason}`);
        htmlWorker = undefined;
      } else {
        htmlWorker = workerResult.worker;
        if (userOptions.verbose) {
          logger.info(`[createHandlerOptions.server] HTML worker created successfully`);
        }
      }
    } catch (error) {
      logger.warn(`[createHandlerOptions.server] HTML worker creation failed: ${error instanceof Error ? error.message : String(error)}`);
      htmlWorker = undefined;
    }
  }

  // Create server-specific handler options
  const handlerOptions: CreateHandlerOptions = {
    ...userOptions,
    // File paths
    pagePath: routeFilesResult.page,
    propsPath: routeFilesResult.props,
    rootPath: routeFilesResult.root,
    htmlPath: routeFilesResult.html,
    
    // Export names
    pageExportName: userOptions.pageExportName,
    propsExportName: userOptions.propsExportName,
    rootExportName: userOptions.rootExportName,
    htmlExportName: userOptions.htmlExportName,
    
    // Route and loader
    route,
    loader: defaults.loader || (() => Promise.resolve({})),
    
    // Configuration
    panicThreshold: userOptions.panicThreshold,
    verbose: userOptions.verbose,
    moduleBaseURL: userOptions.moduleBaseURL,
    build: userOptions.build,
    dev: {
      useHtmlWorker: userOptions.dev.useHtmlWorker,
      useRscWorker: userOptions.dev.useRscWorker,
    },
    logger,
    
    // Required properties
    normalizer: userOptions.normalizer,
    onEvent: userOptions.onEvent,
    onMetrics: userOptions.onMetrics,
    autoDiscover: userOptions.autoDiscover,
    css: userOptions.css,
    projectRoot: userOptions.projectRoot,
    moduleBase: userOptions.moduleBase,
    moduleBasePath: userOptions.moduleBasePath,
    moduleRootPath: userOptions.moduleRootPath,
    moduleID: userOptions.moduleID,
    url,
    manifest: defaults.manifest,
    cssFiles: defaults.cssFiles,
    globalCss: defaults.globalCss,
    
    // Timeouts and paths
    rscTimeout: userOptions.rscTimeout,
    htmlTimeout: userOptions.htmlTimeout,
    fileWriteTimeout: userOptions.fileWriteTimeout,
    workerShutdownTimeout: userOptions.workerShutdownTimeout,
    rscWorkerPath: userOptions.rscWorkerPath,
    htmlWorkerPath: userOptions.htmlWorkerPath,
    publicOrigin: userOptions.publicOrigin,
    
    // Stream options
    serverPipeableStreamOptions: userOptions.serverPipeableStreamOptions,
    clientPipeableStreamOptions: userOptions.clientPipeableStreamOptions || {},
    components: userOptions.components,
    
    // Server-specific
    id,
    // Always use the inverse worker for the main "worker" field
    worker: htmlWorker,
    rscWorker,
    htmlWorker,
    // Loaded components (server loads them at configuration time)
    PageComponent,
    RootComponent, 
    HtmlComponent
  };

  // Cache and return
  stashHandlerOptions(id, handlerOptions);
  return handlerOptions;
}
