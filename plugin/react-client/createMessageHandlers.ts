import type { RscWorkerOutputMessage } from "../worker/rsc/types.js";
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
  verbose = false,
}: MessageHandlerContext) {
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
        const error = typeof message.error === 'string' 
          ? { 
              message: message.error,
              reason: message.error,
              stack: undefined,
              name: 'Error'
            }
          : { 
              ...message.error,
              message: message.error?.message || 'Unknown error',
              name: message.error?.name || 'Error',
              stack: message.error?.stack
            };
        handlers.onError(message.id, error, message.errorInfo);
        break;
      }
      case "RSC_CHUNK":
        handlers.onData(message.id, message.chunk);
        break;
      case "RSC_END":
        handlers.onEnd(message.id);
        break;
      case "RSC_METRICS":
        handlers.onMetrics(message.id, message.metrics);
        break;
      case "HMR_ACCEPT":
        handlers.onHmrAccept(message.id, message.routes);
        break;
      case "HMR_UPDATE":
        handlers.onHmrUpdate(message.id, message.routes);
        break;
      case "SERVER_ACTION":
        handlers.onServerAction?.(message.id, message.args);
        break;
      case "SERVER_ACTION_RESPONSE":
        handlers.onServerActionResponse?.(message.id, message.result, message.error);
        break;
      case "SERVER_MODULE":
        handlers.onServerModule?.(message.id, message.url, message.source);
        break;
      case "CSS_FILE":
        handlers.onCssFile?.(message.id, message.content);
        break;
      default:
        logger.warn(`Unknown worker output message type: ${(message as { type: string }).type}`);
    }
  };
}
