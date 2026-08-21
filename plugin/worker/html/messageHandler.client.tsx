import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { parentPort, workerData } from "node:worker_threads";
import { handleHtmlRender } from "./handleHtmlRender.client.js";
import type { HtmlWorkerInputMessage } from "./types.js";
import { serializeError } from "../../error/serializeError.js";
import { serializeErrorInfo } from "../../error/serializeErrorInfo.js";
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { activeStreams, moduleIds } from "./state.client.js";

const verbose = Boolean(workerData?.userOptions?.verbose);
const logger = createLogger(workerData.resolvedConfig?.logLevel ?? "info");

// Function to clear all global worker state to prevent race conditions
function clearWorkerState() {
  // Clear active streams
  activeStreams.clear();
  
  // Clear module IDs
  moduleIds.clear();
  
  // Note: temporaryReferences is a WeakMap, so it will be garbage collected automatically
  // when the references are no longer held by the main thread
  
  if (verbose) {
    logger.info(`[html-worker] Cleared global worker state`);
  }
}

export async function messageHandler(msg: HtmlWorkerInputMessage) {
  if (msg && msg.type === "INIT") {
    const { id, dataPort, controlPort, options } = msg;
    
    // Reset worker state for new page render to prevent race conditions
    // This ensures each page render starts with a clean slate
    clearWorkerState();
    
    if (verbose) {
      logger.info(`[html-worker] Resetting worker state for new page render: ${id}`);
    } else if(!workerData?.userOptions) {
      logger.warn(`[html-worker] No user options found for new page render: ${id}`);
    }
    
    if (options == null) {
      controlPort.postMessage({
        type: "ERROR",
        id,
        error: {
          name: "InvalidOptionsError",
          message: "Invalid options",
        },
      });
      return;
    }
    // Check if both ports are available
    if (!dataPort || !controlPort) {
      return;
    }

    try {
      // Create a PassThrough stream to receive RSC data from the main thread
      const rscStream = new PassThrough();
      let streamStarted = false;
      let htmlRenderStarted = false;
      let isMainThreadReady = true; // Flag to indicate if the main thread is ready for more data
      let pendingHtmlChunks: any[] = []; // Buffer for HTML chunks when main thread is not ready
      let pendingEndMessage = false; // Track if we have a pending END message
      let chunksSentCount = 0; // Track number of chunks sent to main thread
      let chunksReceivedCount = 0; // Track number of chunks confirmed received by main thread
      
      // Function to process pending HTML chunks when main thread becomes ready
      const processPendingHtmlChunks = () => {
        if (verbose && pendingHtmlChunks.length > 0) {
          logger.info(`[html-worker] Processing ${pendingHtmlChunks.length} pending HTML chunks for route: ${id}`);
        }
        
        while (pendingHtmlChunks.length > 0 && isMainThreadReady) {
          const chunk = pendingHtmlChunks.shift()!;
          dataPort.postMessage(chunk);
          chunksSentCount++;
          if (verbose) {
            logger.info(`[html-worker] Processed pending HTML chunk ${chunksSentCount} for route: ${id}`);
          }
        }
        
        // If all chunks are processed and we have a pending END message, check if we can send it
        if (pendingHtmlChunks.length === 0 && pendingEndMessage && isMainThreadReady) {
          // Only send END if all sent chunks have been confirmed received
          if (chunksSentCount === chunksReceivedCount) {
            if (verbose) {
              logger.info(`[html-worker] Sending pending END message for route: ${id} (all ${chunksSentCount} chunks confirmed received)`);
            }
            pendingEndMessage = false;
            controlPort.postMessage({ type: "END", id });
          } else {
            if (verbose) {
              logger.info(`[html-worker] Waiting to send END message for route: ${id} (${chunksReceivedCount}/${chunksSentCount} chunks confirmed received)`);
            }
          }
        }
      };

      // Set up the HTML render process once when we receive the first chunk
      const startHtmlRender = () => {
        if (htmlRenderStarted) return;
        htmlRenderStarted = true;
        
        if (verbose)
          logger.info(
            `[html-worker] Starting HTML render process for route: ${id}`
          );

        // Start the HTML render process
        handleHtmlRender(
          {
            id,
            route: options.route,
            // Static-prerender flag from the SSG render path; live renders
            // through this worker never set it and keep streaming.
            prerender: options?.prerender === true,
            rscStream,
            projectRoot:
              options?.projectRoot ??
              workerData?.userOptions?.projectRoot ??
              process.cwd(),
            moduleRootPath:
              options?.moduleRootPath ??
              workerData?.userOptions?.moduleRootPath,
            moduleBasePath:
              options?.moduleBasePath ??
              workerData?.userOptions?.moduleBasePath ??
              DEFAULT_CONFIG.MODULE_BASE_PATH,
            moduleBaseURL:
              options?.moduleBaseURL ??
              workerData?.userOptions?.moduleBaseURL ??
              DEFAULT_CONFIG.MODULE_BASE_URL,
            htmlTimeout:
              options?.htmlTimeout ??
              workerData?.userOptions?.htmlTimeout ??
              DEFAULT_CONFIG.HTML_TIMEOUT,
            clientPipeableStreamOptions:
              options?.clientPipeableStreamOptions ??
              workerData?.userOptions?.clientPipeableStreamOptions ??
              {},
            logger,
            verbose,
          },
          {
            onHtmlRender: (id) => {
              controlPort.postMessage({ type: "HTML_RENDER_START", id });
            },
            onError: (id, error, errorInfo) => {
              controlPort.postMessage({
                type: "ERROR",
                id,
                error: serializeError(error),
                errorInfo: serializeErrorInfo(errorInfo),
              });
            },
            onEnd: (id) => {
              // Follow the same pattern as RSC worker: send null to data port, then END to control port
              if (verbose) {
                logger.info(`[html-worker] React stream ended for route: ${id}, signaling end of data stream`);
              }
              
              // Signal end of data stream via data port (same as RSC worker)
              dataPort.postMessage(null);
              
              // Send END control message
              if (verbose) {
                logger.info(`[html-worker] Sending END control message for route: ${id}`);
              }
              controlPort.postMessage({ type: "END", id });
            },
            onShellError: (id, error) => {
              controlPort.postMessage({
                type: "SHELL_ERROR",
                id,
                error: serializeError(error),
              });
            },
            onData: (_id, data) => {
              // Send HTML data via dataPort (raw data, no type wrapper)
              // But only if the main thread is ready to receive it
              if (isMainThreadReady) {
                dataPort.postMessage(data);
                chunksSentCount++;
                if (verbose) {
                  logger.info(`[html-worker] Sent HTML chunk ${chunksSentCount} for route: ${id}`);
                }
              } else {
                // Main thread is backpressured, buffer this data
                pendingHtmlChunks.push(data);
                if (verbose) {
                  logger.info(`[html-worker] Main thread backpressured, buffering HTML chunk for route: ${id}`);
                }
              }
            },
            onMetrics: (id, metrics) => {
              controlPort.postMessage({ type: "METRICS", id, metrics });
            },
            onHmrAccept: () => {
              // HMR not needed for server-side rendering
            },
            onHmrUpdate: () => {
              // HMR not needed for server-side rendering
            },
            onCleanup: () => {
              // Don't close ports - let React handle cleanup to prevent "Connection closed" errors
              // Worker termination will handle port cleanup
            },
          }
        );
      };

      // Set up control port message handler for backpressure control
      controlPort.onmessage = (event: any) => {
        const message = event.data;
        
        if (verbose) {
          logger.info(`[html-worker] Received control message: ${message.type} for route: ${id}`);
        }
        
        switch (message.type) {
          case 'PAUSE':
            // Main thread is backpressured, pause sending data
            if (verbose) {
              logger.info(`[html-worker] Main thread backpressured, pausing HTML output for route: ${id}`);
            }
            isMainThreadReady = false;
            break;
          case 'RESUME':
            // Main thread is ready to receive more HTML data
            chunksReceivedCount++;
            if (verbose) {
              logger.info(`[html-worker] Main thread ready, resuming HTML output for route: ${id} (chunks received: ${chunksReceivedCount})`);
            }
            isMainThreadReady = true;
            processPendingHtmlChunks();
            break;
          case 'ABORT':
            // Stream was aborted
            if (verbose) {
              logger.info(`[html-worker] Stream aborted for route: ${id}`);
            }
            // Clean up and stop processing
            rscStream.destroy(new Error('Stream aborted'));
            break;
          default:
            // Other control messages are handled by the HTML render handlers
            break;
        }
      };

      // Then set the new event listener
      dataPort.onmessage = (event: any) => {
        const data = event.data;

        if (verbose) {
          logger.info(`[html-worker] Received data on dataPort for route: ${id}, data: ${data == null ? 'null/undefined (end)' : `chunk of size ${data?.length || 'unknown'}`}`);
        }

        // Check for end of stream (both null and undefined indicate end)
        if (data == null) {
          // End of stream - both null and undefined are valid end signals
          if (verbose) {
            logger.info(`[html-worker] End of RSC stream for route: ${id}`);
          }
          rscStream.end();
          return;
        }

        // RSC chunk data - ensure it's a valid chunk
        if (!streamStarted) {
          streamStarted = true;
          if (verbose) {
            logger.info(`[html-worker] Starting HTML render process for route: ${id} after receiving first chunk`);
          }
          // Start the HTML render process when we receive the first chunk
          startHtmlRender();
        }
        
        // Write RSC chunk to the stream
        rscStream.write(data);
        if (verbose) {
          logger.info(`[html-worker] Wrote RSC chunk to stream for route: ${id}`);
        }
        
        // Send READY message to indicate we're ready for more data
        // This implements flow control to prevent backpressure
        if (verbose) {
          logger.info(`[html-worker] Sending READY signal for route: ${id}`);
        }
        controlPort.postMessage({ type: "READY", id: id });
      };
    } catch (error) {
      controlPort.postMessage({
        type: "ERROR",
        id,
        error: {
          name: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    }
  } else if (msg && msg.type === "CLEANUP") {
    // Handle cleanup message to reset worker state between page renders
    const { id } = msg;
    
    if (verbose) {
      logger.info(`[html-worker] Cleaning up worker state for route: ${id}`);
    }
    
    // Reset any internal state that might persist between renders
    // This prevents race conditions where stale state affects subsequent renders
    
    // Send cleanup complete message via parentPort
    if (typeof parentPort !== "undefined" && parentPort) {
      parentPort.postMessage({
        type: "CLEANUP_COMPLETE",
        id: id,
      });
    }
  } else if (msg && msg.type === "SHUTDOWN") {
    // Handle shutdown message
    const { id } = msg;

    // Send shutdown complete message via parentPort
    if (typeof parentPort !== "undefined" && parentPort) {
      parentPort.postMessage({
        type: "SHUTDOWN_COMPLETE",
        id: id,
      });
    }

    // Exit the worker
    process.exit(0);
  }
}
