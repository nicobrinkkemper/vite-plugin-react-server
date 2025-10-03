import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import type { CreateHtmlStreamFn } from "./createHtmlStream.types.js";
import { createSerializableHandlerOptions } from "../helpers/createSerializableHandlerOptions.js";
import { toError } from "../error/toError.js";
import { serializeError } from "../error/serializeError.js";
import { MessageChannel } from "node:worker_threads";
/**
 * Creates an HTML stream using a MessagePort for direct communication with the HTML worker
 */
export const createHtmlStream: CreateHtmlStreamFn = function _createHtmlStream(
  options
) {
  const {
    route,
    id = route,
    rscStream,
    htmlWorker,
    verbose = false,
    logger = createLogger(),
    onError,
    panicThreshold,
  } = options;

  if (verbose) {
    logger.info(
      `[createHtmlStream.server:${route}] Creating HTML stream with MessagePort`
    );
  }

  if (!htmlWorker) {
    throw new Error("HTML worker is required for server-side HTML streaming");
  }

  // Create two separate MessagePorts for clean separation of concerns
  const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
  const { port1: controlPort1, port2: controlPort2 } =
    new MessageChannel();
  
  // Increase max listeners to prevent warnings during development
  // This is a targeted fix for the memory leak warnings
  (dataPort1 as any).setMaxListeners(20);
  (controlPort1 as any).setMaxListeners(20);

  // Create the HTML output stream
  const htmlStream = new PassThrough();

  // Flow control state for HTML output stream backpressure handling
  let isStreamEnded = false;
  let chunkCount = 0; // Track number of chunks sent
  let isHtmlStreamReady = true; // Track if HTML stream can accept more data
  let pendingRscChunks: any[] = []; // Buffer for RSC chunks when HTML stream is backpressured
  // No need to track END message state - rely on null data message for completion

  // Function to process pending RSC chunks when HTML stream becomes ready
  const processPendingRscChunks = () => {
    if (verbose && pendingRscChunks.length > 0) {
      logger.info(
        `[createHtmlStream.server:${route}] Processing ${pendingRscChunks.length} pending RSC chunks`
      );
    }

    while (pendingRscChunks.length > 0 && isHtmlStreamReady && !isStreamEnded) {
      const chunk = pendingRscChunks.shift()!;
      try {
        dataPort1.postMessage(chunk);
        chunkCount++;
        if (verbose) {
          logger.info(
            `[createHtmlStream.server:${route}] Processed pending RSC chunk ${chunkCount}`
          );
        }
      } catch (error) {
        // Still backpressure, put chunk back and stop
        pendingRscChunks.unshift(chunk);
        if (verbose) {
          logger.info(
            `[createHtmlStream.server:${route}] Still backpressure, stopping processing`
          );
        }
        break;
      }
    }
  };

  // Function to send a chunk to the worker
  // Check if HTML stream is ready before sending RSC chunks
  const sendChunk = (chunk: any) => {
    if (!isStreamEnded && isHtmlStreamReady) {
      try {
        dataPort1.postMessage(chunk);
        chunkCount++;
        if (verbose) {
          logger.info(
            `[createHtmlStream.server:${route}] Sent chunk ${chunkCount}`
          );
        }
      } catch (error) {
        // MessagePort error - this will naturally backpressure the RSC stream
        if (verbose) {
          logger.info(
            `[createHtmlStream.server:${route}] MessagePort backpressure detected, RSC stream will naturally slow down`
          );
        }
      }
    } else if (!isStreamEnded) {
      // HTML stream is backpressured, buffer this RSC chunk
      pendingRscChunks.push(chunk);
      if (verbose) {
        logger.info(
          `[createHtmlStream.server:${route}] HTML stream backpressured, buffering RSC chunk (${pendingRscChunks.length} pending)`
        );
      }
    }
  };

  // Data port - receives HTML data from worker
  const dataMessageHandler = (event: any) => {
    if (verbose) {
    }
    const data = event; // MessagePort events contain the data directly
    
    if (data === undefined) {

      return; // Ignore undefined messages
    }

    if (data === null) {
      // End of stream
      if (verbose) {
        logger.info(`[createHtmlStream.server:${route}] HTML stream ended by worker`);
      }
      htmlStream.end();

      // Clean up listeners and close ports when stream ends naturally
      cleanup();

      // Send cleanup message to worker to reset its internal state
      // This prevents race conditions between page renders
      htmlWorker.postMessage({ type: "CLEANUP", id: id, route: route });
    } else {
      // Raw HTML data from worker - write to stream
      if (verbose) {
        logger.info(`[createHtmlStream.server:${route}] Writing HTML chunk: ${data.length} bytes`);
      }
      
      // Check if the HTML stream is still writable before attempting to write
      if (htmlStream.destroyed || htmlStream.writableEnded) {
        if (verbose) {
          logger.info(`[createHtmlStream.server:${route}] HTML stream already ended, ignoring data chunk`);
        }
        return;
      }

      // Data received - stream is still active

      // Check if the HTML stream can accept more data (backpressure handling)
      const canWrite = htmlStream.write(data);

      if (!canWrite) {
        // HTML stream is backpressured, pause the worker
        if (verbose) {
          logger.info(
            `[createHtmlStream.server:${route}] HTML stream backpressured, pausing worker`
          );
        }
        isHtmlStreamReady = false;
        
        // Tell the worker to pause sending more data
        controlPort1.postMessage({ type: "PAUSE", id: id });

        // Listen for drain event to resume
        htmlStream.once("drain", () => {
          if (verbose) {
            logger.info(
              `[createHtmlStream.server:${route}] HTML stream drained, resuming worker`
            );
          }
          isHtmlStreamReady = true;
          // Process any pending RSC chunks first
          processPendingRscChunks();
          // Tell worker it can resume sending data
          controlPort1.postMessage({ type: "RESUME", id: id });
        });
      }
      
    }
  };
  
  dataPort1.on('message', dataMessageHandler);

  // Control port
  const controlMessageHandler = (event: any) => {
  
    const message = event; // MessagePort events contain the data directly
    
    if (!message || typeof message !== 'object') {
     
      return; // Ignore invalid messages
    }
    

    switch (message.type) {
      case "READY":
        // Flow control: HTML worker is ready for more data
        if (verbose) {
          logger.info(`[createHtmlStream.server:${route}] HTML worker ready for more data`);
        }
        // Process any pending RSC chunks that were buffered due to backpressure
        processPendingRscChunks();
        break;
      case "END":
        // Don't end the stream yet - wait for the null data message
        // The worker will send null through the data port when actually done
        if (verbose) {
          logger.info(
            `[createHtmlStream.server:${route}] Received END message, waiting for null data to confirm completion`
          );
        }
        break;
      case "ERROR":
        const error = toError(message.error, message.errorInfo);
        htmlStream.destroy(error);

        // Call the error callback if provided
        if (onError) {
          const isPanic = panicThreshold === "all_errors";
          onError(error, isPanic);
        }

        // Clean up listeners and close ports when stream is destroyed due to error
        cleanup();

        // Send cleanup message to worker to reset its internal state
        // This prevents race conditions between page renders
        htmlWorker.postMessage({ type: "CLEANUP", id: id, route: route });
        break;
      case "METRICS":
        break;
      case "HTML_RENDER_START":
        break;
      case "CLEANUP_COMPLETE":
        // Worker has completed cleanup - this is just a confirmation
        if (verbose) {
          logger.info(`[createHtmlStream.server:${route}] Worker cleanup completed for route ${message.id}`);
        }
        break;
      default:
        break;
    }
  };
  
  controlPort1.on('message', controlMessageHandler);

  // Send the HTML stream request to the worker with both MessagePorts
  htmlWorker.postMessage(
    {
      type: "INIT",
      id: route,
      dataPort: dataPort2,
      controlPort: controlPort2,
      options: createSerializableHandlerOptions(options),
    },
    [dataPort2, controlPort2] as any
  ); // Transfer both ports to the worker

  // If we have an RSC stream, pipe it to the worker via dataPort
  if (rscStream) {
    if (verbose) {
      logger.info(
        `[createHtmlStream.server:${route}] Piping RSC stream to HTML worker`
      );
    }

    // Pipe the RSC stream data directly to the worker via dataPort
    rscStream.on("data", (chunk) => {
      sendChunk(chunk);
    });

    rscStream.on("end", () => {
      isStreamEnded = true;
    });

    rscStream.on("error", (error) => {
      const serializedError = serializeError(error);
      controlPort1.postMessage({ type: "ERROR", error: serializedError });
      dataPort1.postMessage({ error: serializedError });
    });
  }

  // Unified cleanup function that handles listeners only
  // Let React manage the MessagePort lifecycle to prevent "Connection closed" errors
  const cleanup = () => {
    try {
      dataPort1.removeListener('message', dataMessageHandler);
      controlPort1.removeListener('message', controlMessageHandler);
      // Don't close ports - let React finish consuming and close naturally
    } catch (error) {
      // Ignore cleanup errors
    }
  };

  // Note: Process-level cleanup is handled by worker shutdown protocol

  return {
    pipe: (destination: any) => htmlStream.pipe(destination),
      abort: () => {
    controlPort1.postMessage({ type: "ABORT", reason: "Stream aborted" });
    htmlStream.end();

    // Use unified cleanup
    cleanup();

    // Send cleanup message to worker to reset its internal state
    // This prevents race conditions between page renders
    htmlWorker.postMessage({ type: "CLEANUP", id: id, route: route });
  },
  };
};
