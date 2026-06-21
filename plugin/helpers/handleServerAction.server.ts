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
import { createSealedServerReferenceGate } from "../references/createSealedServerReferenceGate.server.js";
import type { ReferenceGate } from "react-server-loader/references";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

/**
 * Server-side server action handler that uses ssrLoadModule
 */
export async function handleServerAction(
  req: IncomingMessage,
  res: ServerResponse,
  options: ServerActionHandlerOptions
): Promise<void> {
  const { projectRoot, verbose = false, logger, ssrLoadModule, base } = options;

  try {
    if (verbose) {
      logger?.info("[handleServerAction:server] Processing server action request");
    }

    // CSRF / cross-origin guard (opt-in). When allowedOrigins is configured, a
    // browser-driven cross-site POST carries an Origin header set to the calling
    // site; reject anything not in the allowlist. A missing Origin is allowed: a
    // page cannot suppress it on a cross-origin fetch, so its absence means
    // same-origin or a non-browser client (not a CSRF vector).
    if (options.allowedOrigins && options.allowedOrigins.length > 0) {
      const origin = (req.headers.origin as string | undefined) ?? "";
      if (origin && !options.allowedOrigins.includes(origin)) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: false, error: "Origin not allowed" }));
        return;
      }
    }

    // Parse the server action request
    const { id, args } = await parseServerActionRequestHelper(
      req,
      verbose,
      logger,
      options.maxBodyBytes
    );

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
            `${join(options.serverRoot ?? join(projectRoot, "dist", "server"), ".vite", "manifest.json")}). ` +
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
