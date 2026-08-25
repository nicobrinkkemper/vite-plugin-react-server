// Web-standard by construction (no node:*): this core must run wherever a
// fetch handler runs. The Node conveniences live in ./index.ts.

import { matchRoutes } from "../router/matchRoute.js";

/**
 * The runtime-agnostic host core (docs/internals/host-spec.md): one
 * `(Request) => Promise<Response>` implementing the request algorithm over a
 * host manifest — prerendered documents (and their `.rsc` siblings, by
 * suffix or Accept) before the asset inventory, per-request renders for
 * dynamic matches, the action gate on POST, and DISTINCT failures (404
 * document for a miss, 500 after `onError` for a render failure, 405
 * elsewhere). Conditional requests and cache profiles derive from the
 * manifest at startup; nothing is recomputed per request.
 */

export type HostManifest = {
  version: number;
  target: "node" | "edge";
  base: string;
  routes: Array<{ pattern: string; dynamic: boolean }>;
  prerendered: string[];
  assets: string[];
  cssByPattern: Record<string, string[]>;
  inlineThreshold?: number;
  bootstrapModules: string[];
  notFoundPage?: string;
  errorPage?: string;
  etags: Record<string, string>;
  precompressed: string[];
  transport: "esm" | "webpack";
  moduleBaseURL: string;
  htmlOutputPath: string;
  rscOutputPath: string;
  stripHtmlSuffix: boolean;
  renderBundle?: string;
  consumerBundle?: string;
};

export type StaticFile = {
  body: ReadableStream<Uint8Array> | Uint8Array;
  size?: number;
};

/** The render seam marks a loader notFound() with this header so the host
 *  serves the manifest 404 document instead of a bare inner body. */
export const HOST_OUTCOME_HEADER = "x-vprs-host-outcome";

export type HostCoreOptions = {
  manifest: HostManifest;
  /** Read an emitted static file by its manifest-relative path, or null. */
  serveStatic: (path: string) => Promise<StaticFile | null>;
  /**
   * Provide the per-request renderer and the action gate for ONE request —
   * called per request so error attribution can never cross requests. Both
   * receive the platform tail (a fetch runtime's env/ctx) for the bindings
   * seam. A render marking {@link HOST_OUTCOME_HEADER}: "not-found" is a
   * loader notFound() and gets the manifest 404 document.
   */
  loadRender: () => Promise<{
    render: (request: Request, platform: unknown[]) => Promise<Response>;
    action: (request: Request, platform: unknown[]) => Promise<Response>;
  }>;
  onError?: (error: unknown) => void;
  /** A hung render answers 500 instead of hanging the connection. */
  renderDeadlineMs?: number;
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".rsc": "text/x-component; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const extOf = (path: string): string => {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i).toLowerCase();
};

const contentType = (path: string): string =>
  MIME[extOf(path)] ?? "application/octet-stream";

const FALLBACK_404 = `<!doctype html><html><head><meta charset="utf-8"><title>Not found</title></head><body style="font-family:system-ui;padding:3rem"><h1>404</h1><p>This page does not exist.</p></body></html>`;
const FALLBACK_500 = `<!doctype html><html><head><meta charset="utf-8"><title>Server error</title></head><body style="font-family:system-ui;padding:3rem"><h1>500</h1><p>The server failed to render this page.</p></body></html>`;

