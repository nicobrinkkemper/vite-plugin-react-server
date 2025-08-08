import type { Logger } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Worker } from "node:worker_threads";
import type { RscWorkerInputMessage } from "../worker/rsc/types.js";
import type { MessageHandler } from "../types.js";
import { cleanupServerAction } from "../dev-server/cleanupServerAction.client.js";
import { logError, toError } from "../error/index.js";
import { PassThrough } from "node:stream";
import type {
  ServerActionRequest,
  ServerActionHandlerOptions,
} from "./handleServerActionHelper.js";

export type ServerActionResponse = {
  type: "server-action-response";
  returnValue: unknown;
};

/**
 * Parses a server action request from the request body.
 * Supports two formats:
 * 1. Direct args array: [arg1, arg2, ...]
 * 2. Object with id and args: { id: string, args: unknown[] }
 */
export function parseServerActionRequest(body: string, url?: string): ServerActionRequest {
  const parsed = JSON.parse(body);
  
  if (Array.isArray(parsed)) {
    // Format 1: Direct args array
    return {
      args: parsed,
      id: url?.split("?")[0] ?? "",
    };
  } else if (parsed && typeof parsed === "object" && "id" in parsed) {
    // Format 2: Object with id and args
    return {
      id: parsed.id,
      args: parsed.args ?? [],
    };
  }
  
  throw new Error("Invalid server action request format");
}

/**
 * Creates a server action response with the given result or error.
 */
export function createServerActionResponse(result?: unknown, error?: string): ServerActionResponse {
  return {
    type: "server-action-response",
    returnValue: error 
      ? { success: false, error }
      : result
  };
}

/**
 * Sets up common response headers for server actions.
 */
export function setupServerActionHeaders(res: ServerResponse) {
  res.setHeader("Content-Type", "text/x-component; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Connection", "keep-alive");
}

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
    const { id, args } = parseServerActionRequest(body, req.url);

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