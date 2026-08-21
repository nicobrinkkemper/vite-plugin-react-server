import type { Logger, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logError, toError } from "../error/index.js";
import { PassThrough } from "node:stream";
import type {
  ServerActionHandlerOptions,
} from "./handleServerActionHelper.js";
import {
  parseServerActionRequest as parseServerActionRequestHelper,
  parseServerActionWebRequest,
  assertOriginAllowed,
  createServerActionResponse,
  decodeActionBody,
  resolveServerAction,
  loadServerAction,
  executeServerAction,
  sendServerActionResponse,
  handleServerActionError as handleServerActionErrorHelper,
} from "./handleServerActionHelper.js";
import type {
  ServerActionFlightCodec,
  ServerActionRequest,
} from "./handleServerActionHelper.js";
import { hasReactServerCondition } from "../config/getCondition.js";
import { isNotFound, isRedirect } from "../router/loaderSignals.js";
import {
  OUTCOME,
  OUTCOME_HEADER,
  actionRedirectLocation,
} from "../utils/outcomeHeader.js";
import { createSealedServerReferenceGate } from "../references/createSealedServerReferenceGate.server.js";
import type { ReferenceGate } from "react-server-loader/references";
// node:fs / node:path load lazily inside the disk-manifest fallback ONLY (see
// resolveServerManifest): the baked edge path supplies resolveServerReference
// and short-circuits before any disk access, and a top-level import would
// crash module EVALUATION on a filesystem-less runtime regardless of whether
// the fallback ever runs.
const nodeDisk = () =>
  Promise.all([import("node:fs/promises"), import("node:path")]).then(
    ([fs, path]) => ({ readFile: fs.readFile, join: path.join })
  );

type ServerManifest = Record<string, { file: string; src?: string } | undefined>;

// Cache the sealed gate per server manifest object so it is built once, not per
// request. Keyed by the manifest reference (one per running server).
const sealedGates = new WeakMap<object, ReferenceGate>();

// Cache the on-disk manifest lookup per serverRoot (read at most once; `null`
// means "looked, not found" so we don't re-stat every request in dev).
const manifestByRoot = new Map<string, ServerManifest | null>();

/**
 * Resolve the server manifest that turns on the SEALED gate. Order:
 *  1. an explicit `serverManifest` option (with its serverRoot), else
 *  2. auto-load `<serverRoot>/.vite/manifest.json` (serverRoot defaults to
 *     `<projectRoot>/dist/server`) — so production seals with no extra args.
 * Returns null only when no manifest exists; the caller then FAILS CLOSED rather
 * than falling back to the open resolver. (The open resolver is reachable only via
 * the dev wrapper's `devOpen`, handled before this is called.)
 */
async function resolveServerManifest(
  options: ServerActionHandlerOptions
): Promise<{ serverManifest: ServerManifest; serverRoot: string } | null> {
  const { readFile, join } = await nodeDisk();
  if (options.serverManifest) {
    return {
      serverManifest: options.serverManifest,
      serverRoot: options.serverRoot ?? join(options.projectRoot, "dist", "server"),
    };
  }
  const serverRoot = options.serverRoot ?? join(options.projectRoot, "dist", "server");
  if (!manifestByRoot.has(serverRoot)) {
    try {
      const raw = await readFile(join(serverRoot, ".vite", "manifest.json"), "utf8");
      manifestByRoot.set(serverRoot, JSON.parse(raw) as ServerManifest);
    } catch {
      manifestByRoot.set(serverRoot, null);
    }
  }
  const manifest = manifestByRoot.get(serverRoot) ?? null;
  return manifest ? { serverManifest: manifest, serverRoot } : null;
}

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

// Runtime-only dynamic import: the specifier stays a VARIABLE so bundlers
// (the edge bake above all) cannot statically link the module graph behind
// it — flightRenderer.server pulls the vendored transport through
// node:module, which must never enter a baked edge bundle. The edge handler
// passes its own flightCodec, so these imports never run there.
const importAtRuntime = (specifier: string): Promise<any> =>
  import(/* @vite-ignore */ specifier);

