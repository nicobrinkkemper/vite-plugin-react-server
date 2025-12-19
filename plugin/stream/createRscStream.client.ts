import { createSerializableHandlerOptions } from "../helpers/createSerializableHandlerOptions.js";
import type { CreateRscStreamFn, ClientRscStreamResult } from "./createRscStream.types.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { validateRscStreamOptions } from "./createRscStream.utils.js";
import { toError } from "../error/toError.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { createMessageChannels } from "./createMessageChannels.js";
import { MessagePortReadable } from "./MessagePortReadable.js";

assertNonReactServer();

/**
 * Creates an RSC stream by communicating with the RSC worker.
 * 
 * **Purpose**: Creates RSC streams by offloading React rendering to a separate worker thread.
 * **When to use**: 
 * - You need to create RSC streams in a client environment
 * - You want to avoid blocking the main thread during React rendering
 * - You're building static sites and need RSC content for multiple routes
 * - You need to create .rsc files for client-side navigation
 * 
 * **Flow**: Route + Components → RSC Worker → RSC Stream
 * 
 * @param options - Options for RSC stream creation
 * @returns RSC stream with pipe/abort interface
 */
export const createRscStream: CreateRscStreamFn<"client"> = function _createRscStreamClient(options) {
  // Validate options
  validateRscStreamOptions(options, "createRscStream.client");

  if (!options.rscWorker) {
    throw new Error("RSC worker is required for client-side RSC streaming");
  }

  // Create two separate MessagePorts for clean separation of concerns
  const { dataPort1, dataPort2, controlPort1, controlPort2 } = createMessageChannels();

  // Create the RSC output stream
  const rscStream = new MessagePortReadable(dataPort1, controlPort1);

  // Control port - handles control messages
  controlPort1.on('message', (message: any) => {
    switch (message.type) {
      case 'ERROR':
        const error = toError(message.error, message.errorInfo);
        
        // Emit route.error event for panic handling
        if (options.onEvent) {
          options.onEvent({
            type: "route.error",
            data: {
              error: error,
              route: options.route,
              panicThreshold: options.panicThreshold
            }
          });
        }
        
        // End the stream normally
        rscStream.destroy();
        break;
      case 'RSC_END':
        // Worker has finished sending data - don't close ports yet
        // Let the MessagePortReadable handle the natural end of stream
        break;
      case 'METRICS':
        // Metrics are handled by the worker internally
        break;
    }
  });

  // Create serializable handler options for the worker
  const serializedOptions = createSerializableHandlerOptions({
    ...options,
    dataPort: dataPort2,
    controlPort: controlPort2,
  });

  // Send initialization to worker
  options.rscWorker.postMessage({
    type: "INIT",
    id: options.route,
    dataPort: dataPort2,
    controlPort: controlPort2,
    options: serializedOptions,
  }, [dataPort2, controlPort2] as any);

  // Create stream metrics
  const metrics = createStreamMetrics({
    route: options.route,
    startTime: Date.now(),
  });

  // Return client result with consistent interface
  const clientResult: ClientRscStreamResult = {
    type: "client" as const,
    id: options.id || `${options.route}-${Date.now()}`,
    rscStream,
    metrics,
    pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
      return rscStream.pipe(destination);
    },
    abort: (reason?: unknown) => {
      try {
        controlPort1.postMessage({ type: "ABORT", reason });
      } catch (error) {
        // Port may already be closed
      }
      
      // Immediate cleanup for abort to prevent hanging
      try {
        rscStream.destroy();
      } catch (error) {
        // Stream may already be destroyed, ignore
      }
      // Don't close ports - let React handle cleanup to prevent "Connection closed" errors
      // Ports will be cleaned up when worker terminates
    },
  };

  return clientResult;
};