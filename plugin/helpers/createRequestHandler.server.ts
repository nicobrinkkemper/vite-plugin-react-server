import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MIME_TYPES } from "../config/mimeTypes.js";
import { isPathWithin } from "./isPathWithin.js";
import type { ServerActionHandlerOptions } from "./handleServerActionHelper.js";

/**
 * A pre-built action handler — `(Request) => Response`. The single-isolate edge
 * bake provides one (the baked action gate), so a no-`--conditions` process can
 * dispatch actions without statically importing the react-server transport.
 */
export type ActionRequestHandler = (
  request: Request
) => Promise<Response> | Response;

export interface CreateRequestHandlerOptions {
  /**
   * Directory of the prerendered build output to serve files from (typically
   * `dist/static`). Routes map to files: `/` -> `index.html`, `/about/` or
   * `/about` -> `about/index.html`, and `*.rsc` / hashed assets are served as-is.
   */
  staticDir: string;
  /**
   * Server-action handling for a POST carrying the action header. Omit to serve
   * a read-only site. Either:
   *  - {@link ServerActionHandlerOptions} — the built-in disk-backed sealed gate
   *    (needs `--conditions react-server`; the transport is imported lazily, only
   *    when this form is used, so passing a function keeps the handler
   *    condition-neutral); or
   *  - an {@link ActionRequestHandler} function — e.g. the single-isolate edge
   *    bake's baked action gate, for a no-`--conditions` process.
   */
  action?: ServerActionHandlerOptions | ActionRequestHandler;
  /**
   * Optional per-request renderer for dynamic routes. Called on a GET before the
   * static fallback; return a `Response` to handle the route dynamically (e.g.
   * driving `createInlineFlightRenderer`), or `null` to fall through to the
   * prerendered file.
   */
  render?: (
    route: string,
    request: Request
  ) => Promise<Response | null> | Response | null;
  /** Header that marks a POST as a server action. Default `x-rsc-action`. */
  actionHeader?: string;
}

async function resolveStaticFile(
  staticDir: string,
  pathname: string
): Promise<{ body: Uint8Array; contentType: string } | null> {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith("/")) rel += "index.html";
  else if (!extname(rel)) rel += "/index.html";

  const full = join(staticDir, rel.startsWith("/") ? `.${rel}` : rel);
  // Traversal guard: a request path must not escape the static root.
  if (!isPathWithin(staticDir, full)) return null;

  try {
    const body = await readFile(full);
    const contentType =
      MIME_TYPES[extname(full).toLowerCase()] ?? "application/octet-stream";
    return { body: new Uint8Array(body), contentType };
  } catch {
    return null;
  }
}

/**
 * A Web-standard `(Request) => Promise<Response>` server for a vprs build:
 * dispatches server actions, optional dynamic routes, and prerendered files.
 * Compose it with {@link toNodeListener} for `http.createServer`, or pass it
 * straight to a Fetch-style runtime (Hono, Bun, Deno).
 *
 * Note: static file serving reads from disk (`node:fs`), so the handler as a
 * whole is Node-first. The action surface is runtime-agnostic; on edge, serve
 * prerendered files from the platform and use `render` for dynamic routes.
 */
export function createRequestHandler(
  options: CreateRequestHandlerOptions
): (request: Request) => Promise<Response> {
  const { staticDir, action, render, actionHeader = "x-rsc-action" } = options;

  return async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && action && request.headers.get(actionHeader)) {
      if (typeof action === "function") return action(request);
      // Lazy import: pulling handleServerActionRequest eagerly would static-link
      // the react-server transport (asserts the `react-server` condition) into
      // every importer — including no-`--conditions` edge servers that pass a
      // baked action function instead. Imported only when the built-in gate is
      // actually used.
      const { handleServerActionRequest } = await import(
        "./handleServerAction.server.js"
      );
      return handleServerActionRequest(request, action);
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (render) {
        const dynamic = await render(url.pathname, request);
        if (dynamic) return dynamic;
      }
      const file = await resolveStaticFile(staticDir, url.pathname);
      if (file) {
        // file.body is a Uint8Array (a valid BodyInit at runtime); newer
        // @types/node types it as Uint8Array<ArrayBufferLike>, which the DOM
        // Response constructor doesn't structurally accept — cast across it.
        return new Response(request.method === "HEAD" ? null : (file.body as BodyInit), {
          headers: { "Content-Type": file.contentType },
        });
      }

      // A FLIGHT request that missed answers with the 404 route's flight when
      // the app prerendered one: status 404 (a shared cache must not treat a
      // miss as content), but a body the flight DECODER can read — the client
      // router then shows the 404 route without leaving the SPA. Text or HTML
      // here would poison the decoder; that class is what this exists to
      // retire. Without a prerendered /404, the plain 404 below stands and
      // the client falls back to a full navigation.
      if (
        url.pathname.endsWith(".rsc") ||
        (request.headers.get("accept") ?? "").includes("text/x-component")
      ) {
        const notFoundFlight = await resolveStaticFile(
          staticDir,
          "/404/index.rsc"
        );
        if (notFoundFlight) {
          return new Response(
            request.method === "HEAD" ? null : (notFoundFlight.body as BodyInit),
            {
              status: 404,
              headers: {
                "Content-Type": "text/x-component; charset=utf-8",
                "x-vprs-outcome": "not-found",
              },
            }
          );
        }
      }
    }

    return new Response("Not Found", { status: 404 });
  };
}

/**
 * Adapt a Web `(Request) => Promise<Response>` handler to a Node
 * `http`/Connect request listener, so the same handler runs under
 * `http.createServer(toNodeListener(handler))` or as Express middleware.
 */
export function toNodeListener(
  handler: (request: Request) => Promise<Response>
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
    const method = req.method ?? "GET";
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      else if (value != null) headers.set(key, value);
    }
    const hasBody = method !== "GET" && method !== "HEAD";
    const request = new Request(url, {
      method,
      headers,
      body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
      // Required by undici when streaming a request body.
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    handler(request)
      .then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (response.body) {
          for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            res.write(chunk);
          }
        }
        res.end();
      })
      .catch((err) => {
        res.statusCode = 500;
        res.end(String(err instanceof Error ? err.message : err));
      });
  };
}
