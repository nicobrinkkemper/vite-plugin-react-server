import type { Logger } from "vite";

export interface MessageHandlerContext {
  route: string;
  verbose?: boolean;
  logger: Logger;
  hasError: boolean;
  onEvent?: (event: any) => void;
}

export interface MessageHandlerOptions<T extends { type: string }> {
  context: MessageHandlerContext;
  handlers: {
    [K in T['type']]?: (msg: Extract<T, { type: K }>) => void;
  };
  allowWildcard?: string[]; // Message types that allow "*" id
}

export function createMessageHandler<T extends { type: string; id: string }>(
  options: MessageHandlerOptions<T>
) {
  const { context, handlers, allowWildcard = [] } = options;
  const { route, verbose, logger } = context;

  return (msg: T) => {
    // Early return if no worker (safety check)
    if (!msg) return;

    // Handle LOG_ERROR immediately (always allowed)
    if (msg.type === "LOG_ERROR") {
      logger.error((msg as any).message, { error: (msg as any).error });
      return;
    }

    // Route filtering logic
    const isWildcardAllowed = allowWildcard.includes(msg.type);
    if (msg.id !== route && !(isWildcardAllowed && msg.id === "*")) {
      if (verbose) {
        logger.info(
          `[${route}] Ignoring message for route ${msg.id}: ${msg.type}`
        );
      }
      return;
    }

    if (verbose) {
      logger.info(`[${route}] Message received: ${msg.type}`);
    }

    // Call the appropriate handler
    const handler = handlers[msg.type as keyof typeof handlers];
    if (handler) {
      handler(msg as any);
    }
  };
}