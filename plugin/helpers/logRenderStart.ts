import type { Logger } from "vite";

/**
 * Logs render start if verbose mode is enabled
 * 
 * This helper provides consistent logging across different render contexts:
 * - RSC worker renders
 * - HTML worker renders  
 * - Client-side renders
 * - Server-side renders
 * 
 * @param route - The route being rendered
 * @param verbose - Whether verbose logging is enabled
 * @param logger - The logger instance to use
 * @param context - Optional context identifier (e.g., "rsc-worker", "html-worker", "client", "server")
 */
export function logRenderStart(
  route: string,
  verbose: boolean,
  logger: Logger,
  context: string = "render"
): void {
  if (verbose) {
    logger.info(`[${context}:${route}] Starting render for route: ${route}`);
  }
}