/**
 * Resolve the flight codec the handlers decode arguments and render responses
 * with. Priority: an explicit `flightCodec` (the baked edge handler passes its
 * own pair), else the built-in transport pair — importable only under the
 * react-server condition, so a condition-less process without an explicit
 * codec gets `null` and the legacy JSON fallbacks (multipart fails loud).
 */
export async function resolveActionFlightCodec(
  options: ServerActionHandlerOptions
): Promise<ServerActionFlightCodec | null> {
  if (options.flightCodec) return options.flightCodec;
  if (!hasReactServerCondition()) return null;
  const { resolveFlightRenderer, resolveFlightReplyDecoder } =
    (await importAtRuntime("../stream/flightRenderer.server.js")) as
      typeof import("../stream/flightRenderer.server.js");
  const renderer = resolveFlightRenderer({
    transport: options.transport,
    moduleBasePath: options.moduleBasePath,
    moduleBaseURL: options.moduleBaseURL,
  });
  const decoder = resolveFlightReplyDecoder({
    transport: options.transport,
    moduleBasePath: options.moduleBasePath,
  });
  return {
    decodeReply: decoder.decodeReply,
    renderResponse: (payload) => renderer.render(payload, {}),
  };
}

/** Duck-type a Web ReadableStream vs a Node pipeable from the codec. */
function isWebStream(value: unknown): value is ReadableStream {
  return (
    typeof (value as { getReader?: unknown })?.getReader === "function"
  );
}

/**
 * I/O-agnostic core: resolve a parsed server-action request to its function (the
 * devOpen dev resolver, or the sealed production gate), decode its arguments
 * through the codec, and execute it. Shared by the Node (req/res) and Web
 * (Request/Response) entry points so the trust boundary lives in exactly one
 * place. Returns the action's result.
 */
export async function resolveAndExecuteServerAction(
  { id, body }: ServerActionRequest,
  options: ServerActionHandlerOptions,
  codec: ServerActionFlightCodec | null
): Promise<unknown> {
  const { projectRoot, verbose = false, logger, ssrLoadModule, base } = options;

  let action: Function;
  if (options.devOpen) {
    // OPEN path — reachable ONLY when the Vite dev wrapper opts in. Dev serves
    // live source, so there is no build manifest to seal against. NOT a trust
    // boundary. Defense in depth: refuse it under NODE_ENV=production so a
    // misconfigured prod deploy can never take the unsealed path even if the
    // flag leaks in.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[handleServerAction] devOpen (the unsealed dev resolver) was requested " +
          "under NODE_ENV=production. Server actions must be sealed in production; refusing."
      );
    }
    // Resolve against the project root with a traversal guard, then load on demand.
    const { fullPath, exportName } = resolveServerAction(
      id,
      projectRoot,
      verbose,
      logger
    );
    if (!ssrLoadModule) {
      throw new Error("ssrLoadModule is required for server action execution");
    }
    action = await loadServerAction(
      fullPath,
      exportName,
      ssrLoadModule,
      verbose,
      logger
    );
  } else if (options.resolveServerReference) {
    // SEALED path, caller-supplied gate. The single-isolate edge bake passes a
    // gate whose modules are baked into the edge bundle, so this runs with no
    // `react-server` condition and never disk-imports the transport. Still
    // sealed — an unregistered id throws inside the resolver.
    action = (await options.resolveServerReference(id)) as Function;
  } else {
    // SEALED path (production trust boundary). Resolve the client-supplied id
    // through a gate built from the build's server manifest: an id the build
    // never emitted is rejected before any import; the importer is bound to the
    // manifest's real file, never to a path derived from the id.
    const resolved = await resolveServerManifest(options);
    if (!resolved) {
      // FAIL CLOSED. A missing manifest in production must NOT silently fall back
      // to the open resolver — that would reopen the boundary we are enforcing.
      throw new Error(
        `[handleServerAction] No server manifest found (looked for ` +
          `${options.serverRoot ?? `${projectRoot}/dist/server`}/.vite/manifest.json). ` +
          `Server actions resolve through a sealed allowlist; pass serverRoot for a ` +
          `custom build.outDir, or serverManifest directly. Refusing unsealed resolution.`
      );
    }
    let gate = sealedGates.get(resolved.serverManifest);
    if (!gate) {
      gate = createSealedServerReferenceGate({
        serverManifest: resolved.serverManifest,
        serverRoot: resolved.serverRoot,
        base,
      });
      sealedGates.set(resolved.serverManifest, gate);
    }
    action = (await gate.resolveServerReference(id)) as Function;
  }

  const args = await decodeActionBody(body, codec);
  return executeServerAction(action, args, verbose, logger);
}

