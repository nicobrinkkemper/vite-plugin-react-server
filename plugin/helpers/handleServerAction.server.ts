import type { Logger, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logError, toError } from "../error/index.js";
import { PassThrough } from "node:stream";
import type {
  ServerActionRequest,
  ServerActionHandlerOptions,
} from "./handleServerActionHelper.js";
import {
  parseServerActionRequest as parseServerActionRequestHelper,
  resolveServerAction,
  loadServerAction,
  executeServerAction,
  sendServerActionResponse,
  handleServerActionError as handleServerActionErrorHelper,
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
 * Server-side server action handler that uses ssrLoadModule
 */
export async function handleServerAction(
  req: IncomingMessage,
  res: ServerResponse,
  options: ServerActionHandlerOptions
): Promise<void> {
  const { projectRoot, verbose = false, logger, ssrLoadModule } = options;

  try {
    if (verbose) {
      logger?.info("[handleServerAction:server] Processing server action request");
    }

    // Parse the server action request
    const { id, args } = await parseServerActionRequestHelper(
      req,
      verbose,
      logger
    );

    // Resolve the server action
    const { fullPath, exportName } = resolveServerAction(
      id,
      projectRoot,
      verbose,
      logger
    );

    // Load the server action (if ssrLoadModule is provided)
    if (!ssrLoadModule) {
      throw new Error("ssrLoadModule is required for server action execution");
    }

    const action = await loadServerAction(
      fullPath,
      exportName,
      ssrLoadModule,
      verbose,
      logger
    );

    // Execute the server action
    const result = await executeServerAction(
      action,
      args,
      verbose,
      logger
    );

    // Send the response
    sendServerActionResponse(
      res,
      result,
      verbose,
      logger
    );

    if (verbose) {
      logger?.info("[handleServerAction:server] Server action completed successfully");
    }
  } catch (error: unknown) {
    handleServerActionErrorHelper(error, res, logger);
  }
}

/**
 * ViteDevServer-specific wrapper for the server handler
 */
export async function handleServerActionWithViteServer(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
  handlerOptions: {
    verbose?: boolean;
    projectRoot: string;
  }
): Promise<void> {
  return handleServerAction(req, res, {
    projectRoot: handlerOptions.projectRoot,
    verbose: handlerOptions.verbose,
    logger: server.config.customLogger || server.config.logger,
    ssrLoadModule: server.ssrLoadModule,
  });
}
