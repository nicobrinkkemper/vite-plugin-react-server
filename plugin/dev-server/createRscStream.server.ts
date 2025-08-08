import type { CreateRscStreamFn } from "./createRscStream.types.js";
import { createHandler } from "../helpers/createHandler.server.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { performance } from "node:perf_hooks";
import { handleError } from "../error/handleError.js";

/**
 * Server-side RSC Stream - creates server-side React Server Components
 * RSC = what gets serialized (server-side React Server Components)
 * Enhanced with validation and metric handling
 */
export const createRscStream: CreateRscStreamFn = function _createRscStream(
  options
) {
  const startTime = performance.now();
  const logger = options.logger;
  const verbose = options.verbose || false;

  // Validate required options for RSC stream creation
  if (!options.route) {
    throw new Error("Route is required for RSC stream creation");
  }

  if (!options.pagePath) {
    throw new Error("pagePath is required for RSC stream creation");
  }

  if (verbose) {
    logger?.info(`[createRscStream:server] Creating RSC stream for route: ${options.route}`);
  }

  try {
    const result = createHandler(options);

    // Validate the result
    if (!result || typeof result.pipe !== "function") {
      throw new Error("createHandler returned invalid result - missing pipe function");
    }

    if (!result.stream) {
      throw new Error("createHandler returned invalid result - missing stream");
    }

    // Create enhanced metrics
    const enhancedMetrics = createStreamMetrics();
    enhancedMetrics.startTime = startTime;
    enhancedMetrics.duration = performance.now() - startTime;

    if (verbose) {
      logger?.info(`[createRscStream:server] RSC stream created successfully for route: ${options.route}`);
      logger?.info(`[createRscStream:server] Creation time: ${enhancedMetrics.duration}ms`);
    }

    return {
      type: "server" as const,
      stream: result.stream,
      elements: result.elements,
      pipe: result.pipe,
      abort: result.abort,
      metrics: {
        ...result.metrics,
        ...enhancedMetrics,
      },
    };
  } catch (error) {
    const panicError = handleError({
      error,
      logger,
      panicThreshold: options.panicThreshold || "none",
      context: `createRscStream.server (${options.route})`,
    });
    
    if (panicError) {
      throw panicError;
    }
    
    throw error;
  }
}; 