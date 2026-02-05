import type { Logger } from "vite";
import type {
  RscRenderMessage,
  RscWorkerOutputMessage,
  StreamHandlers,
} from "../worker/types.js";
import type { Worker as NodeWorker } from "node:worker_threads";
import { logError } from "../error/toError.js";
import { createPluginLogger } from "../helpers/logger.js";

const WORKER_STARTUP_TIMEOUT_MS = 5000;

/**
 * Sends an RSC_RENDER message to the worker and returns a ReadableStream
 * of RSC chunks. Uses a single persistent message handler instead of
 * re-registering per chunk.
 */
export function handleWorkerRscStream({
  worker,
  message,
  logger,
  handlers,
  verbose = false,
}: {
  worker: NodeWorker;
  message: Omit<RscRenderMessage, "type" | "id"> &
    Partial<Pick<RscRenderMessage, "id">>;
  logger: Logger;
  handlers: Pick<StreamHandlers, "onMetrics" | "onHmrAccept" | "onHmrUpdate">;
  verbose?: boolean | import("../helpers/logger.js").LogLevel;
}): ReadableStream<Uint8Array> {
  const log = createPluginLogger(verbose, logger);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let startupTimeout: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        worker.removeListener("message", onMessage);
        if (startupTimeout) {
          clearTimeout(startupTimeout);
          startupTimeout = null;
        }
      };

      const onMessage = (msg: RscWorkerOutputMessage | undefined) => {
        if (!msg) return;

        switch (msg.type) {
          case "RSC_CHUNK": {
            // Clear startup timeout on first data
            if (startupTimeout) {
              clearTimeout(startupTimeout);
              startupTimeout = null;
            }
            // Worker thread structured clone may deliver Buffer as a plain
            // object — ensure we always enqueue a proper Uint8Array/Buffer.
            const raw = msg.chunk as any;
            const chunk = Buffer.isBuffer(raw)
              ? raw
              : raw instanceof Uint8Array
                ? raw
                : Buffer.from(raw);
            controller.enqueue(chunk);
            break;
          }

          case "RSC_END":
            cleanup();
            controller.close();
            break;

          case "ERROR":
            logError(msg.error, logger);
            if (msg.errorInfo) {
              logError(msg.errorInfo.componentStack, logger);
            }
            break;

          case "RSC_METRICS":
            handlers.onMetrics(msg.id, msg.metrics);
            break;

          case "HMR_ACCEPT":
            handlers.onHmrAccept(msg.id, msg.routes);
            break;

          case "HMR_UPDATE":
            handlers.onHmrUpdate(msg.id, msg.routes);
            break;

          case "CSS_FILE":
          case "SERVER_MODULE":
          case "READY":
          case "SHUTDOWN_COMPLETE":
            break;

          default:
            log.debug(
              `[react-client] Unknown worker message type: ${(msg as { type: string }).type}`
            );
        }
      };

      // Single persistent listener
      worker.on("message", onMessage);

      // Timeout only for initial response
      startupTimeout = setTimeout(() => {
        cleanup();
        controller.error(new Error("Worker RSC render timeout"));
        worker.terminate();
      }, WORKER_STARTUP_TIMEOUT_MS);

      // Kick off the render
      worker.postMessage({
        ...message,
        type: "RSC_RENDER",
        id: message.id ?? message.route,
      });
    },
  });
}
