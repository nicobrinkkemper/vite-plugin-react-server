// Web-standard by construction (no node:*): this core must run wherever a
// fetch handler runs. The Node conveniences live in ./index.ts.

/**
 * The runtime-agnostic host core (docs/internals/host-spec.md): one
 * `(Request) => Promise<Response>` implementing the request algorithm over a
 * host manifest — exact-match assets before routing, prerendered documents,
 * per-request renders for dynamic matches, the action gate on POST, and
 * DISTINCT failures (404 document for a miss, 500 after `onError` for a
 * render failure, 405 elsewhere). Conditional requests and cache profiles
 * derive from the manifest at startup; nothing is recomputed per request.
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

export type HostCoreOptions = {
  manifest: HostManifest;
  /** Read an emitted static file by its manifest-relative path, or null. */
  serveStatic: (path: string) => Promise<StaticFile | null>;
  /**
   * Lazily provide the per-request renderer and the action gate — the
   * flavor the manifest records (the baked pair under transport "webpack").
   * Called once, on first need.
   */
  loadRender: () => Promise<{
    render: (request: Request) => Promise<Response>;
    action: (request: Request) => Promise<Response>;
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

function matchPattern(pattern: string, pathname: string): boolean {
  const p = pattern.split("/").filter(Boolean);
  const u = pathname.split("/").filter(Boolean);
  if (p.length !== u.length) return false;
  return p.every((seg, i) => seg.startsWith("$") || seg === u[i]);
}

export function createHostFromManifest(
  options: HostCoreOptions
): (request: Request) => Promise<Response> {
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

  let renderPair:
    | Promise<{
        render: (request: Request) => Promise<Response>;
        action: (request: Request) => Promise<Response>;
      }>
    | undefined;
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
    const etag = manifest.etags[path];
    if (etag && request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: staticHeaders(path, profile),
      });
    }
    const file = await serveStatic(path);
    if (!file) {
      // A manifest-known artifact the adapter cannot produce is a deploy
      // defect — answer plainly, never fall through to a render.
      return new Response(`missing static artifact: ${path}`, {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    const headers = staticHeaders(path, profile);
    if (file.size !== undefined && request.method !== "HEAD") {
      headers.set("content-length", String(file.size));
    }
    return new Response(
      request.method === "HEAD" ? null : (file.body as BodyInit),
      { status, headers }
    );
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

  return async function hostHandler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);

    // Base strip: the router speaks app-relative paths.
    if (base !== "/" && pathname.startsWith(base)) {
      pathname = `/${pathname.slice(base.length)}`;
    }

    if (request.method === "POST") {
      if (request.headers.get("x-rsc-action")) {
        const { action } = await pair();
        return action(request);
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

    // Exact asset lookup before any routing: once a path is a known static
    // artifact, route matching never sees it.
    const assetPath = pathname.replace(/^\//, "");
    if (assets.has(assetPath)) {
      return serveFile(request, assetPath, "asset");
    }

    // The `.rsc` sibling of a prerendered/dynamic document.
    const rscMatch = pathname.match(rscSuffixRe);
    const docPathname = rscMatch ? rscMatch[1]! : pathname;

    // Trailing-slash canonicalization for document urls: one URL per page,
    // matching what the prerender emitted.
    if (!rscMatch && !pathname.endsWith("/") && extOf(pathname) === "") {
      return new Response(null, {
        status: 308,
        headers: { location: `${pathname}/` },
      });
    }

    const routeUrl =
      docPathname === "/" ? "/" : docPathname.replace(/\/$/, "");

    if (prerendered.has(routeUrl)) {
      const dir = routeUrl === "/" ? "" : `${routeUrl.slice(1)}/`;
      const file = rscMatch ? `${dir}${rscName}` : `${dir}${htmlName}`;
      return serveFile(request, file, "document");
    }

    const matched = manifest.routes.find((r) =>
      matchPattern(r.pattern, routeUrl)
    );
    if (!matched || !matched.dynamic) {
      return notFound(request);
    }

    try {
      const { render } = await pair();
      const deadline = new Promise<never>((_, reject) => {
        const t = setTimeout(
          () => reject(new Error(`render deadline (${renderDeadlineMs}ms) hit`)),
          renderDeadlineMs
        );
        (t as { unref?: () => void }).unref?.();
      });
      const response = await Promise.race([render(request), deadline]);
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store");
      headers.set("vary", "Accept");
      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      onError?.(error);
      return errorPage(request);
    }
  };
}
