import type { RscWorkerOutputMessage } from "../worker/rsc/types.js";
import type { CreateMessageHandlerFn } from "./types.js";


export const createMessageHandler: CreateMessageHandlerFn = function _createMessageHandler({
  handlers,
  logger,
  verbose = false,
}) {
  return (message: RscWorkerOutputMessage | undefined) => {
    if (!message) {
      logger.warn("Received undefined message");
      return;
    }
    switch (message.type) {
      case "READY":
        if(verbose) logger.info("[react-client] Worker is ready");
        break;
      case "ERROR": {
        handlers.onError(message.id, message.error);
        break;
      }
      case "SHELL_ERROR": {
        handlers.onShellError(message.id, message.error);
        break;
      }
      case "RSC_CHUNK":
        handlers.onData(message.id, message.chunk);
        break;
      case "RSC_END":
        handlers.onEnd(message.id);
        break;
      case "RSC_METRICS":
        handlers.onMetrics(message.id, message.metrics as any);
        break;
      case "HMR_ACCEPT":
        handlers.onHmrAccept(message.id, message.routes);
        break;
      case "HMR_UPDATE":
        handlers.onHmrUpdate(message.id, message.routes);
        break;
      case "CSS_FILE":
        handlers.onCssFile?.(message.id, message.content);
        break;
      default:
        logger.warn(`Unknown worker output message type: ${(message as { type: string }).type}`);
    }
  };
}
