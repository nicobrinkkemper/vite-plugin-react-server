/**
 * Clean Worker Transform Stream Helper
 * 
 * Provides a simple Transform stream that communicates with workers
 * using the two-port architecture (data port + control port) for clean separation of concerns
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
 * Creates a Transform stream that communicates with a worker using two-port architecture
 * 
 * This follows the two-port pattern for clean separation of concerns:
 * 1. Data port handles raw stream data (no message wrapping)
 * 2. Control port handles control messages (start, end, error, metrics)
 * 3. Proper listener cleanup on stream end/error
 */
export function createWorkerTransformStream(options: WorkerTransformStreamOptions): Transform {
  const { 
    worker, 
    route, 
    verbose = false, 
    logger = createLogger(),
    initialMessage,
    transformInput = (chunk) => chunk, // Default: pass through
    processOutput = (message) => message, // Default: pass through
    flushInput = () => null, // Default: send null to end
    flushOutput = (message) => message.type === "END", // Default: end on END message
    onError
  } = options;

  // Create two separate MessagePorts for clean separation of concerns
  const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
  const { port1: controlPort1, port2: controlPort2 } = new MessageChannel();

  // Clean message handler for data port
  const dataMessageHandler = (event: any) => {
    const data = event.data;
    
    if (data === null) {
      // End of stream
      if (verbose) {
        logger?.info(`[WorkerTransformStream:${route}] End of stream via dataPort`);
      }
      transformStream.push(null);
      cleanup();
      return;
    }

    // Process output from worker
    const outputChunk = processOutput(data);
    if (outputChunk !== null) {
      transformStream.push(outputChunk);
      if (verbose) {
        logger?.info(`[WorkerTransformStream:${route}] Pushed chunk: ${outputChunk?.length || 0} bytes`);
      }
    }
  };

  // Clean message handler for control port
  const controlMessageHandler = (event: any) => {
    const message = event.data;
    
    if (verbose) {
      logger?.info(`[WorkerTransformStream:${route}] Received control message: ${message.type}`);
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

    // Handle other control messages (metrics, start signals, etc.)
    if (message.type === "METRICS" && verbose) {
      logger?.info(`[WorkerTransformStream:${route}] Received metrics:`, message.metrics);
    }
  };

  const errorHandler = (_event: MessageEvent) => {
    const error = new Error("MessagePort error");
    if (onError) {
      onError(error);
    } else {
      transformStream.destroy(error);
    }
    cleanup();
  };

  // Cleanup function
  const cleanup = () => {
    dataPort1.removeEventListener("message", dataMessageHandler);
    controlPort1.removeEventListener("message", controlMessageHandler);
    dataPort1.removeEventListener("messageerror", errorHandler);
    controlPort1.removeEventListener("messageerror", errorHandler);
  };

  // Create the transform stream
  const transformStream = new Transform({
    objectMode: false,
    highWaterMark: 64 * 1024, // 64KB buffer

    transform(chunk: any, _encoding: string, callback: (error?: Error | null, data?: any) => void) {
      try {
        if (verbose) {
          logger?.info(`[WorkerTransformStream:${route}] Transforming chunk: ${chunk?.length || 0} bytes`);
        }

        // Transform input chunk
        const transformedChunk = transformInput(chunk);
        
        // Send to worker via data port
        dataPort2.postMessage(transformedChunk);

        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },

    flush(callback: (error?: Error | null) => void) {
      try {
        if (verbose) {
          logger?.info(`[WorkerTransformStream:${route}] Flushing - sending end signal`);
        }
        
        // Send end signal to worker via data port
        const endMessage = flushInput();
        dataPort2.postMessage(endMessage);

        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });

  // Set up message handlers
  dataPort1.addEventListener("message", dataMessageHandler);
  controlPort1.addEventListener("message", controlMessageHandler);
  dataPort1.addEventListener("messageerror", errorHandler);
  controlPort1.addEventListener("messageerror", errorHandler);

  // Send initial message to worker with both ports
  if (initialMessage) {
    worker.postMessage({
      ...initialMessage,
      dataPort: dataPort2,
      controlPort: controlPort2,
    }, [dataPort2, controlPort2] as any);
  }

  // Cleanup on stream close
  transformStream.once("close", () => {
    if (verbose) {
      logger?.info(`[WorkerTransformStream:${route}] Stream closed, cleaning up`);
    }
    cleanup();
  });

  return transformStream;
}