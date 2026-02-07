import type { HandleRscStreamFn } from "./handleRscStream.types.js";
import { PassThrough } from "node:stream";
import { createMessageChannels, createTransferList } from "./createMessageChannels.js";

import { DEFAULT_CONFIG } from "../config/defaults.js";
import { join } from "node:path";

/**
 * Client-side RSC stream handler using unified stream management
 *
 * Handle = calling createRscStream and handling errors
 * - panicThreshold
 * - verbose logging
 * - calling event handlers
 * - passing the correct options to createRscStream
 * - unified stream management with consistent error handling
 *
 * @param worker - The worker thread
 * @param message - The RSC render message
 * @returns A ReadableStream that yields RSC chunks
 */
export const handleRscStream: HandleRscStreamFn<"client"> =
  function _handleWorkerRscStream({ options }) {
    // Generate a unique request id to avoid conflicts with concurrent requests
    const requestId =
      options.id ??
      `${options.route}-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`;

    // Create MessageChannels for two-port communication
    const { dataPort1, dataPort2, controlPort1, controlPort2 } = createMessageChannels();
    
    // Create a PassThrough stream that preserves Uint8Array data without mutation
    const rscStream = new PassThrough({ objectMode: false });
    const route = options.route;

    const worker = options.rscWorker || options.worker;
    if (!worker) {
      throw new Error("No worker provided");
    }

    // Set up control message handlers
    const controlMessageHandler = (message: any) => {
      if (options.verbose) {
        options.logger?.info(
          `[client] Received control message: ${message.type}`
        );
      }

      switch (message.type) {
        case "RSC_RENDER_START":
          if (options.verbose) {
            options.logger?.info(
              `[client] RSC render started for ${message.id}`
            );
          }
          break;
        case "RSC_END":
          if (options.verbose) {
            options.logger?.info(`[client] RSC render ended for ${message.id}`);
          }
          // Now it's safe to end the stream
          rscStream.end();
          break;
        case "ERROR":
          if (options.verbose) {
            options.logger?.error(
              `[client] RSC render error for ${message.id}: ${
                message.error?.message || "Unknown error"
              }`,
              { error: message.error }
            );
          }
          break;
        default:
          if (options.verbose) {
            options.logger?.info(
              `[client] Unhandled control message: ${message.type}`
            );
          }
      }
    };

    controlPort1.on("message", controlMessageHandler);

    // Set up data message handlers - pass Uint8Array data without mutation
    const dataMessageHandler = (data: any) => {
      if (data === null) {
        // End of data stream signal - React Server Component rendering is complete
        if (options.verbose) {
          options.logger?.info(`[client] Received end signal via dataPort - completing stream`);
        }
        // Signal that the stream is complete so React can finish consuming
        rscStream.end();
      } else if (data && data.type === 'ERROR') {
        // Stream error via data port
        if (options.verbose) {
          options.logger?.error(
            `[client] RSC stream error via dataPort: ${data.error}`
          );
        }
        rscStream.destroy(new Error(data.error));
      } else if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
        // RSC chunk data - pass through without mutation
        if (options.verbose) {
          options.logger?.info(
            `[client] Received RSC chunk via dataPort: ${data.length} bytes`
          );
        }
        // Write the Uint8Array directly without conversion - keep it as raw bytes
        rscStream.write(data);
      } else {
        // Unknown data format - log and ignore
        if (options.verbose) {
          options.logger?.warn(
            `[client] Unknown data format via dataPort: ${typeof data}`
          );
        }
      }
    };

    dataPort1.on("message", dataMessageHandler);

    // Send the render message to the worker with ports
    worker.postMessage({
      type: "INIT",
      id: requestId,
      dataPort: dataPort2,
      controlPort: controlPort2,
      options: {
        route: route,
        url: options.url || "",
        projectRoot: options.projectRoot || process.cwd(),
        moduleBasePath:
          options.moduleBasePath || DEFAULT_CONFIG.MODULE_BASE_PATH,
        moduleBaseURL: options.moduleBaseURL || DEFAULT_CONFIG.MODULE_BASE_URL,
        moduleRootPath:
          options.moduleRootPath ||
          join(
            options.projectRoot,
            options.build.outDir,
            options.build.server,
            options.moduleBasePath === "" ? "/" : ""
          ),
        cssFiles: options.cssFiles || new Map(),
        globalCss: options.globalCss || new Map(),
        manifest: options.manifest || {},
        serverPipeableStreamOptions: options.serverPipeableStreamOptions || {},
        clientPipeableStreamOptions: options.clientPipeableStreamOptions || {},
        verbose: options.verbose,
        panicThreshold: options.panicThreshold,
        pagePath: options.pagePath,
        propsPath: options.propsPath,
        rootPath: options.rootPath,
        htmlPath: options.htmlPath,
        pageExportName: options.pageExportName,
        propsExportName: options.propsExportName,
        rootExportName: options.rootExportName,
        htmlExportName: options.htmlExportName,
        moduleBase: options.moduleBase,
        publicOrigin: options.publicOrigin,
        rscTimeout: options.rscTimeout,
        htmlTimeout: options.htmlTimeout,
        fileWriteTimeout: options.fileWriteTimeout,
        workerShutdownTimeout: options.workerShutdownTimeout,
        rscWorkerPath: options.rscWorkerPath,
        htmlWorkerPath: options.htmlWorkerPath,
        css: options.css,
        build: options.build,
      },
    }, createTransferList(dataPort2, controlPort2)); // Transfer the ports properly

    // Convert Node.js Readable to Web ReadableStream with proper cleanup
    return new ReadableStream<Uint8Array>({
      start(controller) {
        rscStream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        rscStream.on("end", () => {
          controller.close();
          // Clean up MessagePort listeners when stream ends successfully
          try {
            dataPort1.removeListener('message', dataMessageHandler);
            controlPort1.removeListener('message', controlMessageHandler);
            // Close MessagePorts
            dataPort1.close();
            controlPort1.close();
          } catch (error) {
            // Ignore cleanup errors
          }
        });

        rscStream.on("error", (error) => {
          controller.error(error);
        });
      },
      cancel() {
        // Clean up MessagePort listeners to prevent memory leaks
        try {
          dataPort1.removeListener('message', dataMessageHandler);
          controlPort1.removeListener('message', controlMessageHandler);
          // Close MessagePorts
          dataPort1.close();
          controlPort1.close();
        } catch (error) {
          // Ignore cleanup errors
        }
        // Destroy the stream
        rscStream.destroy();
      },
    });
  };
