import { logError, toError } from "../error/index.js";
import { join } from "node:path";
import { isPathWithin } from "./isPathWithin.js";
import type { Logger } from "vite";
import type { ServerResponse } from "node:http";
import type { IncomingMessage } from "node:http";

export type ServerActionHandlerOptions = {
  projectRoot: string;
  verbose?: boolean;
  logger?: Logger;
  ssrLoadModule?: (path: string) => Promise<any>;
  /**
   * Vite's emitted server manifest. Optional: in production the handler auto-loads
   * it from `<serverRoot>/.vite/manifest.json`, so you normally do not pass this.
   * Provide it only to override (e.g. a manifest you already hold in memory).
   * When a manifest is available, actions resolve through a SEALED gate — an
   * allowlist that rejects any id the build did not emit.
   */
  serverManifest?: Record<string, { file: string; src?: string } | undefined>;
  /**
   * Absolute path to the built server dir (where manifest `entry.file` and
   * `.vite/manifest.json` live). Defaults to `<projectRoot>/dist/server`. When the
   * manifest is found there (or passed via `serverManifest`), the sealed gate is
   * used automatically — no need to load or pass the manifest yourself.
   */
  serverRoot?: string;
  /** URL base the client prefixes onto reference ids (default `/`). */
  base?: string;
  /**
   * Force the open dev resolver and skip manifest auto-loading. Set internally by
   * the Vite dev wrapper (dev serves live source, so a built manifest would be
   * stale). Consumers should not set this in production.
   */
  devOpen?: boolean;
  /**
   * Opt-in CSRF guard. When set, a request whose `Origin` header is present and
   * not in this allowlist is rejected with 403 before the action runs. A missing
   * `Origin` is allowed: a page cannot suppress it on a cross-origin browser POST,
   * so its absence means same-origin or a non-browser client (not a CSRF vector).
   * List your own origins, e.g. `["https://app.example.com"]`. Off by default to
   * avoid breaking existing deploys; the endpoint is otherwise the host's to guard.
   */
  allowedOrigins?: string[];
  /**
   * Opt-in cap on the server-action request body, in bytes. When set, a body that
   * exceeds it is rejected with 413 instead of being buffered into memory. Off by
   * default (no limit). Recommended for any internet-facing deploy.
   */
  maxBodyBytes?: number;
};

export type ServerActionRequest = {
  id: string;
  args: unknown[];
};

/**
 * Parses a server action request from the request body.
 * Supports two formats:
 * 1. Direct args array: [arg1, arg2, ...]
 * 2. Object with id and args: { id: string, args: unknown[] }
 */
export function parseServerActionRequestBody(body: string, url?: string): ServerActionRequest {
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

export type ServerActionResponse = {
  type: "server-action-response";
  returnValue: unknown;
};

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
 * Parses a server action request from the request body and URL
 */
export async function parseServerActionRequest(
  req: IncomingMessage,
  verbose = false,
  logger?: Logger,
  maxBodyBytes?: number
): Promise<ServerActionRequest> {
  // Get action ID from x-rsc-action header (preferred) or URL
  let id = (req.headers["x-rsc-action"] as string) ?? req.url?.split("?")[0] ?? "";
  
  if (verbose) {
    logger?.info(`[handleServerActionHelper] Parsing request at ${req.url}`);
    logger?.info(`[handleServerActionHelper] Action ID from header: ${req.headers["x-rsc-action"]}`);
  }

  // Parse the request body
  let args: unknown[];
  try {
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      received += chunk.length;
      if (maxBodyBytes !== undefined && received > maxBodyBytes) {
        // Reject oversized bodies before buffering them all into memory. Tagged
        // with a statusCode so the handler answers 413, not a generic 500.
        const err = new Error(
          `Server action request body exceeds maxBodyBytes (${maxBodyBytes})`
        ) as Error & { statusCode?: number };
        err.statusCode = 413;
        throw err;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString();
    
    if (verbose) {
      logger?.info(`[handleServerActionHelper] Request body length: ${body.length}`);
    }

    // Try to parse as JSON first (for backwards compatibility)
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) {
        // Format 1: Direct args array
        args = parsed;
        if (verbose) {
          logger?.info(`[handleServerActionHelper] Parsed args as array`);
        }
      } else if (parsed && typeof parsed === "object" && "id" in parsed) {
        // Format 2: Object with id and args (legacy format)
        id = parsed.id;
        args = parsed.args ?? [];
      } else {
        throw new Error("Invalid server action request format");
      }
    } catch {
      // Not JSON - assume it's React's encoded format
      // For now, pass the raw body to the worker which can decode it
      // using decodeReply from react-server-dom-esm/server
      if (verbose) {
        logger?.info(`[handleServerActionHelper] Body is not JSON, passing raw body`);
      }
      args = [body]; // Pass raw body as first arg, worker will decode
    }
  } catch (error: unknown) {
    // Preserve a tagged status (e.g. 413 from the size cap) rather than masking it
    // as a generic parse failure.
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    throw new Error(`Failed to parse server action request`, {
      cause: error,
    });
  }

  if (!id) {
    throw new Error("Server action ID is required");
  }

  if (verbose) {
    logger?.info(
      `[handleServerActionHelper] Server action request for ${id} with args: ${JSON.stringify(args)}`
    );
  }

  return { id, args };
}

/**
 * CSRF / cross-origin guard shared by the Node and Web entry points. When
 * `allowedOrigins` is set, a request whose `Origin` is present and not in the
 * allowlist is rejected (throws a 403-tagged error). A missing `Origin` is
 * allowed: a browser cannot suppress it on a cross-origin POST, so its absence
 * means same-origin or a non-browser client (not a CSRF vector).
 */
