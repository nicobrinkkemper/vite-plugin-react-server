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
import { readServerActionForWorker, createServerActionResponse, setupServerActionHeaders } from "./handleServerActionHelper.js";
import { isNotFound, isRedirect } from "../router/loaderSignals.js";
import {
  OUTCOME,
  OUTCOME_HEADER,
  actionRedirectLocation,
} from "../utils/outcomeHeader.js";

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
 * Write a worker SERVER_ACTION_RESPONSE onto the HTTP response, mapping the
 * terminal outcomes the react-server handler answers directly: a loader
 * signal (redirect()/notFound() thrown by the action, its marker fields
 * rehydrated by toError from the serializeError object that crossed the
 * thread boundary) becomes the 303/404 outcome; any other error becomes the
 * error outcome, whose body is the worker's flight-rendered
 * `{ error: { message } }` envelope — valid flight, never JSON into a flight
 * decoder. Nothing has been flushed yet (headers alone don't send), so
 * status and headers are still assignable here. Shared by both worker
 * delegates so the protocol exists exactly once.
 */
export function writeServerActionOutcome(
  message: {
    error?: string | Record<string, unknown>;
    flight?: string;
    result?: unknown;
  },
  passThrough: PassThrough,
  res: ServerResponse,
  logger?: Logger
): void {
  if (message.error) {
    const err = toError(message.error) as Error & {
      statusCode?: number;
      to?: string;
    };
    if (isRedirect(err)) {
      res.statusCode = 303;
      res.removeHeader("Content-Type");
      res.setHeader("location", actionRedirectLocation(err.to ?? "/"));
      res.setHeader(OUTCOME_HEADER, OUTCOME.redirect);
      return;
    }
    if (isNotFound(err)) {
      res.statusCode = 404;
      res.removeHeader("Content-Type");
      res.setHeader(OUTCOME_HEADER, OUTCOME.notFound);
      return;
    }
    logError(err, logger);
    res.statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
    res.setHeader(OUTCOME_HEADER, OUTCOME.error);
    if (typeof message.flight === "string") {
      passThrough.write(message.flight);
    } else {
      passThrough.write(`0:${JSON.stringify({ error: err.message })}\n`);
    }
    return;
  }
  if (typeof message.flight === "string") {
    passThrough.write(message.flight);
    return;
  }
  passThrough.write(`0:${JSON.stringify(message.result)}\n`);
}

/**
 * `handleServerAction` means ONE thing across the package: the sealed HTTP
 * handler that EXECUTES actions, which only exists under the react-server
 * condition (execution needs the react-server React build). This is the
 * default-condition binding of the name: it throws with setup guidance
 * instead of silently resolving to different behavior with a different
 * signature.
 */
export async function handleServerAction(): Promise<never> {
  throw new Error(
    "handleServerAction executes server actions and requires the react-server " +
      "condition — run the process that imports it with --conditions " +
      "react-server (or route action requests to the process that has it). " +
      "From a non-react-server process, forward the request to your RSC " +
      "worker with delegateServerActionToWorker instead."
  );
}

/**
 * Forward a server-action request to a react-server worker thread and stream
 * its RSC response back. Non-react-server counterpart to the sealed
 * `handleServerAction`: this process cannot execute actions itself (wrong
 * React condition), so it delegates to the worker that can.
 */
export async function delegateServerActionToWorker(
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
    // Read the request into worker-message parts: text and multipart bodies
    // stay RAW for the worker's transport decodeReply (multipart as bytes —
    // FormData cannot cross the thread boundary); the legacy JSON envelope
    // stays pre-decoded args.
    const parts = await readServerActionForWorker(req);

    // Set up response headers
    setupServerActionHeaders(res);

    // Send server action request to worker
    options.worker.postMessage({
      type: "SERVER_ACTION",
      ...parts,
    } satisfies RscWorkerInputMessage);

    // Handle worker messages
    messageHandler = (message: any) => {
      if (message.type === "RSC_CHUNK") {
        passThrough.write(message.chunk);
      } else if (message.type === "RSC_END") {
        if (messageHandler) {
          cleanupServerAction(passThrough, options.worker!, messageHandler, res);
        }
      } else if (message.type === "SERVER_ACTION_RESPONSE") {
        writeServerActionOutcome(message, passThrough, res, options.logger);
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
  return delegateServerActionToWorker(req, res, {
    projectRoot: handlerOptions.projectRoot,
    verbose: handlerOptions.verbose,
    logger: server.config.customLogger || server.config.logger,
    worker: handlerOptions.worker,
  });
}

// Re-export helper functions for the entry point
export { 
  parseServerActionRequest,
  parseServerActionRequestBody,
  createServerActionResponse, 
  setupServerActionHeaders 
} from "./handleServerActionHelper.js"; 
export type { ServerActionRequest, ServerActionHandlerOptions } from "./handleServerActionHelper.js";
