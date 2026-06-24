import type { CreateHandlerOptions, RootComponentType, HtmlComponentType } from "../types.js";
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
  createHandlerWorkers,
  resolveHandlerContext,
} from "./createHandlerOptions.shared.js";
import { resolveComponent } from "../helpers/resolveComponent.js";
import { serializedOptions } from "../helpers/serializeUserOptions.js";

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

  // Resolve the shared prelude: defaults, auto-discovery, url, route files.
  const { defaults, autoDiscoveredFiles, url, routeFiles: routeFilesResult } =
    await resolveHandlerContext(route, options, userOptions, logger);

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

  // Create workers for the server environment. The gate + run loop is shared;
  // only the per-kind createWorker args (conditions, worker path, workerData)
  // are server-specific. Server passes the RAW { configEnv, mode } as
  // resolvedConfig and omits a top-level configEnv (vs client).
  const { rscWorker, htmlWorker } = await createHandlerWorkers({
    route,
    userOptions,
    configEnv,
    mode,
    logger,
    labelPrefix: "[createHandlerOptions.server]",
    buildWorkerArgs: (kind) => ({
      currentCondition: "react-server",
      // RSC worker keeps the current condition (it may be redundant); HTML
      // worker needs the react-client condition.
      reverseCondition: kind === "rsc" ? "react-server" : "react-client",
      workerPath:
        kind === "rsc" ? userOptions.rscWorkerPath : userOptions.htmlWorkerPath,
      verbose: userOptions.verbose,
      logger,
      workerData: {
        id: route,
        userOptions: serializedOptions(userOptions, autoDiscoveredFiles),
        resolvedConfig: { configEnv, mode } as any,
      },
    }),
  });

  // Create server-specific handler options. The shared fields are assembled by
  // buildSharedHandlerOptions; only the server-specific tail lives here.
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

    // Stream options: server coerces an undefined value to {}
    clientPipeableStreamOptions: userOptions.clientPipeableStreamOptions || {},
    components: userOptions.components,

    // Always use the inverse (HTML) worker for the main "worker" field
    worker: htmlWorker,

    // Loaded components (server loads them at configuration time)
    PageComponent,
    RootComponent,
    HtmlComponent,
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