/**
 * Map a thrown action error to its terminal outcome. `null` means "not a
 * declared outcome" — a real failure, which the caller answers as the error
 * outcome (flight envelope when a codec exists, legacy JSON otherwise).
 */
function actionSignalOutcome(
  error: unknown
): { status: number; headers: Record<string, string> } | null {
  if (isRedirect(error)) {
    return {
      status: 303,
      headers: {
        location: actionRedirectLocation(error.to),
        [OUTCOME_HEADER]: OUTCOME.redirect,
      },
    };
  }
  if (isNotFound(error)) {
    // Marker only, no body: the client router fetches the 404 route's flight
    // through its own (cached) GET path, so this stays identical on hosts
    // that cannot render — static file servers and the bare Web handler
    // included.
    return { status: 404, headers: { [OUTCOME_HEADER]: OUTCOME.notFound } };
  }
  return null;
}

/** The error-outcome envelope: message only — never the stack or paths. */
const actionErrorPayload = (error: Error) => ({
  error: { message: error.message },
});

/**
 * Stream a flight-rendered payload into a Node response. The codec may hand
 * back either a Node pipeable or a Web stream — the edge codec renders Web
 * streams; the built-in Node pair renders pipeables.
 */
async function sendFlightActionResponse(
  res: ServerResponse,
  codec: ServerActionFlightCodec,
  payload: unknown
): Promise<void> {
  res.setHeader("Content-Type", "text/x-component; charset=utf-8");
  const stream = codec.renderResponse(payload);
  if (isWebStream(stream)) {
    const { Readable } = (await importAtRuntime("node:stream")) as
      typeof import("node:stream");
    Readable.fromWeb(stream as never).pipe(res);
  } else {
    stream.pipe(res);
  }
}

/** The Web counterpart: wrap the rendered payload in a `Response`. */
async function flightActionWebResponse(
  codec: ServerActionFlightCodec,
  payload: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Promise<Response> {
  const stream = codec.renderResponse(payload);
  let webStream: ReadableStream;
  if (isWebStream(stream)) {
    webStream = stream;
  } else {
    // A Node pipeable in a Web envelope (e.g. Hono on Node under the
    // react-server condition): bridge through node:stream. Never reached by
    // the edge bundle — its codec renders Web streams natively.
    const { PassThrough, Readable } = (await importAtRuntime(
      "node:stream"
    )) as typeof import("node:stream");
    const passThrough = new PassThrough();
    stream.pipe(passThrough);
    webStream = Readable.toWeb(passThrough) as unknown as ReadableStream;
  }
  return new Response(webStream, {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "text/x-component; charset=utf-8",
      ...init.headers,
    },
  });
}

/**
 * Server-side server action handler (Node req/res). A thin shim over the shared
 * core: CSRF guard, parse, resolve + execute, send.
 */
