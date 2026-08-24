import { existsSync, readFileSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import {
  createHostFromManifest,
  type HostManifest,
  type StaticFile,
} from "./createHostFromManifest.js";

export { createHostFromManifest } from "./createHostFromManifest.js";
export type { HostManifest, HostCoreOptions, StaticFile } from "./createHostFromManifest.js";
export { toNodeListener } from "../helpers/createRequestHandler.server.js";

export type CreateHostOptions = {
  /** The build output root (the directory holding `server`, `static`, `server-edge`). */
  buildDir: string;
  onError?: (error: unknown) => void;
  renderDeadlineMs?: number;
};

/**
 * The Node convenience form (host-spec, "The API"): inspect `buildDir` at
 * startup, read the emitted host manifest, and serve — static files from
 * disk, per-request renders and actions through the flavor the manifest
 * records. Currently follows the baked pair (`transport: "webpack"`); a
 * build without it is a startup error naming the config that emits one.
 */
export function createHost(
  options: CreateHostOptions
): (request: Request) => Promise<Response> {
  const { buildDir, onError, renderDeadlineMs } = options;

  const edgeManifestPath = join(buildDir, "server-edge/host-manifest.json");
  if (!existsSync(edgeManifestPath)) {
    throw new Error(
      `[createHost] no host manifest at ${edgeManifestPath} — build with ` +
        `transport:"webpack" (runner "edge", or "isolated"/"main" with ` +
        `build.edge) so the baked pair and its manifest are emitted.`
    );
  }
  const manifest = JSON.parse(
    readFileSync(edgeManifestPath, "utf8")
  ) as HostManifest;

  const staticDir = join(buildDir, "static");
  const serveStatic = async (path: string): Promise<StaticFile | null> => {
    const abs = join(staticDir, path);
    // Containment: the manifest inventory is the allowlist, but join()
    // collapses `../` — refuse anything that escapes.
    if (!abs.startsWith(staticDir)) return null;
    if (!existsSync(abs)) return null;
    const size = statSync(abs).size;
    const handle = await open(abs, "r");
    const body = Readable.toWeb(
      handle.createReadStream()
    ) as unknown as ReadableStream<Uint8Array>;
    return { body, size };
  };

  const loadRender = async () => {
    const edgeDir = join(buildDir, "server-edge");
    const bundle = (await import(
      pathToFileURL(join(edgeDir, "render.js")).href
    )) as {
      handleRouteAction: (request: Request) => Promise<Response>;
    };
    const consumer = (await import(
      pathToFileURL(join(edgeDir, "consumer.js")).href
    )) as { renderFlightToHtml: unknown };
    const { createEdgeRequestHandler } = await import("../edge/index.js");
    // React reports component failures through onError while the boundary
    // DEGRADES and the buffered document still answers 200 — the same
    // silent-bad-response the SSG freeze guards against. The document branch
    // buffers before responding, so every onError for a request has fired by
    // the time its Response exists: a grown error list turns the degraded
    // 200 into the thrown failure the host maps to the 500 page. (Under
    // concurrent failing renders the count-delta can blame an overlapping
    // request — the conservative direction: never a degraded 200.)
    const renderErrors: unknown[] = [];
    const render = createEdgeRequestHandler(bundle as never, {
      renderFlightToHtml: consumer.renderFlightToHtml as never,
      onError: (error: unknown) => renderErrors.push(error),
    });
    return {
      render: async (request: Request) => {
        const before = renderErrors.length;
        const response = await render(request);
        if (renderErrors.length > before) {
          throw renderErrors[before];
        }
        return response;
      },
      action: (request: Request) => bundle.handleRouteAction(request),
    };
  };

  return createHostFromManifest({
    manifest,
    serveStatic,
    loadRender,
    ...(onError ? { onError } : {}),
    ...(renderDeadlineMs !== undefined ? { renderDeadlineMs } : {}),
  });
}
