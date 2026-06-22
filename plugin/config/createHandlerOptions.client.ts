import type { CreateHandlerOptions } from "../types.js";
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
import type { CreateHandlerOptionsParams } from "./createHandlerOptions.types.js";
import {
  buildSharedHandlerOptions,
  createConfiguredWorker,
  resolveHandlerContext,
} from "./createHandlerOptions.shared.js";
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

  // Resolve the shared prelude: defaults, auto-discovery, url, route files.
  const { defaults, autoDiscoveredFiles, url, routeFiles: routeFilesResult } =
    await resolveHandlerContext(route, options, userOptions, logger);

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
    const serializedUserOptions = userOptions
      ? serializedOptions(userOptions, autoDiscoveredFiles)
      : undefined;

    const serializedResolvedConfig = config
      ? serializeResolvedConfig(config)
      : undefined;

    rscWorker = await createConfiguredWorker(
      `[createHandlerOptions.client] RSC worker (route ${route})`,
      {
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
      },
      logger,
      userOptions.verbose
    );
  }

  // Create HTML worker if:
  // 1. useHtmlWorker is enabled in dev config AND we're in serve mode, OR
  // 2. useHtmlWorker is enabled in build config AND we're in build mode
  const shouldCreateHtmlWorker =
    (userOptions.dev?.useHtmlWorker && isServeMode) ||
    (userOptions.build?.useHtmlWorker && isBuildMode);

  if (shouldCreateHtmlWorker) {
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

    htmlWorker = await createConfiguredWorker(
      `[createHandlerOptions.client] HTML worker (route ${route})`,
      {
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
      },
      logger,
      userOptions.verbose
    );
  }

  // Create client-specific handler options. The shared fields are assembled by
  // buildSharedHandlerOptions; only the client-specific tail lives here.
  //
  // File-path handling note: pagePath/rootPath/htmlPath are passed straight to
  // the worker, which distinguishes undefined (built-in default) vs "" (headless
  // / React.Fragment) vs a string path (resolve custom component).
  const handlerOptions: CreateHandlerOptions = {
    ...userOptions,
    ...buildSharedHandlerOptions({
      route,
      url,
      id,
      userOptions,
      defaults,
      routeFiles: routeFilesResult,
      logger,
      rscWorker,
      htmlWorker,
    }),

    // Stream options: client passes the value through as-is (no `|| {}`)
    clientPipeableStreamOptions: userOptions.clientPipeableStreamOptions,

    // Client needs component placeholders since it can't load server modules
    HtmlComponent: undefined,
    PageComponent: undefined,
    RootComponent: undefined,

    // Backward compatibility: prefer the condition-appropriate worker
    worker: condition === "react-server" ? rscWorker : htmlWorker,

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