export function assertOriginAllowed(
  origin: string | null | undefined,
  allowedOrigins?: string[]
): void {
  if (!allowedOrigins || allowedOrigins.length === 0) return;
  if (origin && !allowedOrigins.includes(origin)) {
    const err = new Error("Origin not allowed") as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Web-standard counterpart to {@link parseServerActionRequest}: extract
 * `{ id, args }` from a Fetch `Request`. Same id resolution (the `x-rsc-action`
 * header, else the URL path) and body formats (a JSON args array, a `{id,args}`
 * object, or a raw React-encoded body), and the same `maxBodyBytes` cap —
 * rejected with a 413-tagged error before the whole body is buffered.
 */
export async function parseServerActionWebRequest(
  request: Request,
  verbose = false,
  logger?: Logger,
  maxBodyBytes?: number
): Promise<ServerActionRequest> {
  let id =
    request.headers.get("x-rsc-action") ??
    new URL(request.url).pathname ??
    "";

  let body = "";
  if (request.body) {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (maxBodyBytes !== undefined && received > maxBodyBytes) {
        await reader.cancel();
        const err = new Error(
          `Server action request body exceeds maxBodyBytes (${maxBodyBytes})`
        ) as Error & { statusCode?: number };
        err.statusCode = 413;
        throw err;
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } else {
    body = await request.text();
  }

  let args: unknown[];
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      args = parsed;
    } else if (parsed && typeof parsed === "object" && "id" in parsed) {
      id = (parsed as { id: string }).id;
      args = (parsed as { args?: unknown[] }).args ?? [];
    } else {
      throw new Error("Invalid server action request format");
    }
  } catch {
    // Not JSON — React's encoded format; pass the raw body for downstream decode.
    args = [body];
  }

  if (!id) {
    throw new Error("Server action ID is required");
  }
  if (verbose) {
    logger?.info(`[handleServerActionHelper] Web server action request for ${id}`);
  }
  return { id, args };
}

/**
 * Resolves a server action ID to file path and export name
 */
export function resolveServerAction(
  id: string,
  projectRoot: string,
  verbose = false,
  logger?: Logger
): { filePath: string; exportName: string; fullPath: string } {
  // Parse the server action ID to get the file path and export name
  const [filePath, exportName] = id.split("#");
  if (!filePath || !exportName) {
    throw new Error(
      `Invalid server action ID format: ${id}. Expected format: "path/to/file.ts#exportName"`
    );
  }

  // Convert the server action ID to a file path
  const actionPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  const fullPath = join(projectRoot, actionPath);

  // Containment guard: the id is client-supplied, and `join` collapses `../`, so
  // a crafted id could otherwise resolve outside the project root and be imported
  // and invoked. Reject anything that escapes projectRoot. (This is defense in
  // depth; resolving against the build's server manifest is the stronger gate —
  // see docs/server-actions.md and bead i0j.)
  if (!isPathWithin(projectRoot, fullPath)) {
    throw new Error(
      `Server action id resolves outside the project root: ${id}`
    );
  }

  if (verbose) {
    logger?.info(
      `[handleServerActionHelper] Resolved file path: id=${id}, actionPath=${actionPath}, projectRoot=${projectRoot}, filePath=${fullPath}, exportName=${exportName}`
    );
  }

  return { filePath: actionPath, exportName, fullPath };
}

/**
 * Loads and validates a server action from a module
 */
export async function loadServerAction(
  fullPath: string,
  exportName: string,
  ssrLoadModule: (path: string) => Promise<any>,
  verbose = false,
  logger?: Logger
): Promise<Function> {
  if (verbose) {
    logger?.info(`[handleServerActionHelper] Loading module: ${fullPath}`);
  }
  
  const module = await ssrLoadModule(fullPath);
  
  if (verbose) {
    logger?.info(
      `[handleServerActionHelper] Looking for action: ${exportName} in module with exports: ${Object.keys(module).join(", ")}`
    );
  }
  
  const action = module[exportName];

  if (typeof action !== "function") {
    if (verbose) {
      logger?.info(
        `[handleServerActionHelper] Export ${exportName} is not a function: ${typeof action}`
      );
    }
    throw new Error(
      `Server action ${exportName} is not a function. Found: ${typeof action}`
    );
  }

  return action;
}

/**
 * Executes a server action with the given arguments
 */
export async function executeServerAction(
  action: Function,
  args: unknown[],
  verbose = false,
  logger?: Logger
): Promise<unknown> {
  if (verbose) {
    logger?.info(`[handleServerActionHelper] Executing action with args: ${JSON.stringify(args)}`);
  }

  const result = await action(...args);
  
  if (verbose) {
    logger?.info(`[handleServerActionHelper] Action executed successfully: ${JSON.stringify(result)}`);
  }

  return result;
}

/**
 * Sends a server action response
 */
export function sendServerActionResponse(
  res: ServerResponse,
  result: unknown,
  verbose = false,
  logger?: Logger
): void {
  if (verbose) {
    logger?.info(`[handleServerActionHelper] Sending response: ${JSON.stringify(result)}`);
  }

  // Send in RSC wire format for createFromFetch compatibility
  res.setHeader("Content-Type", "text/x-component");
  res.end(`0:${JSON.stringify(result)}\n`);
}

/**
 * Handles server action errors
 */
export function handleServerActionError(
  error: unknown,
  res: ServerResponse,
  logger?: Logger
): void {
  const err = toError(error) as Error & { statusCode?: number };
  logError(err, logger);

  // Honor a tagged status (403 origin, 413 oversized) else 500.
  res.statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
  res.setHeader("Content-Type", "application/json");
  // Never ship err.stack to the client — it exposes absolute paths and internal
  // module ids. The full error (with stack) is written to the server log above.
  res.end(JSON.stringify({
    success: false,
    error: err.message,
  }));
} 