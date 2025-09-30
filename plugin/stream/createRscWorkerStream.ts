import type { Worker } from "node:worker_threads";
import type { Logger } from "vite";
import { PassThrough } from "node:stream";
import type { SerializeableRenderToPipeableStreamOptions } from "../worker/rsc/types.js";
import { toError } from "../error/toError.js";

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
}

/**
 * Creates an RSC worker stream using the two-port architecture
 * 
 * This function creates RSC streams by offloading React rendering to a separate worker thread
 * using the two-port architecture (data port + control port) for clean separation of concerns.
 * 
 * **Flow**: Route + Components → RSC Worker (two-port) → RSC Stream
 */
export function createRscWorkerStream(options: RscWorkerStreamOptions) {
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
    htmlPath
  } = options;

  // Create two separate MessagePorts for clean separation of concerns
  const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
  const { port1: controlPort1, port2: controlPort2 } = new MessageChannel();
  
  // Ensure cleanup happens even if process exits
  const cleanup = () => {
    // Don't close MessagePorts on process exit - this breaks React consumption
    // MessagePorts should be closed by the consuming side (main thread) when done
    // This follows the idiomatic Node.js streams pattern per the Worker Threads docs
    if (verbose) {
      logger?.info(`[createRscWorkerStream] Process cleanup - not closing MessagePorts (consumer will handle)`);
    }
  };

  // Clean up on process exit (but don't close ports)
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  // Create the RSC output stream
  const rscStream = new PassThrough({
    objectMode: false,
    highWaterMark: 64 * 1024 // 64KB buffer
  });
  
  // Data port - ONLY for raw RSC stream data
  dataPort1.onmessage = (event) => {
    const data = event.data;
    
    if (data === null) {
      // End of stream
      if (verbose) {
        logger?.info(`[createRscWorkerStream] End of RSC stream via dataPort`);
      }
      rscStream.end();
      
      // Note: We don't close ports here - let the stream consumer manage port lifecycle
      // This ensures ReactDOMClient.createFromNodeStream() can fully consume the stream
    } else {
      // Raw RSC data - direct piping
      if (verbose) {
        logger?.info(`[createRscWorkerStream] Writing raw RSC data to stream: ${data.length} bytes`);
      }
      rscStream.write(data);
    }
  };
  
  // Control port - ONLY for control messages
  controlPort1.onmessage = (event) => {
    const message = event.data;
    
    if (verbose) {
      logger?.info(`[createRscWorkerStream] Received control message: ${message.type}`);
    }
    
    switch (message.type) {
      case 'RSC_END':
        if (verbose) {
          logger?.info(`[createRscWorkerStream] RSC stream ended by control message`);
        }
        rscStream.end();
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

  // Add cleanup method to the stream
  (rscStream as any).cleanup = () => {
    // Remove process listeners to prevent memory leaks
    process.off("exit", cleanup);
    process.off("SIGINT", cleanup);
    process.off("SIGTERM", cleanup);
    
    // Don't close the ports here as they might still be in use
    // The ports will be garbage collected when the stream is destroyed
  };

  return rscStream;
}
