/**
 * Clean Worker Transform Stream Helper
 * 
 * Provides a simple Transform stream that communicates with workers
 * following the proven patterns from createWorkerStream.server.ts
 */

import { Transform } from "node:stream";
import type { Worker } from "node:worker_threads";
import { createLogger, type Logger } from "vite";

export interface WorkerTransformStreamOptions {
  worker: Worker;
  route: string;
  verbose?: boolean;
  logger?: Logger;
  // Initial message to send to worker when stream starts
  initialMessage?: any;
  // Transform input chunks before sending to worker
  transformInput?: (chunk: any) => any;
  // Process output messages from worker
  processOutput?: (message: any) => any;
  // Transform input when flushing
  flushInput?: () => any;
  // Check if message indicates stream should end
  flushOutput?: (message: any) => boolean;
  // Error handler
  onError?: (error: Error, errorInfo?: any) => void;
}

/**
 * Creates a Transform stream that communicates with a worker
 * 
 * This follows the exact pattern from createWorkerStream.server.ts:
 * 1. Input chunks are sent to worker as RSC_CHUNK
 * 2. Worker responds with HTML_CHUNK messages which are pushed to output
 * 3. Worker sends HTML_COMPLETE when done, which ends the stream
 * 4. Proper listener cleanup on stream end/error
 */
export function createWorkerTransformStream(options: WorkerTransformStreamOptions): Transform {
  const { 
    worker, 
    route, 
    verbose = false, 
    logger = createLogger(),
    initialMessage,
    transformInput = (chunk) => ({ type: "RSC_CHUNK", id: route, chunk }),
    processOutput = (message) => message.type === "HTML_CHUNK" ? message.chunk : null,
    flushInput = () => ({ type: "RSC_END", id: route }),
    flushOutput = (message) => message.type === "HTML_COMPLETE" || message.type === "HTML_RENDER_END",
    onError
  } = options;

  // Clean message handler that follows the proven pattern
  const messageHandler = (message: any) => {
    if (message.id !== route) return;

    // Process output from worker
    const outputChunk = processOutput(message);
    if (outputChunk !== null) {
      transformStream.push(outputChunk);
      if (verbose) {
        logger?.info(`[WorkerTransformStream:${route}] Pushed chunk: ${outputChunk?.length || 0} bytes`);
      }
      return;
    }

    // Check if we should end the stream
    if (flushOutput(message)) {
      transformStream.push(null);
      cleanup();
      if (verbose) {
        logger?.info(`[WorkerTransformStream:${route}] Stream ended by worker (${message.type})`);
      }
      return;
    }

    // Handle errors
    if (message.type === "ERROR") {
      const error = new Error(message.error?.message || "Worker error");
      error.stack = message.error?.stack;
      if (onError) {
        onError(error, message.errorInfo);
      } else {
        transformStream.destroy(error);
      }
      cleanup();
      return;
    }

    // Ignore other message types (like SHELL_READY, ALL_READY, etc.)
  };

  const errorHandler = (error: Error) => {
    if (onError) {
      onError(error);
    } else {
      transformStream.destroy(error);
    }
    cleanup();
  };

  const cleanup = () => {
    // Clean up listeners (same as createWorkerStream.server.ts:51-52, 58-59)
    worker.removeListener("message", messageHandler);
    worker.removeListener("error", errorHandler);
  };

  // Create transform stream with clean implementation
  const transformStream = new Transform({
    transform(chunk: any, _encoding: any, callback: any) {
      // Transform and send chunk to worker
      const message = transformInput(chunk);
      worker.postMessage(message);
      
      if (verbose) {
        logger?.info(`[WorkerTransformStream:${route}] Sent ${message.type}: ${chunk.length} bytes`);
      }
      
      // Don't push to output - worker will send response messages
      callback();
    },

    flush(callback) {
      // Signal end of input to worker
      const message = flushInput();
      worker.postMessage(message);
      
      if (verbose) {
        logger?.info(`[WorkerTransformStream:${route}] Sent ${message.type} signal`);
      }
      
      // Call callback immediately - worker will handle completion
      callback();
    },

    destroy(error: any, callback: any) {
      // Clean up listeners on destroy (same as createWorkerStream.server.ts:78-84)
      cleanup();
      callback(error);
    }
  });

  // Set up worker listeners
  worker.on("message", messageHandler);
  worker.on("error", errorHandler);

  // Send initial message if provided
  if (initialMessage) {
    worker.postMessage(initialMessage);
    if (verbose) {
      logger?.info(`[WorkerTransformStream:${route}] Sent ${initialMessage.type} message`);
    }
  }

  return transformStream;
}