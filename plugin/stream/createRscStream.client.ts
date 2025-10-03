import { createSerializableHandlerOptions } from "../helpers/createSerializableHandlerOptions.js";
import type { CreateRscStreamFn, ClientRscStreamResult } from "./createRscStream.types.js";
import { assertNonReactServer } from "../config/getCondition.js";
import { validateRscStreamOptions } from "./createRscStream.utils.js";
import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { MessageChannel } from "node:worker_threads";
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
  const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
  const { port1: controlPort1, port2: controlPort2 } = new MessageChannel();

  // Create the RSC output stream
  const rscStream = new MessagePortReadable(dataPort1);

  // Create serializable handler options for the worker
  const serializedOptions = createSerializableHandlerOptions({
    ...options,
    dataPort: dataPort2,
    controlPort: controlPort2,
  });

  // Send render request to worker
  options.rscWorker.postMessage({
    type: "INIT",
    id: options.id || `${options.route}-${Date.now()}`,
    options: serializedOptions,
  });

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
    abort: () => {
      try {
        controlPort1.postMessage({ type: "ABORT", reason: "Stream aborted" });
        rscStream.destroy();
        dataPort1.close();
        controlPort1.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    },
  };

  return clientResult;
};