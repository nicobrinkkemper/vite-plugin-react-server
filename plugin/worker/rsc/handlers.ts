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
  // Control messages ride toWorker. A portless call means a render-path
  // message arrived before INIT stored the ports — a protocol violation
  // that used to degrade into silent single-port posts on parentPort;
  // diagnose it loudly instead. (The sendMessage calls below — HMR,
  // shutdown, action responses — are deliberate parentPort traffic, not
  // this fallback.)
  const post = (payload: Parameters<typeof sendMessage>[0]) => {
    if (!toWorker) {
      throw new Error(
        `[rsc-worker] the worker was asked to render before it finished ` +
          `initializing, so it has no channel to send ${String(payload.type)} ` +
          `back on. In normal plugin use this is a bug in ` +
          `vite-plugin-react-server, please report it: ` +
          `https://github.com/nicobrinkkemper/vite-plugin-react-server/issues ` +
          `(when driving the worker directly, INIT must be the first message).`
      );
    }
    toWorker.postMessage(payload);
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
      // Data flows by piping into messagePortWritable; this callback is
      // informational in the two-port protocol. Reaching it portless is the
      // same pre-INIT violation post() diagnoses.
      if (!messagePortWritable) {
        void data;
        throw new Error(
          `[rsc-worker] the worker produced render output for "${id}" before ` +
            `it finished initializing, so it has no channel to send it on. ` +
            `In normal plugin use this is a bug in vite-plugin-react-server, ` +
            `please report it: ` +
            `https://github.com/nicobrinkkemper/vite-plugin-react-server/issues ` +
            `(when driving the worker directly, INIT must be the first message).`
        );
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
    onServerActionResponse: (id, result, error, flight) => {
      sendMessage({
        type: "SERVER_ACTION_RESPONSE",
        id: id,
        // With a flight payload the raw result stays home: it may hold values
        // that cannot survive structured clone (and must not be re-encoded
        // outside the react-server context anyway).
        ...(flight !== undefined ? { flight } : { result }),
        // Only include error if it's truthy - prevents serializeError(undefined)
        ...(error ? { error } : {}),
      });
    },
  };
}
