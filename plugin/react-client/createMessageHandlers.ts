import type { RscWorkerOutputMessage } from "../worker/types.js";
import type { Logger } from "vite";
import type { StreamHandlers } from "../worker/types.js";

type MessageHandlerContext = {
  handlers: StreamHandlers;
  logger: Logger;
};

export function createMessageHandler({
  handlers,
  logger,
}: MessageHandlerContext) {
  return (message: RscWorkerOutputMessage | undefined) => {
    if (!message) {
      logger.warn("[react-client] Received undefined message from worker");
      return;
    }
    switch (message.type) {
      case "RSC_CHUNK":
        handlers.onData(message.chunk);
        break;
      case "RSC_END":
        handlers.onEnd();
        break;
      case "ERROR":
        handlers.onError(message.error, message.errorInfo);
        break;
      case "RSC_METRICS":
        handlers.onMetrics(message.metrics);
        break;
      default:
        logger.warn(`Unknown message type: ${message.type}`);
        break;
    }
  };
}
