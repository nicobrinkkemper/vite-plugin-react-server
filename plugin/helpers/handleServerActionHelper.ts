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
  /**
   * Resolve a client-supplied action id to its function, bypassing the built-in
   * disk-backed sealed gate. The single-isolate edge bake passes a gate whose
   * modules are baked into the edge bundle, so the action runs in a process with
   * no `react-server` condition (the bake holds the server React). Still a sealed
   * allowlist — an unregistered id rejects. When set, the sealed path uses this
   * and never reads `<serverRoot>/.vite/manifest.json`.
   */
  resolveServerReference?: (id: string) => Promise<unknown>;
  /**
   * The deploy's flight flavor, used to pick the built-in codec (decodeReply
   * arity and response renderer) when the handler runs under the react-server
   * condition. Defaults to `"esm"`, matching the plugin option.
   */
  transport?: "esm" | "webpack";
  /** The esm transport's hosted-module prefix (plugin `moduleBasePath`). */
  moduleBasePath?: string;
  /** The client-facing module base (plugin `moduleBaseURL`), webpack dev map. */
  moduleBaseURL?: string;
  /**
   * The flight codec to decode request arguments and render responses with.
   * Defaults per environment: under the react-server condition the built-in
   * transport pair is loaded lazily; the baked edge handler passes its own;
   * without either, text bodies fall back to the legacy JSON reading and
   * responses to the legacy JSON row (multipart fails loud).
   */
  flightCodec?: ServerActionFlightCodec;
};

/**
 * The action request body as received, BEFORE flight decoding. The browser's
 * `encodeReply(args)` produces either text or multipart `FormData` — both must
 * reach the transport's `decodeReply` intact. The `args` kind is the legacy
 * curl-style JSON envelope (`{ id, args }`), already decoded by definition.
 */
export type ServerActionBody =
  | { kind: "form-data"; formData: FormData }
  | { kind: "text"; text: string }
  | { kind: "args"; args: unknown[] };

export type ServerActionRequest = {
  id: string;
  body: ServerActionBody;
};

/**
 * The transport-aware seam the handlers decode and respond through. The
 * built-in default (react-server processes) comes from
 * `stream/flightRenderer.server.js`; the single-isolate edge bake passes its
 * own baked pair; a custom host may pass anything honoring the contract.
 * `renderResponse` returns either a Node pipeable (`{ pipe }`) or a Web
 * `ReadableStream` — each handler adapts to its envelope.
 */
export type ServerActionFlightCodec = {
  decodeReply: (body: string | FormData) => Promise<unknown[]>;
  renderResponse: (payload: {
    returnValue: unknown;
  }) => { pipe: (destination: unknown) => unknown } | ReadableStream;
};

/** Reconstruct a multipart body as FormData via the standard parser. */
export async function formDataFromBytes(
  bytes: Uint8Array,
  contentType: string
): Promise<FormData> {
  return await new Response(bytes as BodyInit, {
    headers: { "content-type": contentType },
  }).formData();
}

/**
 * Classify a buffered text body. The `{ id, args }` JSON envelope is the one
 * legacy shape kept as pre-decoded args (it is not something `encodeReply`
 * ever emits, so the special case cannot shadow a real flight reply).
 * Everything else — including a bare JSON array, which IS what `encodeReply`
 * emits for simple arguments — stays text for `decodeReply`, which yields the
 * same values for plain JSON and the correct ones for typed rows.
 */
export function classifyTextBody(text: string): {
  body: ServerActionBody;
  legacyId?: string;
} {
  try {
    const parsed = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "id" in parsed
    ) {
      return {
        body: { kind: "args", args: (parsed as { args?: unknown[] }).args ?? [] },
        legacyId: (parsed as { id: string }).id,
      };
    }
  } catch {
    // Not JSON at all — flight reply text, or garbage decodeReply will reject.
  }
  return { body: { kind: "text", text } };
}

/**
 * Legacy string parser kept for the worker-delegate call sites. Returns the
 * new body model; the `{ id, args }` envelope overrides the URL-derived id.
 */
export function parseServerActionRequestBody(
  body: string,
  url?: string
): ServerActionRequest {
  const { body: classified, legacyId } = classifyTextBody(body);
  return {
    id: legacyId ?? url?.split("?")[0] ?? "",
    body: classified,
  };
}

