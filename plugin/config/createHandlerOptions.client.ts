import type { CreateHandlerOptions, AutoDiscoveredFiles } from "../types.js";
import type { Logger } from "vite";
import { getRouteFiles } from "../helpers/getRouteFiles.js";
import { routeToURL } from "../utils/routeToURL.js";
import { resolveAutoDiscover } from "./autoDiscover/resolveAutoDiscover.js";
import { createWorker } from "../worker/createWorker.js";
import {
  serializedOptions,
  serializeResolvedConfig,
} from "../helpers/serializeUserOptions.js";

import {
  getStashedUserOptions,
  getStashedHandlerOptions,
  stashHandlerOptions,
  getEnvironmentId,
} from "./stashedOptionsState.js";
import { getNodeEnv } from "./getNodeEnv.js";
import { createLogger } from "vite";
import { DEFAULT_CONFIG } from "./defaults.js";
import type {
  CreateHandlerOptionsParams,
  ResolvedDefaults,
} from "./createHandlerOptions.types.js";
import { getCondition } from "./getCondition.js";

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
    configEnv = { mode: mode || "production", command: "build" },
    children,
    id = `${route}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 11)}`,
    condition = getCondition(),
    envId = getEnvironmentId(condition, mode),
    userOptions = getStashedUserOptions(envId),
    config = undefined,
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

  // Create workers for client environment based on configuration and configEnv
  let rscWorker: any = undefined;
  let htmlWorker: any = undefined;

  // Determine if we need workers based on configEnv and dev config
  const isServeMode =
    configEnv?.command === "serve" ||
    configEnv?.mode === "development" ||
    mode === "development";
  const isBuildMode = configEnv?.command === "build";

  // Create RSC worker if:
  // 1. useRscWorker is enabled in dev config AND we're in serve mode, OR
  // 2. useRscWorker is enabled in build config AND we're in build mode
  const shouldCreateRscWorker =
    (userOptions.dev?.useRscWorker && isServeMode) ||
    (userOptions.build?.useRscWorker && isBuildMode);

  if (shouldCreateRscWorker) {
    if (userOptions.verbose) {
      logger.info(
        `[createHandlerOptions.client] Creating RSC worker for route: ${route}`
      );
    }

    try {
      const serializedUserOptions = userOptions
        ? serializedOptions(userOptions, autoDiscoveredFiles)
        : undefined;

      const serializedResolvedConfig = config
        ? serializeResolvedConfig(config)
        : undefined;

      const workerResult = await createWorker({
        currentCondition: "react-client",
        workerPath: userOptions.rscWorkerPath,
        verbose: userOptions.verbose,
        logger,
        workerData: {
          id: route,
          userOptions: serializedUserOptions,
          resolvedConfig: serializedResolvedConfig,
          configEnv,
        },
      });

      if (workerResult.type === "error") {
        logger.warn(
          `[createHandlerOptions.client] Failed to create RSC worker: ${workerResult.error?.message}`
        );
        rscWorker = undefined;
      } else if (workerResult.type === "skip") {
        logger.warn(
          `[createHandlerOptions.client] RSC worker creation skipped: ${workerResult.reason}`
        );
        rscWorker = undefined;
      } else {
        rscWorker = workerResult.worker;
        if (userOptions.verbose) {
          logger.info(
            `[createHandlerOptions.client] RSC worker created successfully`
          );
        }
      }
    } catch (error) {
      logger.warn(
        `[createHandlerOptions.client] RSC worker creation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      rscWorker = undefined;
    }
  }

  // Create HTML worker if:
  // 1. useHtmlWorker is enabled in dev config AND we're in serve mode, OR
  // 2. useHtmlWorker is enabled in build config AND we're in build mode
  const shouldCreateHtmlWorker =
    (userOptions.dev?.useHtmlWorker && isServeMode) ||
    (userOptions.build?.useHtmlWorker && isBuildMode);

  if (shouldCreateHtmlWorker) {
    if (userOptions.verbose) {
      logger.info(
        `[createHandlerOptions.client] Creating HTML worker for route: ${route}`
      );
    }

    try {
      // Create fallback defaults based on configEnv
      const fallbackDefaults = {
        verbose: false,
        panicThreshold: 1000,
        moduleRootPath: "",
        moduleBaseURL: "",
        moduleBasePath: "",
        projectRoot: process.cwd(),
        htmlTimeout: 30000,
        serverPipeableStreamOptions: {},
        clientPipeableStreamOptions: {},
        build: {
          useHtmlWorker: isBuildMode,
          useRscWorker: isBuildMode,
          pages: [],
        },
        dev: {
          useHtmlWorker: false,
          useRscWorker: true,
        },
      };

      const serializedUserOptions = userOptions
        ? serializedOptions(userOptions, autoDiscoveredFiles)
        : serializedOptions(fallbackDefaults as any, autoDiscoveredFiles);

      const serializedResolvedConfig = config
        ? serializeResolvedConfig(config)
        : {
            mode: configEnv?.mode || mode || "development",
            root: process.cwd(),
            logLevel: "info",
            env: {},
            envPrefix: "VITE_",
            base: "/",
            publicDir: "public",
            cacheDir: "node_modules/.vite",
            command: configEnv?.command || "serve",
            isSsrBuild: configEnv?.command === "build",
            isPreview: false,
          };

      const htmlWorkerResult = await createWorker({
        currentCondition: "react-client", // We are in a .client file
        reverseCondition: "react-client", // The user still requested a worker, which uses the same condition
        workerPath: userOptions.htmlWorkerPath,
        verbose: userOptions.verbose,
        logger,
        workerData: {
          id: route,
          userOptions: serializedUserOptions,
          resolvedConfig: serializedResolvedConfig,
          configEnv,
        },
      });

      if (htmlWorkerResult.type === "error") {
        logger.warn(
          `[createHandlerOptions.client] Failed to create HTML worker: ${htmlWorkerResult.error?.message}`
        );
        htmlWorker = undefined;
      } else if (htmlWorkerResult.type === "skip") {
        logger.warn(
          `[createHandlerOptions.client] HTML worker creation skipped: ${htmlWorkerResult.reason}`
        );
        htmlWorker = undefined;
      } else {
        htmlWorker = htmlWorkerResult.worker;
        if (userOptions.verbose) {
          logger.info(
            `[createHandlerOptions.client] HTML worker created successfully`
          );
        }
      }
    } catch (error) {
      logger.warn(
        `[createHandlerOptions.client] HTML worker creation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      htmlWorker = undefined;
    }
  }

  // Create client-specific handler options
  const handlerOptions: CreateHandlerOptions = {
    ...userOptions,
    // File paths - these are passed directly to the worker for component resolution
    // The worker handles the distinction between undefined vs "" for Root and Html:
    // - undefined = use built-in default component
    // - "" = explicitly disable (headless mode for Html, React.Fragment for Root)
    // - string path = resolve custom component from specified path
    // This approach maintains consistency between server and client paradigms
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
    clientPipeableStreamOptions: userOptions.clientPipeableStreamOptions,

    // Client-specific
    id,
    // Client needs component placeholders since it can't load server modules directly
    HtmlComponent: undefined,
    PageComponent: undefined,
    RootComponent: undefined,
    // Workers for client environment - provide both for specific use cases
    worker: condition === "react-server" ? rscWorker : htmlWorker, // Backward compatibility: prefer HTML worker if available
    rscWorker,
    htmlWorker,
    // Children provided directly via options
    children,
  };

  // Cache and return
  stashHandlerOptions(id, handlerOptions);
  return handlerOptions;
}


export type {
  CreateHandlerOptionsParams,
  CreateHandlerOptionsServerFn,
  CreateHandlerOptionsClientFn,
} from "./createHandlerOptions.types.js";
