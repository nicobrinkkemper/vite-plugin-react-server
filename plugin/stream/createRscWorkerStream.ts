import type { Worker } from "node:worker_threads";
import type { Logger } from "vite";
import { PassThrough } from "node:stream";
import type { SerializeableRenderToPipeableStreamOptions } from "../worker/rsc/types.js";
import { toError } from "../error/toError.js";
import { createMessageChannels } from "./createMessageChannels.js";
import type { RouteLayer } from "../router/scanRoutes.js";

/**
 * RSC-specific options for worker stream
 */
export interface RscWorkerStreamOptions {
  worker: Worker;
  route: string;
  url: string;
  projectRoot: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  moduleRootPath: string;
  serverPipeableStreamOptions: SerializeableRenderToPipeableStreamOptions;
  verbose?: boolean;
  logger?: Logger;
  panicThreshold?: any;
  onError?: (error: Error, errorInfo?: any) => void;
  
  // RSC-specific options
  rscTimeout?: number;
  build?: any;
  pagePath?: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  /** Nested-layout chain (`route.tsx` layer paths) for the matched route. */
  layouts?: RouteLayer[];
  layoutExportName?: string;
}

/**
 * Creates an RSC worker stream using the two-port architecture
 * 
 * This function creates RSC streams by offloading React rendering to a separate worker thread
 * using the two-port architecture (data port + control port) for clean separation of concerns.
 * 
 * **Flow**: Route + Components → RSC Worker (two-port) → RSC Stream
 */
