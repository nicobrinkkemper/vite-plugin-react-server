import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Manifest } from "vite";
import { createRequestHandler } from "./createRequestHandler.server.js";
import { collectManifestCss } from "./collectManifestCss.js";
import { createEdgeHandler } from "../stream/createEdgeHandler.client.js";
import type { CssContent } from "../types.js";

/**
 * The baked edge bundle's public surface (`dist/server-edge/render.js`).
 */
type EdgeBundle = {
  renderRouteToDocument: (
    url: string,
    opts?: { cssFiles?: Map<string, CssContent> }
  ) => Promise<{
    full: ReadableStream<Uint8Array>;
    headless: ReadableStream<Uint8Array>;
  }>;
  handleRouteAction: (
    request: Request,
    opts?: { projectRoot?: string }
  ) => Promise<Response>;
  routeManifest: Record<string, { pagePath: string; propsPath: string }>;
};

export type CreateEdgeRequestHandlerOptions = {
  /** The build output dir (holds `static/`, `client/`, `server/`, `server-edge/`). */
  buildDir: string;
  /**
   * Which routes render live, per request (the serving-layer strategy — kept off
   * `Page`/`props`, which define the static page surface). A list of urls or a
   * predicate. Everything else is served from the prerendered `static/` build.
   */
  dynamic?: string[] | ((url: string) => boolean);
  /**
   * URL base the build was made for. Pass your build's `import.meta.env.BASE_URL`
   * (baked in at build time) rather than a runtime env var, so it can't drift
   * from the base the prerendered assets and bootstrap paths were built with.
   * @default "/"
   */
  base?: string;
  /** CSS at or under this many bytes inlines as `<style>`, else a `<link>`. @default 10000 */
  inlineThreshold?: number;
  /** Project root passed to the action gate (baked gate ignores it). @default process.cwd() */
  projectRoot?: string;
  /** Overrides for non-default output layouts. */
  staticDir?: string;
  clientDir?: string;
  edgeBundlePath?: string;
};

/** Attach each server-manifest entry's CSS from the static build (so page+props resolve styles). */
function transformServerManifestCss(
  serverManifest: Manifest,
  staticManifest: Manifest
): Manifest {
  return Object.fromEntries(
    Object.entries(serverManifest).map(([key, entry]) => {
      const e = entry as { isEntry?: boolean; file?: string };
      if (e?.isEntry && e.file) {
        for (const sv of Object.values(staticManifest)) {
          const s = sv as { file?: string; css?: string[] };
          if (s?.file === e.file && s.css?.length) {
            return [key, { ...entry, css: s.css }];
          }
        }
      }
      return [key, entry];
    })
  ) as Manifest;
}

/** Build the `Map<file, CssContent>` a dynamic render passes for its page styles. */
function toCssMap(
  inputs: Record<string, string>,
  staticDir: string,
  base: string,
  inlineThreshold: number
): Map<string, CssContent> {
  return new Map(
    Object.values(inputs).map((file) => {
      const code = readFileSync(join(staticDir, file), "utf-8");
      const content: CssContent =
        code.length <= inlineThreshold
          ? { id: file, as: "style", type: "text/css", children: code }
          : { id: file, as: "link", rel: "stylesheet", href: base + file, precedence: "high" };
      return [file, content];
    })
  );
}

/**
 * Assemble the whole no-`--conditions` edge server for a vprs build into one Web
 * `(Request) => Response` — the thing every consumer's `start.tsx` was rebuilding
 * by hand. It serves the prerendered `static/` build, dispatches `"use server"`
 * actions through the bundle's baked gate, and renders the `dynamic` routes live
 * per request (flash-free document on a GET, headless flight on a client `.rsc`
 * navigation) with their CSS collected from the build manifests.
 *
 * Returns the handler; you supply the runtime adapter (node `http`, Bun, Deno, a
 * platform `fetch` export) — so the "edge" promise stays yours. Pair it with a
 * few-line entry instead of a hundred lines of wiring.
 */
export async function createEdgeRequestHandler(
  options: CreateEdgeRequestHandlerOptions
): Promise<(request: Request) => Promise<Response>> {
  const {
    buildDir,
    base = "/",
    inlineThreshold = 10000,
    projectRoot = process.cwd(),
  } = options;
  const staticDir = options.staticDir ?? join(buildDir, "static");
  const clientDir = options.clientDir ?? join(buildDir, "client");
  const edgePath =
    options.edgeBundlePath ?? join(buildDir, "server-edge", "render.js");

  const readManifest = (dir: string): Manifest =>
    JSON.parse(readFileSync(join(dir, ".vite", "manifest.json"), "utf-8"));
  const staticManifest = readManifest(staticDir);
  const serverManifest = readManifest(join(buildDir, "server"));
  const transformedServer = transformServerManifestCss(
    serverManifest,
    staticManifest
  );

  // The in-process HTML render resolves client-component references from the ssr
  // bundle (dist/client) on disk; the browser hydrates from `base` separately.
  const ssrModuleBaseURL = pathToFileURL(clientDir).href + "/";
  const indexFile = (staticManifest["index.html"] as { file?: string })?.file;
  const bootstrapModules = indexFile ? [base + indexFile] : [];

  const { renderRouteToDocument, handleRouteAction, routeManifest } =
    (await import(pathToFileURL(edgePath).href)) as EdgeBundle;

  const dynamic = options.dynamic ?? [];
  const isDynamic =
    typeof dynamic === "function"
      ? dynamic
      : (url: string) => dynamic.includes(url);

  const cssCache = new Map<string, Map<string, CssContent>>();
  const cssForRoute = (url: string): Map<string, CssContent> => {
    let m = cssCache.get(url);
    if (!m) {
      const info = routeManifest[url];
      const inputs = info
        ? collectManifestCss(transformedServer, [info.pagePath, info.propsPath])
        : {};
      m = toCssMap(inputs, staticDir, base, inlineThreshold);
      cssCache.set(url, m);
    }
    return m;
  };

  const normalizeRoute = (pathname: string): string =>
    pathname.replace(/\/index\.rsc$|\.rsc$|\/$/, "") || "/";

  return createRequestHandler({
    staticDir,
    action: (request) => handleRouteAction(request, { projectRoot }),
    render: async (pathname, request) => {
      const route = normalizeRoute(pathname);
      if (!isDynamic(route)) return null;
      const wantsFlight =
        pathname.endsWith(".rsc") ||
        (request.headers.get("accept") ?? "").includes("text/x-component");
      try {
        if (wantsFlight) {
          // Client navigation: the live headless flight for #root.
          const { headless } = await renderRouteToDocument(route, {
            cssFiles: cssForRoute(route),
          });
          return new Response(headless as unknown as BodyInit, {
            headers: {
              "Content-Type": "text/x-component; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          });
        }
        // Document load: the full flash-free HTML with the live data + inline flight.
        const handler = createEdgeHandler({
          renderDocument: () =>
            renderRouteToDocument(route, { cssFiles: cssForRoute(route) }),
          moduleBaseURL: ssrModuleBaseURL,
          bootstrapModules,
          getURL: () => route,
        });
        return await handler(request);
      } catch (error) {
        // Degrade to the prerendered shell rather than 500.
        console.error(
          `[edge] dynamic render failed for ${route}; serving prerendered shell:`,
          error
        );
        return null;
      }
    },
  });
}
