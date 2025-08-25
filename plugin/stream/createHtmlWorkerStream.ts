import type { Worker } from "node:worker_threads";
import type { Logger } from "vite";
import { PassThrough } from "node:stream";

/**
 * HTML-specific options for worker stream
 */
export interface HtmlWorkerStreamOptions {
  worker: Worker;
  route: string;
  url: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  moduleRootPath: string;
  projectRoot: string;
  verbose?: boolean;
  logger?: Logger;
  panicThreshold?: any;
  onError?: (error: Error, errorInfo?: any) => void;
  
  // HTML-specific options
  htmlTimeout?: number;
  serverPipeableStreamOptions?: any;
  clientPipeableStreamOptions?: any;
  build?: any;
}

/**
 * Creates an HTML worker stream using the two-port architecture
 * 
 * This function creates HTML streams by offloading RSC-to-HTML conversion to a separate worker thread
 * using the two-port architecture (data port + control port) for clean separation of concerns.
 * 
 * **Flow**: RSC Stream → HTML Worker (two-port) → HTML Stream
 */
export function createHtmlWorkerStream(options: HtmlWorkerStreamOptions) {
  const {
    worker,
    route,
    url,
    moduleBasePath,
    moduleBaseURL,
    moduleRootPath,
    projectRoot,
    verbose = false,
    logger,
    panicThreshold,
    onError,
    htmlTimeout,
    serverPipeableStreamOptions,
    clientPipeableStreamOptions,
    build
  } = options;

  // Helper to filter functions from options (avoid DataCloneError)
  function filterFunctions(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'function') return undefined;
    if (Array.isArray(obj)) return obj.map(filterFunctions);
    if (typeof obj === 'object') {
      const filtered: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const filteredValue = filterFunctions(value);
        if (filteredValue !== undefined) {
          filtered[key] = filteredValue;
        }
      }
      return filtered;
    }
    return obj;
  }

  // Create two separate MessagePorts for clean separation of concerns
  const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
  const { port1: controlPort1, port2: controlPort2 } = new MessageChannel();
  
  // Create the HTML output stream
  const htmlStream = new PassThrough({
    objectMode: false,
    highWaterMark: 64 * 1024 // 64KB buffer
  });
  
  // Data port - ONLY for raw HTML stream data
  dataPort1.onmessage = (event) => {
    const data = event.data;
    
    if (data === null) {
      // End of stream
      if (verbose) {
        logger?.info(`[createHtmlWorkerStream] End of HTML stream via dataPort`);
      }
      htmlStream.end();
    } else {
      // Raw HTML data - direct piping
      if (verbose) {
        logger?.info(`[createHtmlWorkerStream] Writing raw HTML data to stream: ${data.length} bytes`);
      }
      htmlStream.write(data);
    }
  };
  
  // Control port - ONLY for control messages
  controlPort1.onmessage = (event) => {
    const message = event.data;
    
    if (verbose) {
      logger?.info(`[createHtmlWorkerStream] Received control message: ${message.type}`);
    }
    
    switch (message.type) {
      case 'HTML_END':
        if (verbose) {
          logger?.info(`[createHtmlWorkerStream] HTML stream ended by control message`);
        }
        htmlStream.end();
        break;
      case 'ERROR':
        if (verbose) {
          logger?.error(`[createHtmlWorkerStream] HTML stream error:`, message.error);
        }
        const error = new Error(message.error);
        htmlStream.destroy(error);
        if (onError) {
          onError(error);
        }
        break;
      case 'METRICS':
        if (verbose) {
          logger?.info(`[createHtmlWorkerStream] Received metrics:`, message.metrics);
        }
        break;
      case 'HTML_RENDER_START':
        if (verbose) {
          logger?.info(`[createHtmlWorkerStream] HTML render started`);
        }
        break;
      default:
        if (verbose) {
          logger?.warn(`[createHtmlWorkerStream] Unknown control message type: ${message.type}`);
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
      moduleBasePath,
      moduleBaseURL,
      moduleRootPath,
      projectRoot,
      panicThreshold,
      htmlTimeout,
      // Filter out functions to avoid DataCloneError
      serverPipeableStreamOptions: serverPipeableStreamOptions ? 
        filterFunctions(serverPipeableStreamOptions) : undefined,
      clientPipeableStreamOptions: clientPipeableStreamOptions ?
        filterFunctions(clientPipeableStreamOptions) : undefined,
      // Pass only the essential build properties that exist
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

  return htmlStream;
}
