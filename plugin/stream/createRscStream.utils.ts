import { createStreamMetrics } from "../helpers/metrics.js";
import { handleError } from "../error/handleError.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import type {
  ClientRscStreamOptions,
  ServerRscStreamOptions,
  BaseRscStreamResult,
} from "./createRscStream.types.js";
import type { PassThrough } from "node:stream";
import { createLogger, type Logger } from "vite";

/**
 * Validates common RSC stream options
 *
 * @param options - RSC stream options to validate
 * @param context - Context for error messages
 * @throws Error if validation fails
 */
export function validateRscStreamOptions(
  options: ClientRscStreamOptions | ServerRscStreamOptions,
  context: string
): void {
  if (!options.route) {
    throw new Error(`${context}: Route is required for RSC stream creation`);
  }

  if (!options.pagePath) {
    throw new Error(`${context}: pagePath is required for RSC stream creation`);
  }
}

/**
 * Creates common RSC stream result structure
 *
 * @param rscStream - The RSC stream
 * @param elements - React elements
 * @param pipe - Pipe function
 * @param abort - Abort function
 * @param metrics - Stream metrics
 * @returns Base RSC stream result
 */
export function createBaseRscStreamResult(
  rscStream: PassThrough,
  pipe: <Writable extends NodeJS.WritableStream>(
    destination: Writable
  ) => Writable,
  abort: (reason?: unknown) => void,
  metrics: ReturnType<typeof createStreamMetrics>,
  id: string
): BaseRscStreamResult {
  return {
    id,
    rscStream,
    pipe,
    abort,
    metrics,
  };
}

/**
 * Handles RSC stream errors with consistent error handling
 *
 * @param error - The error that occurred
 * @param options - RSC stream options for context
 * @param context - Additional context for error handling
 * @throws Error if panic threshold is met
 */
export function handleRscStreamError(
  error: unknown,
  options: ClientRscStreamOptions | ServerRscStreamOptions,
  context: string
): void {
  const panicError = handleError({
    error,
    logger: (options as any).logger,
    mode: getNodeEnv(),
    panicThreshold: options.panicThreshold || "none",
    context: `${context} for route ${options.route}`,
  });

  if (panicError != null) {
    throw panicError;
  }

  throw error;
}

/**
 * Creates stream metrics with common setup
 *
 * @param route - Route for logging context
 * @param verbose - Whether to enable verbose logging
 * @returns Stream metrics instance
 */
export function createRscStreamMetrics(): ReturnType<typeof createStreamMetrics> {
  const metrics = createStreamMetrics();
  metrics.startTime = performance.now();
  return metrics;
}

/**
 * Sets up common stream event handlers for metrics collection
 *
 * @param stream - The stream to monitor
 * @param metrics - Metrics to update
 * @param options - Configuration options
 * @returns Cleanup function
 */
export function setupRscStreamEventHandlers(
  stream: PassThrough,
  metrics: ReturnType<typeof createStreamMetrics>,
  options: {
    route: string;
    verbose?: boolean;
    logger?: Logger;
  }
): () => void {
  const { route, verbose = false, logger = createLogger() } = options;

  stream.on("data", (chunk: Buffer) => {
    if (verbose) {
      logger.info(
        `[createRscStream:${route}] Received data chunk: ${chunk.length} bytes`
      );
    }
    metrics.chunks++;
    metrics.bytes += chunk.length;
  });

  stream.on("end", () => {
    if (verbose) {
      logger.info(`[createRscStream:${route}] Stream ended`);
    }
    metrics.duration = performance.now() - metrics.startTime;
    metrics.endTime = performance.now();
  });

  stream.on("error", (error: unknown) => {
    logger.error(`[createRscStream:${route}] Stream error: ${error}`);
  });

  stream.on("drain", () => {
    if (verbose) {
      logger.info(
        `[createRscStream:${route}] Stream drain - backpressure resolved`
      );
    }
  });

  // Track backpressure when write buffer is full
  const originalWrite = stream.write.bind(stream);
  stream.write = function (
    chunk: any,
    encoding?: BufferEncoding | ((error: Error | null | undefined) => void),
    callback?: (error: Error | null | undefined) => void
  ) {
    const result = originalWrite(chunk, encoding as any, callback);
    if (!result) {
      metrics.backpressureCount++;
      if (verbose) {
        logger.warn(`[createRscStream:${route}] Backpressure detected`);
      }
    }
    return result;
  };

  return () => {
    // No cleanup needed since we removed the timeout
    stream.removeAllListeners();
  };
}
