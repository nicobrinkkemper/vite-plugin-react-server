import type { Logger } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Worker } from "node:worker_threads";
import type { RscWorkerInputMessage } from "../worker/rsc/types.js";
import type { MessageHandler } from "../types.js";
import { cleanupServerAction } from "../dev-server/cleanupServerAction.client.js";
import { logError, toError } from "../error/index.js";
import { PassThrough } from "node:stream";
import type {
  ServerActionHandlerOptions,
} from "./handleServerActionHelper.js";
import { parseServerActionRequestBody, createServerActionResponse, setupServerActionHeaders } from "./handleServerActionHelper.js";

// Use shared helper instead of duplicating logic

// Use shared helper instead of duplicating logic

/**
 * Creates a pass-through stream for server action responses.
 */
export function createServerActionStream(res: ServerResponse): PassThrough {
  const passThrough = new PassThrough();
  passThrough.pipe(res, { end: true });
  passThrough.on('end', () => {
    res.end();
  });
  return passThrough;
}

/**
 * Handles errors in server action processing.
 */
export function handleServerActionError(error: unknown, res: ServerResponse, logger?: Logger) {
  const err = toError(error);
  logError(err, logger);
  res.statusCode = 500;
  res.end(JSON.stringify(createServerActionResponse(undefined, err.message)));
}

/**
 * Client-side server action handler that delegates to worker
 */
export async function handleServerAction(
  req: IncomingMessage,
  res: ServerResponse,
  options: ServerActionHandlerOptions & { worker?: Worker }
): Promise<void> {
  if (!options.worker) {
    throw new Error("Worker is required for client-side server actions");
  }

  let messageHandler: MessageHandler<any> | null = null;
  const passThrough = createServerActionStream(res);

  try {
    // Read request body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();

    // Parse the server action request
    const { id, args } = parseServerActionRequestBody(body, req.url);

    // Set up response headers
    setupServerActionHeaders(res);

    // Send server action request to worker
    options.worker.postMessage({
      type: "SERVER_ACTION",
      id,
      args,
    } satisfies RscWorkerInputMessage);

    // Handle worker messages
    messageHandler = (message: any) => {
      if (message.type === "RSC_CHUNK") {
        passThrough.write(message.chunk);
      } else if (message.type === "RSC_END") {
        if (messageHandler) {
          cleanupServerAction(passThrough, options.worker!, messageHandler, res);
        }
      } else if (message.type === "ERROR") {
        if (messageHandler) {
          cleanupServerAction(
            passThrough,
            options.worker!,
            messageHandler,
            res,
            message.error,
            options.logger
          );
        }
      }
    };

    options.worker.on("message", messageHandler);

    // Handle errors
    passThrough.on("error", (error: unknown) => {
      if (messageHandler) {
        cleanupServerAction(
          passThrough,
          options.worker!,
          messageHandler,
          res,
          error,
          options.logger
        );
      }
    });
  } catch (error) {
    handleServerActionError(error, res, options.logger);
  }
}

/**
 * Client-side ViteDevServer-specific handler that delegates to worker
 */
export async function handleServerActionWithViteServer(
  req: IncomingMessage,
  res: ServerResponse,
  server: any,
  handlerOptions: {
    verbose?: boolean;
    projectRoot: string;
    worker?: Worker;
  }
): Promise<void> {
  return handleServerAction(req, res, {
    projectRoot: handlerOptions.projectRoot,
    verbose: handlerOptions.verbose,
    logger: server.config.customLogger || server.config.logger,
    worker: handlerOptions.worker,
  });
} 