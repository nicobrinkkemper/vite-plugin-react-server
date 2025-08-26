import { DEFAULT_CONFIG } from "../config/defaults.js";
import { routeToURL } from "../utils/routeToURL.js";
import { PassThrough } from "node:stream";
import { createLogger } from "vite";
import { createSerializableHandlerOptions } from "../helpers/createSerializableHandlerOptions.js";

import type { CreateRscStreamFn, ClientRscStreamResult } from "./createRscStream.types.js";

import { assertNonReactServer } from "../config/getCondition.js";
import {
  validateRscStreamOptions,
  createBaseRscStreamResult,
  handleRscStreamError,
  createRscStreamMetrics,
  setupRscStreamEventHandlers,
} from "./createRscStream.utils.js";

assertNonReactServer();

/**
 * Creates an RSC stream using the two-port architecture for client-side rendering.
 * 
 * **Purpose**: Creates RSC streams by offloading React rendering to a separate worker thread
 * using the new two-port architecture (data port + control port).
 * 
 * **Flow**: Route + Components → RSC Worker (two-port) → RSC Stream
 * 
 * @param options - Options for RSC stream creation
 * @returns RSC stream with pipe/abort interface
 */
export const createRscStreamTwoPort: CreateRscStreamFn<"client"> = function _createRscStreamTwoPortClient(options) {
  const {
    route,
    verbose = false,
    // Worker options
    worker,
    // Module resolution options
    moduleBaseURL,
    build,
  } = options;

  const logger = (options as any).logger || createLogger();

  // Validate common options
  validateRscStreamOptions(options, "createRscStreamTwoPort.client");

  if (verbose) {
    logger.info(`[createRscStreamTwoPort.client:${route}] Starting RSC worker stream creation with two-port architecture`);
  }

  try {
    const url = options.url || routeToURL(
      route,
      moduleBaseURL ?? DEFAULT_CONFIG.MODULE_BASE_URL,
      build?.rscOutputPath ?? DEFAULT_CONFIG.BUILD.rscOutputPath
    );



    // Ensure we have a worker
    if (!worker) {
      throw new Error("RSC worker is required for client-side RSC streaming");
    }

    // Create two separate MessagePorts for clean separation of concerns
    const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
    const { port1: controlPort1, port2: controlPort2 } = new MessageChannel();
    
    // Create the RSC output stream
    const rscStream = new PassThrough({
      objectMode: false,
      highWaterMark: 64 * 1024 // 64KB buffer
    });
    
    // Data port - ONLY for raw RSC stream data (no type checking needed!)
    dataPort1.onmessage = (event) => {
      const data = event.data;
      
      if (verbose) {
        console.log(`[CLIENT-DEBUG] Received RSC data on dataPort:`, typeof data, data === null ? 'null' : data instanceof Buffer ? 'Buffer' : data instanceof Uint8Array ? 'Uint8Array' : 'object');
      }
      
      if (data === null) {
        // End of stream
        if (verbose) {
          console.log(`[CLIENT-DEBUG] End of RSC stream via dataPort`);
        }
        rscStream.end();
      } else {
        // Raw RSC data - direct piping, no type checking!
        if (verbose) {
          console.log(`[CLIENT-DEBUG] Writing raw RSC data to stream via dataPort, data type:`, typeof data, data instanceof Uint8Array ? 'Uint8Array' : data instanceof Buffer ? 'Buffer' : 'other');
          console.log(`[CLIENT-DEBUG] Data length:`, data.length);
        }
        rscStream.write(data);
      }
    };
    
    // Control port - ONLY for control messages
    controlPort1.onmessage = (event) => {
      const message = event.data;
      
      if (verbose) {
        console.log(`[CLIENT-DEBUG] Received control message:`, message.type);
      }
      
      switch (message.type) {
        case "RSC_END":
        case 'END':
          if (verbose) {
            console.log(`[CLIENT-DEBUG] RSC stream ended by control message`);
          }
          rscStream.end();
          break;
        case 'ERROR':
          if (verbose) {
            console.log(`[CLIENT-DEBUG] Stream error:`, message.error);
          }
          const error = new Error(message.error);
          rscStream.destroy(error);
          break;
        case 'RSC_METRICS':
        case 'METRICS':
          if (verbose) {
            console.log(`[CLIENT-DEBUG] Received RSC metrics:`, message.metrics);
          }
          break;
        case 'RSC_RENDER_START':
          if (verbose) {
            console.log(`[CLIENT-DEBUG] RSC render started`);
          }
          break;
        default:
          if (verbose) {
            console.log(`[CLIENT-DEBUG] Unknown control message type:`, message.type);
          }
      }
    };

    // Send the RSC stream request to the worker with both MessagePorts
    worker.postMessage({
      type: "INIT",
      id: route,
      dataPort: dataPort2,
      controlPort: controlPort2,
      options: createSerializableHandlerOptions({
        ...options,
        url,
        // Ensure required client properties are provided
        projectRoot: options.projectRoot || "",
        cssFiles: options.cssFiles instanceof Map ? options.cssFiles : new Map(),
        globalCss: options.globalCss instanceof Map ? options.globalCss : new Map(),
        manifest: options.manifest || {},
      })
    }, [dataPort2, controlPort2] as any); // Transfer both ports to the worker

    // Create and setup metrics
    const streamMetrics = createRscStreamMetrics(route, verbose);
    
    // Setup event handlers and get cleanup function
    const cleanup = setupRscStreamEventHandlers(
      rscStream,
      streamMetrics,
      {
        route,
        verbose,
        logger
      }
    );

    // Create base result structure
    const baseResult = createBaseRscStreamResult(
      rscStream,
      <Writable extends NodeJS.WritableStream>(destination: Writable) => {
        rscStream.pipe(destination);
        return destination;
      },
      (reason?: unknown) => {
        controlPort1.postMessage({ type: "ABORT", reason: String(reason || "Stream aborted") });
        rscStream.destroy();
        cleanup();
      },
      streamMetrics
    );

    // Return client-specific result
    const clientResult: ClientRscStreamResult = {
      ...baseResult,
      type: "client" as const,
    };

    if (verbose) {
      logger.info(`[createRscStreamTwoPort.client:${route}] RSC worker stream created successfully with two-port architecture`);
    }

    return clientResult;

  } catch (error) {
    handleRscStreamError(error, options, "RSC worker stream creation error");
    // This will never be reached as handleRscStreamError either throws or re-throws
    throw error;
  }
};