export async function handleServerAction(
  req: IncomingMessage,
  res: ServerResponse,
  options: ServerActionHandlerOptions
): Promise<void> {
  const { verbose = false, logger } = options;

  try {
    if (verbose) {
      logger?.info("[handleServerAction:server] Processing server action request");
    }

    assertOriginAllowed(req.headers.origin as string | undefined, options.allowedOrigins);

    const parsed = await parseServerActionRequestHelper(
      req,
      verbose,
      logger,
      options.maxBodyBytes
    );
    const codec = await resolveActionFlightCodec(options);
    const result = await resolveAndExecuteServerAction(parsed, options, codec);

    if (codec) {
      // The complete protocol: the payload rides the transport's own flight
      // renderer, so non-JSON values (Dates, streams, elements) survive.
      await sendFlightActionResponse(res, codec, { returnValue: result });
    } else {
      // Legacy JSON row — a condition-less process with no codec cannot
      // flight-render; plain JSON results keep working as before.
      sendServerActionResponse(res, result, verbose, logger);
    }

    if (verbose) {
      logger?.info("[handleServerAction:server] Server action completed successfully");
    }
  } catch (error: unknown) {
    // Loader-signal outcomes (redirect() / notFound() thrown by the action)
    // answer the transaction, they are not failures.
    const signal = actionSignalOutcome(error);
    if (signal) {
      res.statusCode = signal.status;
      for (const [key, value] of Object.entries(signal.headers)) {
        res.setHeader(key, value);
      }
      res.end();
      return;
    }
    // The error outcome: with a codec the body is valid flight — a
    // { error: { message } } envelope the client decodes and re-throws —
    // never JSON/text fed to a flight decoder. Codec-less keeps the legacy
    // JSON error row (the client refuses to decode non-flight).
    const err = toError(error) as Error & { statusCode?: number };
    let codec: ServerActionFlightCodec | null = null;
    try {
      codec = await resolveActionFlightCodec(options);
    } catch {
      // The codec itself is unavailable — the legacy JSON path stands.
    }
    if (codec && !res.headersSent) {
      logError(err, logger);
      res.statusCode =
        typeof err.statusCode === "number" ? err.statusCode : 500;
      res.setHeader(OUTCOME_HEADER, OUTCOME.error);
      await sendFlightActionResponse(res, codec, actionErrorPayload(err));
      return;
    }
    handleServerActionErrorHelper(error, res, logger);
  }
}

/**
 * Web-standard server action handler: `(Request) => Promise<Response>`. The
 * portable entry point for any Fetch-style runtime (Hono, Bun, Deno, edge
 * functions). Same trust boundary as the Node handler — it shares
 * `resolveAndExecuteServerAction` and the CSRF / body-cap guards — differing only
 * in the request/response envelope. The Node `handleServerAction` is the req/res
 * shim over the same core.
 */
export async function handleServerActionRequest(
  request: Request,
  options: ServerActionHandlerOptions
): Promise<Response> {
  const { verbose = false, logger } = options;
  try {
    if (verbose) {
      logger?.info("[handleServerAction:web] Processing server action request");
    }

    assertOriginAllowed(request.headers.get("origin"), options.allowedOrigins);

    const parsed = await parseServerActionWebRequest(
      request,
      verbose,
      logger,
      options.maxBodyBytes
    );
    const codec = await resolveActionFlightCodec(options);
    const result = await resolveAndExecuteServerAction(parsed, options, codec);

    if (codec) {
      return await flightActionWebResponse(codec, { returnValue: result });
    }
    // Legacy RSC wire row, matching the Node sendServerActionResponse output.
    return new Response(`0:${JSON.stringify(result)}\n`, {
      headers: { "Content-Type": "text/x-component" },
    });
  } catch (error: unknown) {
    // Loader-signal outcomes (redirect() / notFound() thrown by the action)
    // answer the transaction, they are not failures.
    const signal = actionSignalOutcome(error);
    if (signal) {
      return new Response(null, { status: signal.status, headers: signal.headers });
    }
    const err = toError(error) as Error & { statusCode?: number };
    logError(err, logger);
    // Honor a tagged status (403 origin, 413 oversized) else 500. Never ship the
    // stack to the client — it exposes absolute paths and internal module ids;
    // the full error is logged above.
    const status = typeof err.statusCode === "number" ? err.statusCode : 500;
    let codec: ServerActionFlightCodec | null = null;
    try {
      codec = await resolveActionFlightCodec(options);
    } catch {
      // The codec itself is unavailable — the legacy JSON path stands.
    }
    if (codec) {
      // The error outcome: valid flight, never JSON/text into a flight
      // decoder. The client decodes the envelope and rejects the action with
      // the server's message.
      return await flightActionWebResponse(codec, actionErrorPayload(err), {
        status,
        headers: { [OUTCOME_HEADER]: OUTCOME.error },
      });
    }
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
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
    transport?: "esm" | "webpack";
    moduleBasePath?: string;
    moduleBaseURL?: string;
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
    transport: handlerOptions.transport,
    moduleBasePath: handlerOptions.moduleBasePath,
    moduleBaseURL: handlerOptions.moduleBaseURL,
    // Dev serves live source via the runner; never auto-seal against a possibly
    // stale built manifest on disk.
    devOpen: true,
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