export function createRscWorkerStream(options: RscWorkerStreamOptions): {
  stream: PassThrough;
  dataPort1: any;
  controlPort1: any;
} {
  const {
    worker,
    route,
    url,
    projectRoot,
    verbose = false,
    logger,
    panicThreshold,
    serverPipeableStreamOptions,
    onError,
    rscTimeout,
    build,
    pagePath,
    propsPath,
    rootPath,
    htmlPath,
    layouts,
    layoutExportName,
  } = options;

  // Create two separate MessagePorts for clean separation of concerns
  const { dataPort1, dataPort2, controlPort1, controlPort2 } = createMessageChannels();
  
  // Note: Cleanup is handled by the response close handler in configureReactServer.server.ts
  // This prevents multiple cleanup mechanisms from conflicting
  
  // Create the RSC output stream
  const rscStream = new PassThrough({
    objectMode: false,
    highWaterMark: 64 * 1024 // 64KB buffer
  });
  
  // The data port's `null` signal is the only ordered end-of-stream authority
  // (it queues behind every chunk on the same port). RSC_END arrives on the
  // control port, and cross-port delivery order is NOT guaranteed — ending
  // from RSC_END can truncate chunks still queued on the data port (notably
  // the in-band `$E` frame after a render failure). RSC_END never ends the
  // stream; the only other terminal condition is worker death, which errors a
  // stream whose `null` never arrived (see the exit handler below).
  let dataEndedReceived = false;

  // Data port - ONLY for raw RSC stream data
  (dataPort1 as any).onmessage = (event: any) => {
    const data = event.data;

    if (data === null) {
      // End of stream
      if (verbose) {
        logger?.info(`[createRscWorkerStream] End of RSC stream via dataPort`);
      }
      dataEndedReceived = true;
      rscStream.end();

      // Note: We don't close ports here - let the stream consumer manage port lifecycle
      // This ensures ReactDOMClient.createFromNodeStream() can fully consume the stream
    } else if (data && data.type === 'ERROR') {
      // Failures ride the DATA port so they are ordered ahead of the null
      // end-signal (handlers.onDataError). The envelope must be decoded
      // BEFORE the byte branch: writing the object into the binary stream
      // throws ERR_INVALID_ARG_TYPE from the message callback and buries the
      // real error. Post-null it cannot un-complete the stream, but the
      // failure still reaches onError.
      const dataError = toError(data.error);
      if (verbose) {
        logger?.error(
          `[createRscWorkerStream] RSC stream error via dataPort: ${dataError.message}`
        );
      }
      if (!dataEndedReceived) {
        rscStream.destroy(dataError);
      }
      if (onError) {
        onError(dataError);
      }
    } else {
      // Raw RSC data - direct piping
      if (verbose) {
        logger?.info(`[createRscWorkerStream] Writing raw RSC data to stream: ${data.length} bytes`);
      }
      if (!rscStream.writableEnded) {
        rscStream.write(data);
      }
    }
  };

  // A data port closing before the null is a truncation even while the
  // worker lives (far port torn down, GC'd channel) — without this the
  // stream hangs. Never a clean end.
  (dataPort1 as any).on?.('close', () => {
    if (!dataEndedReceived) {
      rscStream.destroy(
        new Error(
          '[createRscWorkerStream] data port closed before end-of-stream (null) — stream truncated'
        )
      );
    }
  });
  
  // Control port - ONLY for control messages
  (controlPort1 as any).onmessage = (event: any) => {
    const message = event.data;
    
    if (verbose) {
      logger?.info(`[createRscWorkerStream] Received control message: ${message.type}`);
    }
    
    switch (message.type) {
      case 'RSC_END':
        if (verbose) {
          logger?.info(`[createRscWorkerStream] RSC stream ended by control message`);
        }
        // See the dataEndedReceived note above: RSC_END never ends the stream.
        break;
      case 'ERROR':
        if (verbose) {
          logger?.error(`[createRscWorkerStream] RSC stream error: ${message.error?.message}`, {error: message.error});
        }
        const error = toError(message.error);
        rscStream.destroy(error);
        
        if (onError) {
          onError(error);
        }
        break;
      case 'METRICS':
        if (verbose) {
          logger?.info(`[createRscWorkerStream] Received metrics:`, message.metrics);
        }
        break;
      case 'RSC_RENDER_START':
        if (verbose) {
          logger?.info(`[createRscWorkerStream] RSC render started`);
        }
        break;
      default:
        if (verbose) {
          logger?.warn(`[createRscWorkerStream] Unknown control message type: ${message.type}`);
        }
    }
  };

  // Worker death is the only terminal condition besides the data port's
  // `null`: a dead worker can never complete the stream, and ending it
  // cleanly would serve a truncated payload as a success. Error it so the
  // failure is visible to the consumer. The listener is removed when the
  // stream closes — the worker outlives individual requests.
  const workerExitHandler = (code: number) => {
    if (!dataEndedReceived) {
      rscStream.destroy(
        new Error(
          `[createRscWorkerStream] RSC worker exited (code ${code}) before ending the stream for ${route}`
        )
      );
    }
  };
  (worker as any).once?.("exit", workerExitHandler);
  rscStream.on("close", () => {
    (worker as any).removeListener?.("exit", workerExitHandler);
  });

  // Send the INIT message to the worker with both MessagePorts
  worker.postMessage({
    type: "INIT",
    id: route,
    dataPort: dataPort2,
    controlPort: controlPort2,
    options: {
      route,
      url,
      projectRoot,
      panicThreshold,
      rscTimeout,
      serverPipeableStreamOptions,
      pagePath,
      propsPath,
      rootPath,
      htmlPath,
      layouts,
      layoutExportName,
      build: build ? {
        outDir: build.outDir,
        assetsDir: build.assetsDir,
        pages: build.pages,
        static: build.static,
        rscOutputPath: build.rscOutputPath,
        htmlOutputPath: build.htmlOutputPath,
      } : undefined,
    }
  }, [dataPort2, controlPort2] as any); // Transfer both ports to the worker

  // Note: Cleanup is handled by the response close handler in configureReactServer.server.ts
  // No need for a cleanup method on the stream itself

  return {
    stream: rscStream,
    dataPort1,
    controlPort1
  };
}