/**
 * Read a Node action request into the fields a SERVER_ACTION worker message
 * carries. FormData cannot cross the thread boundary, so multipart travels as
 * raw bytes + content type and the worker reconstructs it; text travels
 * verbatim for the worker's `decodeReply`; the legacy `{ id, args }` envelope
 * stays pre-decoded args.
 */
export async function readServerActionForWorker(
  req: IncomingMessage
): Promise<{
  id: string;
  args?: unknown[];
  body?: string | Uint8Array;
  contentType?: string;
}> {
  const headerActionId = req.headers["x-rsc-action"] as string | undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const contentType = (req.headers["content-type"] as string | undefined) ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    return {
      id: headerActionId ?? req.url?.split("?")[0] ?? "",
      body: new Uint8Array(raw),
      contentType,
    };
  }
  const text = raw.toString();
  const { body, legacyId } = classifyTextBody(text);
  const id = headerActionId ?? legacyId ?? req.url?.split("?")[0] ?? "";
  if (body.kind === "args") return { id, args: body.args };
  return { id, body: text };
}

/**
 * Decode a parsed body to the action's argument list. With a codec, text and
 * multipart both go through the transport's `decodeReply` — the complete
 * flight reply protocol, File uploads included. Without one (a process that
 * cannot hold the react-server transport), the legacy JSON reading of text
 * bodies is preserved, and multipart fails LOUD instead of degrading.
 */
export async function decodeActionBody(
  body: ServerActionBody,
  codec: Pick<ServerActionFlightCodec, "decodeReply"> | null
): Promise<unknown[]> {
  if (body.kind === "args") return body.args;
  if (codec) {
    return await codec.decodeReply(
      body.kind === "form-data" ? body.formData : body.text
    );
  }
  if (body.kind === "form-data") {
    throw new Error(
      "[handleServerAction] Multipart action body received but no flight codec " +
        "is available to decode it. Run the handler under the react-server " +
        "condition (runner 'main'), route the request to the rsc-worker, or " +
        "use the baked edge action handler."
    );
  }
  // Legacy text reading: a JSON args array executes as-is; anything else is
  // passed through as the single raw argument (the historical worker contract).
  try {
    const parsed = JSON.parse(body.text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  return [body.text];
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

  // Buffer the request body under the size cap, then classify it.
  let body: ServerActionBody;
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
    const raw = Buffer.concat(chunks);

    if (verbose) {
      logger?.info(`[handleServerActionHelper] Request body length: ${raw.length}`);
    }

    const contentType = (req.headers["content-type"] as string | undefined) ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      // encodeReply's multipart output (File / binary arguments). Reconstruct
      // the standard FormData for the transport's decodeReply.
      body = {
        kind: "form-data",
        formData: await formDataFromBytes(new Uint8Array(raw), contentType),
      };
    } else {
      const classified = classifyTextBody(raw.toString());
      body = classified.body;
      if (classified.legacyId) id = classified.legacyId;
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
      `[handleServerActionHelper] Server action request for ${id} (${body.kind})`
    );
  }

  return { id, body };
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

  // Buffer under the size cap first (request.formData()/text() have no cap of
  // their own), then classify — multipart reconstructs as FormData for
  // decodeReply, everything else stays text.
  const bytes: Uint8Array[] = [];
  if (request.body) {
    const reader = request.body.getReader();
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
      bytes.push(value);
    }
  }
  let total = 0;
  for (const b of bytes) total += b.byteLength;
  const raw = new Uint8Array(total);
  {
    let offset = 0;
    for (const b of bytes) {
      raw.set(b, offset);
      offset += b.byteLength;
    }
  }

  let body: ServerActionBody;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    body = {
      kind: "form-data",
      formData: await formDataFromBytes(raw, contentType),
    };
  } else {
    const classified = classifyTextBody(new TextDecoder().decode(raw));
    body = classified.body;
    if (classified.legacyId) id = classified.legacyId;
  }

  if (!id) {
    throw new Error("Server action ID is required");
  }
  if (verbose) {
    logger?.info(
      `[handleServerActionHelper] Web server action request for ${id} (${body.kind})`
    );
  }
  return { id, body };
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