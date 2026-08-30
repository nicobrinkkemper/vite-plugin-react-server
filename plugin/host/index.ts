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
  // Startup validation, per the spec: a mismatch is a startup error naming
  // the config that fixes it — never a first-request import failure. An
  // ordinary esm bake emits a manifest too, but no consumer half.
  if (manifest.target !== "edge") {
    throw new Error(
      `[createHost] ${edgeManifestPath} describes target "${manifest.target}" — expected the edge target.`
    );
  }
  if (
    manifest.transport !== "webpack" ||
    !manifest.renderBundle ||
    !manifest.consumerBundle
  ) {
    throw new Error(
      `[createHost] the manifest at ${edgeManifestPath} has no complete ` +
        `baked pair (transport "${manifest.transport}", renderBundle ` +
        `${JSON.stringify(manifest.renderBundle)}, consumerBundle ` +
        `${JSON.stringify(manifest.consumerBundle)}) — this host renders ` +
        `through the pair, which requires transport:"webpack".`
    );
  }
  for (const rel of [manifest.renderBundle, manifest.consumerBundle]) {
    if (!existsSync(join(buildDir, "server-edge", rel))) {
      throw new Error(
        `[createHost] the manifest names ${rel} but it does not exist in ` +
          `${join(buildDir, "server-edge")} — rebuild.`
      );
    }
  }

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
      pathToFileURL(join(edgeDir, manifest.renderBundle!)).href
    )) as {
      handleRouteAction: (request: Request) => Promise<Response>;
    };
    const consumer = (await import(
      pathToFileURL(join(edgeDir, manifest.consumerBundle!)).href
    )) as { renderFlightToHtml: unknown };
    const { createEdgeRequestHandler } = await import("../edge/index.js");
    const { HOST_OUTCOME_HEADER } = await import(
      "./createHostFromManifest.js"
    );
    return {
      // A handler per REQUEST: React reports component failures through
      // onError while the boundary degrades and the buffered document still
      // answers 200 (the silent-bad-response the SSG freeze guards
      // against). Per-request construction gives each render its own error
      // list, so attribution can never cross concurrent requests.
      render: async (request: Request) => {
        const renderErrors: unknown[] = [];
        const render = createEdgeRequestHandler(bundle as never, {
          renderFlightToHtml: consumer.renderFlightToHtml as never,
          onError: (error: unknown) => renderErrors.push(error),
          // A loader notFound() must reach the manifest 404 document, not
          // the inner handler's bare-text default — mark it for the core.
          onNotFound: () =>
            new Response(null, {
              status: 404,
              headers: { [HOST_OUTCOME_HEADER]: "not-found" },
            }),
        });
        const response = await render(request);
        if (renderErrors.length > 0) {
          throw renderErrors[0];
        }
        return response;
      },
      action: (request: Request) => bundle.handleRouteAction(request),
      // (Node hosts have an empty platform; the executor appends the ctx
      // uniformly, so action code behaves identically across hosts.)
    };
  };

  return createHostFromManifest({
    manifest,
    serveStatic,
    loadRender: async () => {
      const inner = await loadRender();
      return {
        render: (request: Request) => inner.render(request),
        action: (request: Request) => inner.action(request),
      };
    },
    ...(onError ? { onError } : {}),
    ...(renderDeadlineMs !== undefined ? { renderDeadlineMs } : {}),
  });
}
