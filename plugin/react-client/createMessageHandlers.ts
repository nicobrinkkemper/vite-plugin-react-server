import type { RscWorkerOutputMessage } from "../worker/types.js";
import type { Logger } from "vite";
import type { StreamHandlers } from "../worker/types.js";

type MessageHandlerContext = {
  handlers: StreamHandlers;
  logger: Logger;
  verbose?: boolean;
};

export function createMessageHandler({
  handlers,
  logger,
  verbose = false
}: MessageHandlerContext) {
  return (message: RscWorkerOutputMessage | undefined) => {
    if (!message) {
      logger.warn("[react-client] Received undefined message from worker");
      return;
    }
    if(verbose) logger.info('new message '+message.type)
    switch (message.type) {
      case "READY":
        if(verbose) logger.info("[react-client] Worker is ready");
        break;
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
      case "HMR_ACCEPT":
        handlers.onHmrAccept(message.routes ?? []);
        break;
      case "HMR_UPDATE":
        handlers.onHmrUpdate(message.routes ?? []);
        break;
      default:
        logger.warn(`Unknown worker output message type: ${message.type}`);
        break;
    }
  };
}
