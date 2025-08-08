import type { CreateRscStreamFn } from "./createRscStream.types.js";
import { createHandler } from "../helpers/createHandler.client.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { performance } from "node:perf_hooks";

/**
 * Client-side RSC Stream - creates server-side React Server Components
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
    logger?.info(`[createRscStream:client] Creating RSC stream for route: ${options.route}`);
  }

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
    logger?.info(`[createRscStream:client] RSC stream created successfully for route: ${options.route}`);
    logger?.info(`[createRscStream:client] Creation time: ${enhancedMetrics.duration}ms`);
  }

  return {
    type: "client" as const,
    stream: result.stream,
    elements: result.elements,
    pipe: result.pipe,
    abort: result.abort,
    metrics: {
      ...result.metrics,
      ...enhancedMetrics,
    },
  };
}; 