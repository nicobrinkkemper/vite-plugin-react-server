import type { ServerStreamHandlers } from "../types.js";
import { sendMessage } from "../sendMessage.js";
import { serializeError } from "../../error/serializeError.js";
import { serializeErrorInfo } from "../../error/serializeErrorInfo.js";
import type { RenderMetrics } from "../../types.js";

/**
 * Maps what should happen when a message is received from the worker thread messageHandler
 * It just sends the message to the main thread.
 */
export const handlers: ServerStreamHandlers = {
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
