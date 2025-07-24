import type { StreamHandlers } from "../types.js";
import { toError } from "../../error/toError.js";
import { userOptions } from "./userOptions.js";
import { addCssFileContent, addModuleId } from "./state.js";
import { join } from "path";
import { ReactDOMServer } from "../../vendor/vendor.server.js";
import { PassThrough } from "node:stream";
import { sendMessage } from "../sendMessage.js";

// Helper function to serialize errors for worker thread communication
const serializeError = (error: unknown) => {
  const err = toError(error);
  return {
    message: err.message,
    name: err.name,
    stack: err.stack,
  };
};

export const handlers: Required<StreamHandlers> = {
  onError: (id, error, errorInfo) => {
    sendMessage({
      type: "ERROR",
      id: id,
      errorInfo: {
        componentStack:
          typeof errorInfo?.componentStack === "string"
            ? errorInfo.componentStack
            : undefined,
        digest:
          typeof errorInfo?.digest === "string" ? errorInfo.digest : undefined,
      },
      error: serializeError(error),
    });
  },
  onData: (id, data) => {
    sendMessage({
      type: "RSC_CHUNK",
      id: id,
      chunk: data,
    });
  },
  onEnd: (id) => {
    sendMessage({
      type: "RSC_END",
      id: id,
    });
  },
  onMetrics: (id, metrics) => {
    sendMessage({
      type: "RSC_METRICS",
      id: id,
      metrics,
    });
  },
  onHmrAccept: (id, routes) => {
    sendMessage({
      type: "HMR_ACCEPT",
      id: id,
      routes: routes,
    });
  },
  onHmrUpdate: (id, routes) => {
    sendMessage({
      type: "HMR_UPDATE",
      id: id,
      routes: routes,
    });
  },
  onServerModule: (id, url, source) => {
    addModuleId(id, url);
    sendMessage({
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
          sendMessage({
            type: "ERROR",
            id,
            error: serializeError(error),
          });
        },
      }
    );

    const passThrough = new PassThrough();
    stream.pipe(passThrough);

    passThrough.on("data", (chunk) => {
      sendMessage({
        type: "RSC_CHUNK",
        id,
        chunk,
      });
    });

    passThrough.on("end", () => {
      sendMessage({
        type: "RSC_END",
        id,
      });
    });

    passThrough.on("error", (error) => {
      // Only send ERROR message for actual stream errors, not React component errors
      // React component errors are already handled by the onError callback
      sendMessage({
        type: "ERROR",
        id,
        error: serializeError(error),
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
            sendMessage({
              type: "ERROR",
              id,
              error: serializeError(error),
            });
          },
        }
      );

      const passThrough = new PassThrough();
      stream.pipe(passThrough);

      passThrough.on("data", (chunk) => {
        sendMessage({
          type: "RSC_CHUNK",
          id,
          chunk,
        });
      });

      passThrough.on("end", () => {
        sendMessage({
          type: "RSC_END",
          id,
        });
      });

      passThrough.on("error", (error) => {
        sendMessage({
          type: "ERROR",
          id,
          error: serializeError(error),
        });
      });
    } catch (error: unknown) {
      const errorMessage = serializeError(error).message;
      // Send error response using RSC stream
      const stream = ReactDOMServer.renderToPipeableStream(
        {
          type: "server-action-response",
          returnValue: { success: false, error: errorMessage },
        },
        userOptions.moduleBasePath,
        {
          onError(error: Error) {
            sendMessage({
              type: "ERROR",
              id,
              error: serializeError(error),
            });
          },
        }
      );

      const passThrough = new PassThrough();
      stream.pipe(passThrough);

      passThrough.on("data", (chunk) => {
        sendMessage({
          type: "RSC_CHUNK",
          id,
          chunk,
        });
      });

      passThrough.on("end", () => {
        sendMessage({
          type: "RSC_END",
          id,
        });
      });

      passThrough.on("error", (error) => {
        sendMessage({
          type: "ERROR",
          id,
          error: serializeError(error),
        });
      });
    }
  },
  onShutdown: (id: string) => {
    // Send SHUTDOWN_COMPLETE message to signal that shutdown is complete
    sendMessage({
      type: "SHUTDOWN_COMPLETE",
      id: id,
    });
  },
  onCssFile: (id, code) => {
    if (id) {
      // Add to CSS registry
      addCssFileContent(id, code, userOptions);

      // Send CSS file message
      sendMessage({
        type: "CSS_FILE",
        id,
        content: code,
      });
    }
  },
};
