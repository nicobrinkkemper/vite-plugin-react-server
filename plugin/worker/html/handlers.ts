import type { ClientStreamHandlers } from "../types.js";
import { sendMessage } from "../sendMessage.js";
import { serializeError } from "../../error/serializeError.js";
import { serializeErrorInfo } from "../../error/serializeErrorInfo.js";

/**
 * Maps what should happen when a message is received from the worker thread messageHandler
 * It just sends the message to the main thread.
 */
export const handlers: ClientStreamHandlers = {
  onHtmlRender: (id) => {
    sendMessage({
      type: "HTML_RENDER_START",
      id: id,
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
      type: "HTML_CHUNK",
      id: id,
      chunk: data,
    });
  },
  onEnd: (id) => {
    sendMessage({
      type: "HTML_COMPLETE",
      id: id,
      success: true,
    });
  },
  onMetrics: (id, metrics) => {
    sendMessage({
      type: "HTML_METRICS",
      id: id,
      metrics: metrics,
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
  onCleanup: (id) => {
    sendMessage({
      type: "CLEANUP_COMPLETE",
      id: id,
    });
  },
};
