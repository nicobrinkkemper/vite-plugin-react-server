import { PassThrough } from "node:stream";
import { createRenderToPipeableStreamHandler } from "./createRenderToPipeableStreamHandler.server.js";
import type {
  CreateRscStreamFn,
  ServerRscStreamResult,
  ServerRscStreamOptions,
} from "./createRscStream.types.js";
import { assertReactServer } from "../config/getCondition.js";
import {
  validateRscStreamOptions,
  createBaseRscStreamResult,
  handleRscStreamError,
} from "./createRscStream.utils.js";

import { createStreamMetrics } from "../metrics/createStreamMetrics.js";
import { createRscWorkerStream } from "./createRscWorkerStream.js";

assertReactServer();

/**
 * Creates an RSC stream using the server-side render handler.
 *
 * **Purpose**: Creates RSC streams directly in the server environment without worker threads.
 * **When to use**:
 * - You're in a server environment (Node.js server)
 * - You want to create RSC streams synchronously without worker overhead
 * - You need RSC streams for server-side rendering or API responses
 * - You're in a development server and want direct RSC generation
 *
 * **Flow**: Route + Components → RSC Stream (direct server rendering)
 *
 * @example
 * ```typescript
 * // Create RSC stream for server-side rendering
 * const rscStream = createRscStream({
 *   route: "/api/data",
 *   PageComponent: DataPage,
 *   RootComponent: RootLayout,
 *   HtmlComponent: React.Fragment, // Headless for API
 *   pageProps: { data: apiData },
 *   logger: myLogger,
 * });
 *
 * // Pipe to response
 * rscStream.pipe(response);
 * ```
 *
 * @example
 * ```typescript
 * // Create full RSC with HTML wrapper
 * const rscFull = createRscStream({
 *   route: "/about",
 *   PageComponent: AboutPage,
 *   RootComponent: RootLayout,
 *   HtmlComponent: HtmlDocument, // Full HTML wrapper
 *   pageProps: { title: "About Us" },
 * });
 * ```
 *
 * @param options - Options for RSC stream creation
 * @returns RSC stream with pipe/abort interface
 */
export const createRscStream: CreateRscStreamFn<"server"> =
  function _createRscStreamServer(options) {
    const logger = options.logger;
    const verbose = options.verbose || false;

    // Validate common options
    validateRscStreamOptions(options, "createRscStream.server");

    if (verbose) {
      logger?.info(
        `[createRscStream.server:${options.route}] Creating RSC stream for route: ${options.route}`
      );
    }

    try {
      // If worker is provided, use worker-based RSC stream
      // note: don't use the main "worker" prop here, which is always the inverse worker (html-worker in server case)
      if (verbose) {
        logger?.info(`[createRscStream.server:${options.route}] Checking for rscWorker: ${!!options.rscWorker}`);
      }
      if (options.rscWorker) {
        if (verbose) {
          logger?.info(
            `[createRscStream.server:${options.route}] Using worker-based RSC stream`
          );
        }

        const workerStream = createRscWorkerStream({
          worker: options.rscWorker,
          route: options.route,
          url: options.url,
          moduleBasePath: options.moduleBasePath,
          moduleBaseURL: options.moduleBaseURL,
          moduleRootPath: options.moduleRootPath,
          projectRoot: options.projectRoot,
          verbose,
          logger,
          panicThreshold: options.panicThreshold,
          rscTimeout: options.rscTimeout,
          serverPipeableStreamOptions: options.serverPipeableStreamOptions,
          build: options.build,
        });

        // Return worker stream with consistent interface
        const serverResult: ServerRscStreamResult = {
          type: "server" as const,
          rscStream: workerStream,
          pipe: <Writable extends NodeJS.WritableStream>(
            destination: Writable
          ) => {
            workerStream.pipe(destination);
            return destination;
          },
          abort: (reason?: unknown) => {
            workerStream.destroy(
              new Error(String(reason || "Aborted RSC worker stream"))
            );
          },
          metrics: createStreamMetrics(), // Worker will provide real metrics
        };

        return serverResult;
      }

      // Otherwise, use direct server rendering
      const result = createRenderToPipeableStreamHandler(options);

      // Validate the result
      if (!result || typeof result.pipe !== "function") {
        throw new Error(
          "createHandler returned invalid result - missing pipe function"
        );
      }

      if (!result.rscStream) {
        throw new Error(
          "createHandler returned invalid result - missing stream"
        );
      }

      // Create base result structure
      const baseResult = createBaseRscStreamResult(
        result.rscStream,
        result.pipe,
        result.abort,
        result.metrics
      );

      // Return server-specific result
      const serverResult: ServerRscStreamResult = {
        ...baseResult,
        type: "server" as const,
      };

      if (verbose) {
        logger?.info(
          `[createRscStream.server:${options.route}] RSC stream created successfully`
        );
      }

      return serverResult;
    } catch (error) {
      handleRscStreamError(error, options, "RSC stream creation error");
      // This will never be reached as handleRscStreamError either throws or re-throws
      throw error;
    }
  };

