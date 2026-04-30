import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import type { ReadableStream } from "node:stream/web";
import { handleError } from "../error/handleError.js";
import { getNodeEnv } from "../config/getNodeEnv.js";
import type { Logger } from "vite";
import type { PanicThreshold } from "../types.js";

export interface PipeToResponseOptions {
  stream: ReadableStream<Uint8Array> | any; // Allow any for now to handle type mismatches
  response: ServerResponse;
  contentType: string;
  logger: Logger;
  verbose?: boolean;
  panicThreshold?: PanicThreshold;
  context?: string;
}

/**
 * Pipes a ReadableStream to an HTTP response with proper error handling and headers.
 * This is a common pattern used across the plugin for streaming responses.
 */
export function pipeToResponse(options: PipeToResponseOptions): void {
  const { stream, response, contentType, logger, verbose = false, panicThreshold = "none", context = "pipeToResponse" } = options;

  if (!response.writable) {
    if (verbose) {
      logger.warn(`[${context}] Response not writable, skipping pipe`);
    }
    return;
  }

  const readable = Readable.fromWeb(stream as ReadableStream);
  let headersSent = false;

  readable.on('data', (chunk) => {
    if (!headersSent) {
      // Only send headers when first chunk arrives
      response.setHeader("Content-Type", contentType);
      response.setHeader("Transfer-Encoding", "chunked");
      response.setHeader("Connection", "keep-alive");
      headersSent = true;
    }
    response.write(chunk);
  });

  readable.on('end', () => {
    response.end();
  });

  readable.on('error', (error) => {
    // Always log: a stream error here means an RSC render blew up. Without
    // this log the user just sees a hung tab and an empty 5xx, which is
    // exactly the verbose-only behavior bd-qvz #2 calls out.
    const panicError = handleError({
      error,
      logger,
      mode: getNodeEnv(),
      panicThreshold,
      context,
      log: true,
    });

    if (panicError != null) {
      throw panicError;
    }

    if (!headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      const message = error instanceof Error ? error.message : String(error);
      response.end(`RSC render failed: ${message}\n`);
    } else {
      // Headers already flushed (and likely some RSC bytes too). The RSC
      // protocol carries an error frame in-band; just end the response and
      // rely on the prior log line for diagnosability.
      response.end();
    }
  });
}