import type { ServerStreamHandlers } from "../types.js";
import { sendMessage } from "../sendMessage.js";
import { serializeError } from "../../error/serializeError.js";
import { serializeErrorInfo } from "../../error/serializeErrorInfo.js";
import { MessagePortWritable } from "../../stream/MessagePortWritable.js";
import type { MessagePort } from "node:worker_threads";

/**
 * Creates handlers for two-port communication: fromWorker for streaming data out, toWorker for control messages in
 * Following zero-copy streaming pattern: fromWorker (worker → main), toWorker (main → worker)
 */
export function createHandlers(fromWorker?: MessagePort, toWorker?: MessagePort): ServerStreamHandlers {
  // Create writable stream for fromWorker if available
  const messagePortWritable = fromWorker ? new MessagePortWritable(fromWorker, toWorker) : null;
  // In two-port mode control messages go back through toWorker; otherwise they
  // go through the single-port sendMessage channel.
  const post = (payload: Parameters<typeof sendMessage>[0]) => {
    if (toWorker) {
      toWorker.postMessage(payload);
    } else {
      sendMessage(payload);
    }
  };
  return {
    onRscRender: (id) => {
      post({
        type: "RSC_RENDER_START",
        id: id,
      });
    },
    onError: (id, error, errorInfo) => {
      post({
        type: "ERROR",
        id: id,
        errorInfo: serializeErrorInfo(errorInfo),
        error: serializeError(error),
      });
    },
    onShellError: (id, error) => {
      post({
        type: "SHELL_ERROR",
        id: id,
        error: serializeError(error),
      });
    },
    onData: (id, data) => {
      // In two-port mode, data goes through the writable stream
      // In single-port mode, use the old message approach
      if (messagePortWritable) {
        // Data is handled by piping to messagePortWritable
        // This method is called but the actual data flow is through the stream
      } else {
        sendMessage({
          type: "RSC_CHUNK",
          id: id,
          chunk: data,
        });
      }
    },
    onDataError: (id, error) => {
      // Ordered delivery: rides the same port as data chunks and the null
      // end-signal, so it always precedes onEnd's null at the receiver.
      if (fromWorker) {
        try {
          fromWorker.postMessage({ type: "ERROR", id, error: serializeError(error) });
        } catch {
          // Port may be closed, ignore
        }
      }
    },
    onEnd: (id) => {
      // Mirror HTML worker pattern: send null through fromWorker, then END through toWorker
      if (fromWorker) {
        try {
          fromWorker.postMessage(null);
        } catch (error) {
          // Port may be closed, ignore
        }
      }
      
      post({
        type: "RSC_END",
        id: id,
      });
    },
    onMetrics: (id, metrics) => {
      if (metrics.type === "html" || metrics.type === "worker-startup" || metrics.type === "module-resolution") {
        return;
      }
      post({
        type: "RSC_METRICS",
        id: id,
        metrics: metrics as any,
      });
    },
    // Expose the writable stream for direct piping in two-port mode
    ...(messagePortWritable && { getWritable: () => messagePortWritable }),
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
    onShutdown: (id) => {
      sendMessage({
        type: "HMR_CLEANUP",
        id: id,
      });
    },
    onCssFile: (id, code) => {
      sendMessage({
        type: "CSS_FILE",
        id: id,
        content: code,
      });
    },
    onCleanup: (id) => {
      sendMessage({
        type: "HMR_CLEANUP",
        id: id,
      });
    },
    onShellReady: (id) => {
      sendMessage({
        type: "SHELL_READY",
        id: id,
      });
    },
    onAllReady: (id) => {
      sendMessage({
        type: "RSC_END",
        id: id,
      });
    },
    onServerActionResponse: (id, result, error) => {
      sendMessage({
        type: "SERVER_ACTION_RESPONSE",
        id: id,
        result: result,
        // Only include error if it's truthy - prevents serializeError(undefined)
        ...(error ? { error } : {}),
      });
    },
  };
}

// Default handlers for backward compatibility
export const handlers = createHandlers();