import type { ServerStreamHandlers } from "../types.js";
import { sendMessage } from "../sendMessage.js";
import { serializeError } from "../../error/serializeError.js";
import { serializeErrorInfo } from "../../error/serializeErrorInfo.js";
import type { RenderMetrics } from "../../types.js";
import type { MessagePort } from "node:worker_threads";

/**
 * Creates handlers that can work with either parentPort (single-port) or dataPort/controlPort (two-port)
 */
export function createHandlers(dataPort?: MessagePort, controlPort?: MessagePort): ServerStreamHandlers {
  // If we have both ports, use two-port communication
  if (dataPort && controlPort) {
    return {
      onRscRender: (id) => {
        controlPort.postMessage({
          type: "RSC_RENDER_START",
          id: id
        });
      },
      onError: (id, error, errorInfo) => {
        controlPort.postMessage({
          type: "ERROR",
          id: id,
          errorInfo: serializeErrorInfo(errorInfo),
          error: serializeError(error),
        });
      },
      onShellError: (id, error) => {
        controlPort.postMessage({
          type: "SHELL_ERROR",
          id: id,
          error: serializeError(error),
        });
      },
              onData: (_id, data) => {
          // Send RSC data via dataPort (raw data, no type wrapper)
          dataPort.postMessage(data);
        },
              onEnd: (id) => {
          dataPort.postMessage(null); // Signal end of data stream
          controlPort.postMessage({
            type: "RSC_END",
            id: id,
          });
        },
      onMetrics: (id, metrics) => {
        if(metrics.type === "html") {
          return;
        }
        controlPort.postMessage({
          type: "RSC_METRICS",
          id: id,
          metrics: metrics as RenderMetrics & { type: "rsc-full" | "rsc-headless" },
        });
      },
      onHmrAccept: (id, routes) => {
        controlPort.postMessage({
          type: "HMR_ACCEPT",
          id: id,
          routes: routes,
        });
      },
      onHmrUpdate: (id, routes) => {
        controlPort.postMessage({
          type: "HMR_UPDATE",
          id: id,
          routes: routes,
        });
      },
      onServerModule: (id, url, source) => {
        controlPort.postMessage({
          type: "SERVER_MODULE",
          id,
          url,
          source,
        });
      },
      onServerActionResponse: (id, result) => {
        controlPort.postMessage({
          type: "SERVER_ACTION_RESPONSE",
          id,
          result,
        });
      },
      onServerAction: (id, args) => {
        controlPort.postMessage({
          type: "SERVER_ACTION",
          id,
          args,
        });
      },
      onShutdown: (id: string) => {
        controlPort.postMessage({
          type: "SHUTDOWN_COMPLETE",
          id: id,
        });
      },
      onCssFile: (id, code) => {
        controlPort.postMessage({
          type: "CSS_FILE",
          id,
          content: code,
        });
      },
              onCleanup: (_id) => {
          // Cleanup - close both ports
          dataPort.close();
          controlPort.close();
        },
    };
  }

  // Otherwise, use single-port communication via parentPort
  return {
  onRscRender: (id) => {
    sendMessage({
      type: "RSC_RENDER_START",
      id: id
    });
  },
  onError: (id, error, errorInfo) => {
    sendMessage({
      type: "ERROR",
      id: id,
      errorInfo: serializeErrorInfo(errorInfo),
      error: serializeError(error),
    });
  },
  onShellError: (id, error) => {
    sendMessage({
      type: "SHELL_ERROR",
      id: id,
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
    if(metrics.type === "html") {
      return;
    }
    sendMessage({
      type: "RSC_METRICS",
      id: id,
      metrics: metrics as RenderMetrics & { type: "rsc-full" | "rsc-headless" },
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
    // these don't need to be forwarded to the main thread,
    // but we comunicate the work done should anyone need it
    sendMessage({
      type: "SERVER_MODULE",
      id,
      url,
      source,
    });
  },
  onServerActionResponse: (id, result) => {
    sendMessage({
      type: "SERVER_ACTION_RESPONSE",
      id,
      result,
    });
  },
  onServerAction: (id, args) => {
    sendMessage({
      type: "SERVER_ACTION",
      id,
      args,
    });
  },
  onShutdown: (id: string) => {
    sendMessage({
      type: "SHUTDOWN_COMPLETE",
      id: id,
    });
  },
  onCssFile: (id, code) => {
    sendMessage({
      type: "CSS_FILE",
      id,
      content: code,
    });
  },
  };
}

// Default handlers for backward compatibility
export const handlers = createHandlers();
