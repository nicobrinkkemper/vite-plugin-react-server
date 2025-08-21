import type { Logger } from "vite";

export interface StreamTimeoutOptions {
  timeout: number;
  route: string;
  verbose: boolean;
  logger?: Logger;
  context?: string;
  onTimeout?: () => void;
}

/**
 * Creates a timeout handler for streams to ensure they complete even if React doesn't end them naturally
 * 
 * This helper can be used across different render contexts:
 * - RSC streams in workers
 * - HTML streams in workers
 * - Client-side streams
 * - Server-side streams
 * 
 * @param stream - The stream to add timeout to
 * @param options - Timeout configuration options
 * @returns The timeout ID that can be cleared if needed
 */
export function createStreamTimeout(
  stream: NodeJS.ReadableStream | NodeJS.WritableStream,
  options: StreamTimeoutOptions
): NodeJS.Timeout {
  const { timeout, route, verbose, logger, context = "stream", onTimeout } = options;

  const timeoutId = setTimeout(() => {
    if (verbose && logger) {
      logger.info(
        `[${context}:${route}] Stream timeout reached (${timeout}ms), forcing completion`
      );
    }

    // Call custom timeout handler if provided
    if (onTimeout) {
      onTimeout();
    }

    // Force stream completion if it hasn't ended naturally
    // Note: We need to check if the stream has a 'destroyed' property
    const streamWithDestroyed = stream as any;
    if (streamWithDestroyed.destroyed === undefined || !streamWithDestroyed.destroyed) {
      if ('end' in stream) {
        (stream as NodeJS.WritableStream).end();
      }
    }
  }, timeout);

  return timeoutId;
}
