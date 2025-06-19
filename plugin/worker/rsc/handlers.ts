import { sendRscWorkerMessage } from "./sendRscWorkerMessage.js";
import type { StreamHandlers } from "../types.js";
import { toError } from "../../error/toError.js";
import { userOptions } from "./userOptions.js";
import { addCssFileContent, addModuleId } from "./state.js";
import { join } from "path";
import { ReactDOMServer } from "../../vendor/vendor.server.js";
import { PassThrough } from "node:stream";

export const handlers: Required<StreamHandlers> = {
  onError: (id, error, errorInfo) => {
    // Format error for React Server Components
    const formattedError = typeof error === 'string'
      ? {
          message: error,
          reason: error,
          stack: undefined,
          name: 'Error'
        }
      : {
          message: (error as Error)?.message || 'Unknown error',
          reason: (error as Error)?.message || 'Unknown error',
          name: (error as Error)?.name || 'Error',
          stack: (error as Error)?.stack,
          ...(error && typeof error === 'object' ? error : {})
        };

    sendRscWorkerMessage({
      type: "ERROR",
      id: id,
      errorInfo,
      error: formattedError,
    });
  },
  onData: (id, data) => {
    sendRscWorkerMessage({
      type: "RSC_CHUNK",
      id: id,
      chunk: data,
    });
  },
  onEnd: (id) => {
    sendRscWorkerMessage({
      type: "RSC_END",
      id: id,
    });
  },
  onMetrics: (id, metrics) => {
    sendRscWorkerMessage({
      type: "RSC_METRICS",
      id: id,
      metrics,
    });
  },
  onHmrAccept: (id, routes) => {
    sendRscWorkerMessage({
      type: "HMR_ACCEPT",
      id: id,
      routes: routes,
    });
  },
  onHmrUpdate: (id, routes) => {
    sendRscWorkerMessage({
      type: "HMR_UPDATE",
      id: id,
      routes: routes,
    });
  },
  onServerModule: (id, url, source) => {
    addModuleId(id, url);
    sendRscWorkerMessage({
      type: "SERVER_MODULE",
      id,
      url,
      source,
    });
  },
  onServerActionResponse: (id, result) => {
    const stream = ReactDOMServer.renderToPipeableStream(
      result && typeof result === "object" && "returnValue" in result
        ? result
        : {
            type: "server-action-response",
            returnValue: result,
          },
      userOptions.moduleBasePath,
      {
        onError(error: Error) {
          sendRscWorkerMessage({
            type: "ERROR",
            id,
            error: toError(error),
          });
        },
      }
    );

    const passThrough = new PassThrough();
    stream.pipe(passThrough);

    passThrough.on("data", (chunk) => {
      sendRscWorkerMessage({
        type: "RSC_CHUNK",
        id,
        chunk,
      });
    });

    passThrough.on("end", () => {
      sendRscWorkerMessage({
        type: "RSC_END",
        id,
      });
    });

    passThrough.on("error", (error) => {
      sendRscWorkerMessage({
        type: "ERROR",
        id,
        error: toError(error),
      });
    });
  },
  onServerAction: async (id, args) => {
    try {
      // Parse the server action ID to get the file path and export name
      const [filePath, exportName] = id.split("#");
      if (!filePath || !exportName) {
        throw new Error(
          `Invalid server action ID format: ${id}. Expected format: "path/to/file.ts#exportName"`
        );
      }
      // Convert the server action ID to a file path
      const actionPath = filePath.startsWith(userOptions.moduleBasePath)
        ? filePath.slice(userOptions.moduleBasePath.length)
        : filePath;
      const fullPath = join(userOptions.projectRoot, actionPath);

      // Load the server action module
      const module = await import(fullPath);
      const action = module[exportName];

      if (typeof action !== "function") {
        throw new Error(`Server action not found: ${id}`);
      }

      // Execute the server action
      const result = await action(...args);

      // Send success response using RSC stream
      const stream = ReactDOMServer.renderToPipeableStream(
        {
          type: "server-action-response",
          returnValue: result,
        },
        userOptions.moduleBasePath,
        {
          onError(error: Error) {
            sendRscWorkerMessage({
              type: "ERROR",
              id,
              error: toError(error),
            });
          },
        }
      );

      const passThrough = new PassThrough();
      stream.pipe(passThrough);

      passThrough.on("data", (chunk) => {
        sendRscWorkerMessage({
          type: "RSC_CHUNK",
          id,
          chunk,
        });
      });

      passThrough.on("end", () => {
        sendRscWorkerMessage({
          type: "RSC_END",
          id,
        });
      });

      passThrough.on("error", (error) => {
        sendRscWorkerMessage({
          type: "ERROR",
          id,
          error: toError(error),
        });
      });
    } catch (error: unknown) {
      const errorMessage = toError(error).message;
      // Send error response using RSC stream
      const stream = ReactDOMServer.renderToPipeableStream(
        {
          type: "server-action-response",
          returnValue: { success: false, error: errorMessage },
        },
        userOptions.moduleBasePath,
        {
          onError(error: Error) {
            sendRscWorkerMessage({
              type: "ERROR",
              id,
              error: toError(error),
            });
          },
        }
      );

      const passThrough = new PassThrough();
      stream.pipe(passThrough);

      passThrough.on("data", (chunk) => {
        sendRscWorkerMessage({
          type: "RSC_CHUNK",
          id,
          chunk,
        });
      });

      passThrough.on("end", () => {
        sendRscWorkerMessage({
          type: "RSC_END",
          id,
        });
      });

      passThrough.on("error", (error) => {
        sendRscWorkerMessage({
          type: "ERROR",
          id,
          error: toError(error),
        });
      });
    }
  },
  onShutdown: (id: string) => {
    // Send SHUTDOWN_COMPLETE message to signal that shutdown is complete
    sendRscWorkerMessage({
      type: "SHUTDOWN_COMPLETE",
      id: id,
    });
  },
  onCssFile: (id, code) => {
    if (id) {
      // Add to CSS registry
      addCssFileContent(id, code, userOptions);

      // Send CSS file message
      sendRscWorkerMessage({
        type: "CSS_FILE",
        id,
        content: code,
      });
    }
  },
};
