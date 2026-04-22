import type { Logger, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logError, toError } from "../error/index.js";
import { PassThrough } from "node:stream";
import type {
  ServerActionHandlerOptions,
} from "./handleServerActionHelper.js";
import {
  parseServerActionRequest as parseServerActionRequestHelper,
  createServerActionResponse,
  resolveServerAction,
  loadServerAction,
  executeServerAction,
  sendServerActionResponse,
  handleServerActionError as handleServerActionErrorHelper,
} from "./handleServerActionHelper.js";

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
  // Use server environment runner for proper react-server condition handling
  // This ensures client components are transformed to registerClientReference
  const serverEnv = server.environments['server'];
  let ssrLoadModule: (url: string) => Promise<Record<string, unknown>>;
  
  if (serverEnv && 'runner' in serverEnv && serverEnv.runner) {
    // Vite 6 Environment API: use server environment runner for RSC
    ssrLoadModule = (url: string) => 
      (serverEnv.runner as { import: (url: string) => Promise<Record<string, unknown>> }).import(url);
  } else {
    // Fallback to ssrLoadModule (should not happen in Vite 6+)
    ssrLoadModule = server.ssrLoadModule;
  }
  
  return handleServerAction(req, res, {
    projectRoot: handlerOptions.projectRoot,
    verbose: handlerOptions.verbose,
    logger: server.config.customLogger || server.config.logger,
    ssrLoadModule,
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
