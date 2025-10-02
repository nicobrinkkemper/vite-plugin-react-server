import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import type { ServerRscStreamOptions, ServerRscStreamResult } from "./createRscStream.types.js";
import { validateRscStreamOptions } from "./createRscStream.utils.js";
import { PassThrough } from "node:stream";
import { MessageChannel } from "node:worker_threads";

/**
 * Creates an RSC stream using two-port communication - simple and idiomatic
 * 
 * The pattern is:
 * 1. Main thread creates a PassThrough stream
 * 2. Worker pipes renderToPipeableStream to MessagePort
 * 3. MessagePort forwards data to main thread PassThrough
 * 4. Main thread can pipe PassThrough to fileWriter
 */
export function createRscStreamTwoPort(options: ServerRscStreamOptions): ServerRscStreamResult {
  const logger = options.logger;
  const verbose = options.verbose || false;

  // Validate options
  validateRscStreamOptions(options, "createRscStream.server");

  if (verbose) {
    logger?.info(`[createRscStream.server:${options.route}] Creating RSC stream with two-port communication`);
  }

  if (!options.rscWorker) {
    throw new Error("RSC worker is required for two-port RSC streaming");
  }

  // Create MessagePorts for communication
  const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
  const { port1: controlPort1, port2: controlPort2 } = new MessageChannel();

  // Create the main thread stream - this is what gets piped to fileWriter
  const rscStream = new PassThrough();

  // Data port - receives RSC data from worker and writes to our stream
  const dataMessageHandler = (chunk: any) => {
    if (chunk === null) {
      // End of stream
      rscStream.end();
    } else {
      // Write RSC data to our stream - let Node.js handle back pressure automatically
      rscStream.write(chunk);
    }
  };
  
  dataPort1.on('message', dataMessageHandler);

  // Control port - handles control messages
  const controlMessageHandler = (message: any) => {
    switch (message.type) {
      case 'ERROR':
        const error = message.error instanceof Error ? message.error : new Error("RSC stream error");
        
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
        rscStream.end();
        break;
      case 'METRICS':
        // Metrics are handled by the worker internally
        break;
    }
  };
  
  controlPort1.on('message', controlMessageHandler);

  // Send initialization to worker
  options.rscWorker.postMessage({
    type: "INIT",
    id: options.route,
    dataPort: dataPort2,
    controlPort: controlPort2,
    options: {
      route: options.route,
      url: options.url,
      pagePath: options.pagePath,
      propsPath: options.propsPath,
      rootPath: options.rootPath,
      htmlPath: options.htmlPath,
      pageExportName: options.pageExportName,
      propsExportName: options.propsExportName,
      rootExportName: options.rootExportName,
      htmlExportName: options.htmlExportName,
      moduleRootPath: options.moduleRootPath,
      moduleBasePath: options.moduleBasePath,
      moduleBaseURL: options.moduleBaseURL,
      projectRoot: options.projectRoot,
      verbose: options.verbose,
      rscTimeout: options.rscTimeout,
      build: options.build,
      manifest: options.manifest,
      cssFiles: options.cssFiles,
      globalCss: options.globalCss,
      // Add component overrides if available
      HtmlComponent: (options as any).HtmlComponent,
      RootComponent: (options as any).RootComponent,
      PageComponent: (options as any).PageComponent,
    }
  }, [dataPort2, controlPort2] as any);

  // Return simple stream interface
  const serverResult: ServerRscStreamResult = {
    id: options.id || options.route,
    type: "server" as const,
    rscStream,
    pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => {
      rscStream.pipe(destination);
      return destination;
    },
    abort: (reason?: unknown) => {
      controlPort1.postMessage({ type: "ABORT", reason });
      
      // Clean up event listeners to prevent memory leaks
      dataPort1.removeListener('message', dataMessageHandler);
      controlPort1.removeListener('message', controlMessageHandler);
      
      rscStream.end();
      // Don't close ports - let React handle cleanup to prevent "Connection closed" errors
      // Ports will be cleaned up when worker terminates
    },
    metrics: createStreamMetrics(),
  };

  return serverResult;
}