/**
 * Creates an RSC stream using two-port communication for clean separation of concerns
 * 
 * **Purpose**: Creates RSC streams with separate data and control ports
 * **When to use**: 
 * - You want clean separation between RSC data and control messages
 * - You need better performance and simpler logic
 * - You're using the new two-port architecture
 * 
 * **Flow**: Route + Components → RSC Worker (Two-Port) → RSC Stream
 */
export function createRscStreamTwoPort(options: ServerRscStreamOptions): ServerRscStreamResult {
  const logger = options.logger;
  const verbose = options.verbose || false;

  // Validate common options
  validateRscStreamOptions(options, "createRscStream.server");

  if (verbose) {
    logger?.info(
      `[createRscStream.server:${options.route}] Creating RSC stream with two-port communication`
    );
  }

  if (!options.rscWorker) {
    throw new Error("RSC worker is required for two-port RSC streaming");
  }

  // Create two separate MessagePorts for clean separation of concerns
  const { port1: dataPort1, port2: dataPort2 } = new MessageChannel();
  const { port1: controlPort1, port2: controlPort2 } = new MessageChannel();
  
  // Create the RSC output stream
  const rscStream = new PassThrough();
  
  // Data port - ONLY for raw RSC stream data (no type checking needed!)
  dataPort1.onmessage = (event: any) => {
    const data = event.data;
    
    console.log(`[MAIN-THREAD-DEBUG] Received RSC data on dataPort:`, typeof data, data === null ? 'null' : data instanceof Buffer ? 'Buffer' : data instanceof Uint8Array ? 'Uint8Array' : 'object');
    
    if (data === null) {
      // End of stream
      console.log(`[MAIN-THREAD-DEBUG] End of RSC stream via dataPort`);
      rscStream.end();
    } else {
      // Raw RSC data - direct piping, no type checking!
      console.log(`[MAIN-THREAD-DEBUG] Writing raw RSC data to stream via dataPort`);
      rscStream.write(data);
    }
  };
  
  // Control port - ONLY for control messages
  controlPort1.onmessage = (event: any) => {
    const message = event.data;
    
    console.log(`[MAIN-THREAD-DEBUG] Received RSC control message:`, message.type);
    
    switch (message.type) {
      case 'END':
        console.log(`[MAIN-THREAD-DEBUG] RSC stream ended by control message`);
        rscStream.end();
        break;
      case 'ERROR':
        console.log(`[MAIN-THREAD-DEBUG] RSC stream error:`, message.error);
        const error = new Error(message.error);
        rscStream.destroy(error);
        break;
      case 'METRICS':
        console.log(`[MAIN-THREAD-DEBUG] Received RSC metrics:`, message.metrics);
        break;
      case 'RSC_RENDER_START':
        console.log(`[MAIN-THREAD-DEBUG] RSC render started`);
        break;
      default:
        console.log(`[MAIN-THREAD-DEBUG] Unknown RSC control message type:`, message.type);
    }
  };

  // Send the RSC stream request to the worker with both MessagePorts
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
  }, [dataPort2, controlPort2] as any); // Transfer both ports to the worker

  const serverResult: ServerRscStreamResult = {
    type: "server" as const,
    rscStream,
    pipe: <Writable extends NodeJS.WritableStream>(
      destination: Writable
    ) => {
      rscStream.pipe(destination);
      return destination;
    },
    abort: (reason?: unknown) => {
      controlPort1.postMessage({ type: "ABORT", reason: "Stream aborted" });
      rscStream.destroy(new Error(String(reason || "Aborted RSC worker stream")));
    },
    metrics: createStreamMetrics(), // Worker will provide real metrics
  };

  return serverResult;
}