export function createHostFromManifest(
  options: HostCoreOptions
): (request: Request, ...platform: unknown[]) => Promise<Response> {
  const {
    manifest,
    serveStatic,
    loadRender,
    onError,
    renderDeadlineMs = 30_000,
  } = options;

  if (manifest.version !== 1) {
    throw new Error(
      `[createHost] host-manifest version ${manifest.version} is not ` +
        `understood by this host (expected 1) — rebuild, or update the plugin.`
    );
  }

  const base = manifest.base.endsWith("/") ? manifest.base : `${manifest.base}/`;
  const assets = new Set(manifest.assets);
  const prerendered = new Set(manifest.prerendered);
  const htmlName = manifest.htmlOutputPath || "index.html";
  const rscName = manifest.rscOutputPath || "index.rsc";
  const rscSuffixRe = new RegExp(
    `^(.*/)${rscName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
  );
  const patterns = manifest.routes.map((r) => r.pattern);
  const dynamicByPattern = new Map(
    manifest.routes.map((r) => [r.pattern, r.dynamic])
  );

  let renderPair: ReturnType<HostCoreOptions["loadRender"]> | undefined;
  const pair = () => (renderPair ??= loadRender());

  const staticHeaders = (
    path: string,
    profile: "asset" | "document"
  ): Headers => {
    const headers = new Headers();
    headers.set("content-type", contentType(path));
    headers.set("x-content-type-options", "nosniff");
    headers.set(
      "cache-control",
      profile === "asset" ? "public, max-age=31536000, immutable" : "no-cache"
    );
    const etag = manifest.etags[path];
    if (etag) headers.set("etag", etag);
    if (profile === "document") headers.set("vary", "Accept");
    return headers;
  };

  const serveFile = async (
    request: Request,
    path: string,
    profile: "asset" | "document",
    status = 200
  ): Promise<Response> => {
    // Existence first: a 304 for an artifact the adapter cannot produce
    // would hide a broken deploy behind the client's cache.
    const file = await serveStatic(path);
    if (!file) {
      return new Response(`missing static artifact: ${path}`, {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    const cancelBody = () => {
      if (file.body instanceof ReadableStream) {
        void file.body.cancel().catch(() => {});
      }
    };
    const headers = staticHeaders(path, profile);
    if (file.size !== undefined) {
      headers.set("content-length", String(file.size));
    }
    // Error/404 pages carry their required status — never a 304.
    const etag = manifest.etags[path];
    if (
      status === 200 &&
      etag &&
      request.headers.get("if-none-match") === etag
    ) {
      cancelBody();
      headers.delete("content-length");
      return new Response(null, { status: 304, headers });
    }
    if (request.method === "HEAD") {
      cancelBody();
      return new Response(null, { status, headers });
    }
    return new Response(file.body as BodyInit, { status, headers });
  };

  const notFound = (request: Request): Promise<Response> =>
    manifest.notFoundPage
      ? serveFile(request, manifest.notFoundPage, "document", 404)
      : Promise.resolve(
          new Response(FALLBACK_404, {
            status: 404,
            headers: { "content-type": "text/html; charset=utf-8" },
          })
        );

  const errorPage = (request: Request): Promise<Response> =>
    manifest.errorPage
      ? serveFile(request, manifest.errorPage, "document", 500)
      : Promise.resolve(
          new Response(FALLBACK_500, {
            status: 500,
            headers: { "content-type": "text/html; charset=utf-8" },
          })
        );

  /** Re-base an app-relative Location coming out of the inner renderer. */
  const rebaseLocation = (location: string): string =>
    base !== "/" && location.startsWith("/") && !location.startsWith(base)
      ? `${base.slice(0, -1)}${location}`
      : location;

  // Malformed percent-encoding must be a controlled 404, never a handler
  // rejection — and matching happens on the ENCODED pathname (the canonical
  // router decodes individual segments defensively itself; a top-level
  // decode would turn %2F into a segment boundary).
  const safeDecode = (value: string): string | null => {
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  };

  return async function hostHandler(
    request: Request,
    ...platform: unknown[]
  ): Promise<Response> {
    const url = new URL(request.url);
    let pathname = url.pathname;

    // The route base scopes the app: strip it, and refuse anything outside
    // it — an un-based path must not remain routable under a based deploy.
    if (base !== "/") {
      if (pathname === base.slice(0, -1)) {
        return new Response(null, {
          status: 308,
          headers: { location: `${base}${url.search}` },
        });
      }
      if (!pathname.startsWith(base)) {
        return notFound(request);
      }
      pathname = `/${pathname.slice(base.length)}`;
    }

    if (request.method === "POST") {
      if (request.headers.get("x-rsc-action")) {
        const { action } = await pair();
        return action(request, platform);
      }
      return new Response("method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD, POST" },
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD, POST" },
      });
    }

    // Document detection BEFORE the asset inventory: the prerendered `.rsc`
    // siblings live in `assets`, but they are documents — immutable caching
    // on them would pin stale flight forever. Either the suffix or an
    // Accept: text/x-component on the page url selects the flight shape.
    const rscMatch = pathname.match(rscSuffixRe);
    const acceptsFlight = (request.headers.get("accept") ?? "").includes(
      "text/x-component"
    );
    const docPathname = rscMatch ? rscMatch[1]! : pathname;
    const routeUrl = docPathname === "/" ? "/" : docPathname.replace(/\/$/, "");

    // Static inventories hold decoded file paths: decode the candidate
    // through the guard for lookups only. A malformed encoding simply never
    // matches an artifact and falls through to the controlled 404.
    const decodedRouteUrl = safeDecode(routeUrl);

    if (
      (rscMatch || acceptsFlight) &&
      decodedRouteUrl !== null &&
      prerendered.has(decodedRouteUrl)
    ) {
      const dir =
        decodedRouteUrl === "/" ? "" : `${decodedRouteUrl.slice(1)}/`;
      return serveFile(request, `${dir}${rscName}`, "document");
    }

    // Exact asset lookup before routing: once a path is a known static
    // artifact, route matching never sees it.
    const decodedAsset = safeDecode(pathname.replace(/^\//, ""));
    if (!rscMatch && decodedAsset !== null && assets.has(decodedAsset)) {
      return serveFile(request, decodedAsset, "asset");
    }

    // Trailing-slash canonicalization for document urls — preserving base
    // and query: one URL per page, matching what the prerender emitted.
    if (!rscMatch && !pathname.endsWith("/") && extOf(pathname) === "") {
      const basedPath =
        base === "/" ? pathname : `${base.slice(0, -1)}${pathname}`;
      return new Response(null, {
        status: 308,
        headers: { location: `${basedPath}/${url.search}` },
      });
    }

    if (decodedRouteUrl !== null && prerendered.has(decodedRouteUrl)) {
      const dir =
        decodedRouteUrl === "/" ? "" : `${decodedRouteUrl.slice(1)}/`;
      return serveFile(request, `${dir}${htmlName}`, "document");
    }

    // vprs routing (bare $ consumes the remaining segments) — never a
    // private re-implementation.
    const matched = matchRoutes(patterns, routeUrl);
    if (!matched || !dynamicByPattern.get(matched.pattern)) {
      return notFound(request);
    }

    // The inner renderer sees the APP-RELATIVE url: forward a rewritten
    // request, chained to our deadline so a hung upstream aborts instead of
    // rendering on after the 500.
    const controller = new AbortController();
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener("abort", () => controller.abort());
    const forwardUrl = new URL(request.url);
    forwardUrl.pathname = pathname;
    const forward = new Request(forwardUrl, {
      method: request.method,
      headers: request.headers,
      signal: controller.signal,
    });

    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { render } = await pair();
      const deadline = new Promise<never>((_, reject) => {
        deadlineTimer = setTimeout(() => {
          controller.abort();
          reject(new Error(`render deadline (${renderDeadlineMs}ms) hit`));
        }, renderDeadlineMs);
        (deadlineTimer as { unref?: () => void }).unref?.();
      });
      const response = await Promise.race([
        render(forward, platform),
        deadline,
      ]);
      if (response.headers.get(HOST_OUTCOME_HEADER) === "not-found") {
        return notFound(request);
      }
      const headers = new Headers(response.headers);
      headers.delete(HOST_OUTCOME_HEADER);
      headers.set("cache-control", "no-store");
      headers.set("vary", "Accept");
      const location = headers.get("location");
      if (location) headers.set("location", rebaseLocation(location));
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      onError?.(error);
      return errorPage(request);
    } finally {
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    }
  };
}
