import type { HandleRscStreamFn } from "./handleRscStream.types.js";
import { PassThrough } from "node:stream";
import type { TransferListItem } from "node:worker_threads";

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

    // Create a PassThrough stream to handle RSC chunks
    const rscStream = new PassThrough();
    const route = options.route;

    // Create MessageChannels for two-port communication
    const dataChannel = new MessageChannel();
    const controlChannel = new MessageChannel();

    const worker = options.rscWorker || options.worker;
    if (!worker) {
      throw new Error("No worker provided");
    }

    // Set up control message handlers
    controlChannel.port1.onmessage = (event) => {
      const message = event.data;
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

    // Set up data message handlers
    dataChannel.port1.onmessage = (event) => {
      const data = event.data;

      if (data === null) {
        // End of data stream signal - but don't end the stream yet
        // Wait for RSC_END control message to confirm stream is finished
        if (options.verbose) {
          options.logger?.info(`[client] Received end signal via dataPort`);
        }
        // Don't call rscStream.end() here - wait for RSC_END control message
      } else if (data && data.error) {
        // Stream error
        if (options.verbose) {
          options.logger?.error(
            `[client] RSC stream error via dataPort: ${data.error}`
          );
        }
        rscStream.destroy(new Error(data.error));
      } else {
        // RSC chunk data
        if (options.verbose) {
          options.logger?.info(
            `[client] Received RSC chunk via dataPort: ${data.length} bytes`
          );
        }
        rscStream.write(data);
      }
    };

    // Send the render message to the worker with ports
    worker.postMessage({
      type: "INIT",
      id: requestId,
      dataPort: dataChannel.port2,
      controlPort: controlChannel.port2,
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
    }, [dataChannel.port2 as unknown as TransferListItem, controlChannel.port2 as unknown as TransferListItem]); // Transfer the ports properly

    // Convert the RSC stream directly to a ReadableStream to avoid complex piping
    return new ReadableStream<Uint8Array>({
      start(controller) {
        rscStream.on("data", (chunk: Buffer) => {
          if (options.verbose) {
            options.logger?.info(
              `[client] Enqueuing RSC chunk: ${chunk.length} bytes`
            );
          }
          controller.enqueue(new Uint8Array(chunk));
        });

        rscStream.on("end", () => {
          if (options.verbose) {
            options.logger?.info(`[client] RSC stream ended`);
          }
          controller.close();
        });

        rscStream.on("error", (error) => {
          if (options.verbose) {
            options.logger?.error(
              `[client] RSC stream error: ${error.message}`
            );
          }
          controller.error(error);
        });
      },
      cancel() {
        if (options.verbose) {
          options.logger?.info(`[client] RSC stream cancelled`);
        }
        // Close the message channels
        dataChannel.port1.close();
        controlChannel.port1.close();
        if (!rscStream.destroyed) {
          rscStream.destroy();
        }
      },
    });
  };
