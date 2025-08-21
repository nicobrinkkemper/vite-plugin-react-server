import { DEFAULT_CONFIG } from "../config/defaults.js";
import { routeToURL } from "../utils/routeToURL.js";
import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { createWorkerStream } from "./createWorkerStream.client.js";
import type { CreateRscStreamFn, ClientRscStreamResult } from "./createRscStream.types.js";

import { assertNonReactServer } from "../config/getCondition.js";
import {
  validateRscStreamOptions,
  createBaseRscStreamResult,
  handleRscStreamError,
  createRscStreamMetrics,
  setupRscStreamEventHandlers,
} from "./createRscStream.utils.js";


assertNonReactServer();

/**
 * Creates an RSC stream by communicating with the RSC worker.
 * 
 * **Purpose**: Creates RSC streams by offloading React rendering to a separate worker thread.
 * **When to use**: 
 * - You need to create RSC streams in a client environment
 * - You want to avoid blocking the main thread during React rendering
 * - You're building static sites and need RSC content for multiple routes
 * - You need to create .rsc files for client-side navigation
 * 
 * **Flow**: Route + Components → RSC Worker → RSC Stream
 * 
 * @example
 * ```typescript
 * // Create RSC stream for a route
 * const rscStream = createRscStream({
 *   route: "/about",
 *   pagePath: "/src/pages/about.tsx",
 *   propsPath: "/src/pages/about.props.ts",
 *   logger: myLogger,
 *   worker: rscWorker, // Optional: provide existing worker
 * });
 * 
 * // Pipe to file
 * rscStream.pipe(fileStream);
 * ```
 * 
 * @example
 * ```typescript
 * // Create headless RSC (no HTML wrapper)
 * const rscHeadless = createRscStream({
 *   route: "/about",
 *   pagePath: "/src/pages/about.tsx",
 *   htmlPath: "", // Empty for headless
 * });
 * 
 * // Create full RSC (with HTML wrapper)
 * const rscFull = createRscStream({
 *   route: "/about", 
 *   pagePath: "/src/pages/about.tsx",
 *   htmlPath: "/src/pages/about.html.tsx", // HTML wrapper
 * });
 * ```
 * 
 * @param options - Options for RSC stream creation
 * @returns RSC stream with pipe/abort interface
 */
export const createRscStream: CreateRscStreamFn<"client"> = function _createRscStreamClient(options) {
  const {
    route,
    verbose = false,
    rscTimeout = 3000,
    // Worker options
    rscWorkerPath,
    worker,
    // Module resolution options
    moduleBaseURL,
    build,
  } = options;

  const logger = (options as any).logger || createLogger();

  // Validate common options
  validateRscStreamOptions(options, "createRscStream.client");

  if (verbose) {
    logger.info(`[createRscStream.client:${route}] Starting RSC worker stream creation`);
  }

  try {
    const url = options.url || routeToURL(
      route,
      moduleBaseURL ?? DEFAULT_CONFIG.MODULE_BASE_URL,
      build?.rscOutputPath ?? DEFAULT_CONFIG.BUILD.rscOutputPath
    );

    // Track worker startup time
    const workerStartTime = performance.now();
    let workerStartupTime: number | undefined;

    // Create worker stream for RSC communication
    const workerStream = createWorkerStream({
      ...options,
      url,
      workerPath: rscWorkerPath || DEFAULT_CONFIG.RSC_WORKER_PATH,
      messageType: "RSC_RENDER",
      currentCondition: "react-client",
      reverseCondition: "react-server",
      worker: worker || null, // Use provided worker or null
      // Ensure required client properties are provided
      projectRoot: options.projectRoot || "",
      cssFiles: options.cssFiles instanceof Map ? options.cssFiles : new Map(),
      globalCss: options.globalCss instanceof Map ? options.globalCss : new Map(),
      manifest: options.manifest || {},
      onWorkerReady: () => {
        // Worker is ready, calculate startup time
        workerStartupTime = performance.now() - workerStartTime;
        if (verbose) {
          logger.info(`[createRscStream.client:${route}] Worker startup time: ${workerStartupTime.toFixed(2)}ms`);
        }
      },
    });

    // Create pass through stream for enhanced handling
    const passThrough = new PassThrough();
    
    // Create and setup metrics - start timing from when worker is ready
    const streamMetrics = createRscStreamMetrics(route, verbose);
    
    // Setup event handlers and get cleanup function
    const cleanup = setupRscStreamEventHandlers(
      passThrough,
      streamMetrics,
      route,
      verbose,
      rscTimeout
    );

    // Pipe the worker stream directly to our pass through
    // The worker stream already contains RSC content, no need to convert with createFromNodeStream
    workerStream.pipe(passThrough);

    // Create base result structure
    const baseResult = createBaseRscStreamResult(
      passThrough,
      <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        passThrough.pipe(destination);
        return destination;
      },
      (reason?: unknown) => {
        passThrough.destroy(new Error(String(reason || "Aborted RSC worker stream")));
        cleanup();
      },
      streamMetrics
    );

    // Return client-specific result
    const clientResult: ClientRscStreamResult = {
      ...baseResult,
      type: "client" as const,
    };

    if (verbose) {
      logger.info(`[createRscStream.client:${route}] RSC worker stream created successfully`);
    }

    return clientResult;

  } catch (error) {
    handleRscStreamError(error, options, "RSC worker stream creation error");
    // This will never be reached as handleRscStreamError either throws or re-throws
    throw error;
  }
}; 