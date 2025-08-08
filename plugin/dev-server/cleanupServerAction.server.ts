import type { Logger } from "vite";
import type { ServerResponse } from "node:http";
import type { PassThrough } from "node:stream";

/**
 * Server version of cleanupServerAction - no-op since no workers in server mode
 */
export const cleanupServerAction = function _cleanupServerAction(
  passThrough: PassThrough,
  res: ServerResponse,
  error?: unknown,
  logger?: Logger
) {
  // End the pass-through stream
  passThrough.end();

  // Log error if provided
  if (error && logger) {
    logger.error("[cleanupServerAction:server] Error:", error);
  }

  // End the response
  res.end();
}; 