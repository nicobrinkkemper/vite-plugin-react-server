import { createSerializableHandlerOptions } from "../helpers/createSerializableHandlerOptions.js";

import type { CreateRscStreamFn, ClientRscStreamResult } from "./createRscStream.types.js";

import { assertNonReactServer } from "../config/getCondition.js";
import { validateRscStreamOptions } from "./createRscStream.utils.js";
import { toError } from "../error/toError.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { MessageChannel } from "node:worker_threads";
import { MessagePortReadable } from "./MessagePortReadable.js";

assertNonReactServer();

/**
 * Creates an RSC stream using two-port communication - simple and idiomatic
 * 
 * The pattern is:
 * 1. Main thread creates a PassThrough stream
 * 2. Worker pipes renderToPipeableStream to MessagePort
 * 3. MessagePort forwards data to main thread PassThrough
 * 4. Main thread can pipe PassThrough to fileWriter
 */
export const createRscStreamTwoPort: CreateRscStreamFn<"client"> = function _createRscStreamTwoPortClient(options) {

  // Validate options
  validateRscStreamOptions(options, "createRscStream.client");

  // Creating RSC stream with two-port communication

  if (!options.rscWorker) {
    throw new Error("RSC worker is required for two-port RSC streaming");
  }

  // Create MessagePorts for communication
  const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
  const { port1: controlPort1, port2: controlPort2 } = new MessageChannel();

  // Create a Readable stream that wraps the data port with proper backpressure handling
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

  // Send initialization to worker
  options.rscWorker.postMessage({
    type: "INIT",
    id: options.route,
    dataPort: dataPort2,
    controlPort: controlPort2,
    options: createSerializableHandlerOptions(options),
  }, [dataPort2, controlPort2] as any);

  // Return simple stream interface
  const clientResult: ClientRscStreamResult = {
    id: options.id || options.route,
    type: "client" as const,
    rscStream,
    pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
      rscStream.pipe(destination);
      return destination;
    },
    abort: (reason?: unknown) => {
      try {
        controlPort1.postMessage({ type: "ABORT", reason });
      } catch (error) {
        // Port may already be closed
      }
      
      // Immediate cleanup for abort to prevent hanging
      rscStream.destroy();
      // Don't close ports - let React handle cleanup to prevent "Connection closed" errors
      // Ports will be cleaned up when worker terminates
    },
    metrics: createStreamMetrics(),
  };

  return clientResult;
};