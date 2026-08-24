import { build as viteBuild, type Logger } from "vite";
import { join, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

/**
 * The generated portable host entry (host-spec, "The API"):
 * `dist/server-edge/host.js` — statically imports the baked pair, inlines
 * its host manifest, and exports the fetch-shaped handler. A fetch runtime
 * mounts it directly (`export default { fetch: handler }`); its imports are
 * discoverable at bundle time, so no filesystem and no directory inspection
 * exist at runtime. Statics are the platform's job in this form: a known
 * static path that still reaches the handler is answered plainly by the
 * core's missing-artifact rule.
 */
export async function buildHostEntry(opts: {
  userOptions: ResolvedUserOptions;
  projectRoot: string;
  logger: Logger;
}): Promise<void> {
  const { userOptions, projectRoot, logger } = opts;
  const tag = "[build.host]";
  const outRoot = join(projectRoot, userOptions.build.outDir);
  const edgeDir = join(
    outRoot,
    userOptions.build.edge.outDir ?? DEFAULT_CONFIG.BUILD.edge.outDir
  );

  // Only a complete pair with its manifest can host — the esm bake has no
  // consumer half, and without a manifest there is no contract to inline.
  const manifestPath = join(edgeDir, "host-manifest.json");
  const producerPath = join(edgeDir, DEFAULT_CONFIG.EDGE.entryFileName);
  const consumerPath = join(edgeDir, "consumer.js");
  if (
    !existsSync(manifestPath) ||
    !existsSync(producerPath) ||
    !existsSync(consumerPath)
  ) {
    return;
  }
  const manifestJson = readFileSync(manifestPath, "utf8");

  const here = dirname(fileURLToPath(import.meta.url));
  const corePath = join(here, "../host/createHostFromManifest.js");
  const edgeHandlerPath = join(here, "../edge/web.js");

  const entryPath = join(edgeDir, ".vprs-host.js");
  const entrySource = `import * as bundle from "./${DEFAULT_CONFIG.EDGE.entryFileName}";
import * as consumer from "./consumer.js";
import {
  createHostFromManifest,
  HOST_OUTCOME_HEADER,
} from ${JSON.stringify(corePath)};
import { createEdgeRequestHandler } from ${JSON.stringify(edgeHandlerPath)};

const MANIFEST = ${manifestJson.trim()};

/**
 * Per-request render (see the host core's loadRender contract): a handler
 * per request so error attribution never crosses requests; a loader
 * notFound() rides the sentinel header to the manifest 404 document; a
 * degraded 200 (React reported through onError while the boundary degraded)
 * becomes the thrown failure the core maps to the 500 page.
 */
const loadRender = async () => ({
  render: async (request, platform) => {
    const renderErrors = [];
    const render = createEdgeRequestHandler(bundle, {
      renderFlightToHtml: consumer.renderFlightToHtml,
      onError: (error) => renderErrors.push(error),
      onNotFound: () =>
        new Response(null, {
          status: 404,
          headers: { [HOST_OUTCOME_HEADER]: "not-found" },
        }),
    });
    const response = await render(request, ...platform);
    if (renderErrors.length > 0) throw renderErrors[0];
    return response;
  },
  action: (request) => bundle.handleRouteAction(request),
});

const handler = createHostFromManifest({
  manifest: MANIFEST,
  // Platform statics: the CDN/platform serves the emitted files; a known
  // artifact that still reaches the handler is answered plainly by the
  // core's missing-artifact rule, never by a render.
  serveStatic: async () => null,
  loadRender,
});

export default handler;
`;

  try {
    writeFileSync(entryPath, entrySource);
    await viteBuild({
      root: edgeDir,
      logLevel: "warn",
      configFile: false,
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      ssr: { target: "webworker", noExternal: true },
      build: {
        ssr: true,
        outDir: edgeDir,
        emptyOutDir: false,
        minify: userOptions.build.edge.minify,
        rollupOptions: {
          input: { host: entryPath },
          // The pair stays external: host.js sits NEXT TO render.js and
          // consumer.js and imports them relatively — re-bundling them here
          // would duplicate React per artifact.
          external: (id: string) =>
            id === `./${DEFAULT_CONFIG.EDGE.entryFileName}` ||
            id === "./consumer.js" ||
            id.endsWith(`/${DEFAULT_CONFIG.EDGE.entryFileName}`) ||
            id.endsWith("/consumer.js"),
          output: {
            preserveModules: false,
            format: "es",
            paths: (id: string) =>
              id.endsWith(`/${DEFAULT_CONFIG.EDGE.entryFileName}`)
                ? `./${DEFAULT_CONFIG.EDGE.entryFileName}`
                : id.endsWith("/consumer.js")
                ? "./consumer.js"
                : id,
          },
        },
      },
    });
    logger.info(`${tag} portable host entry → ${join(edgeDir, "host.js")}`);
  } catch (error) {
    // Additive today; the edge runner's fatal tie-in (the entry is part of
    // that paradigm's artifact set) lands with the runner branch.
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`${tag} skipped — host entry build failed: ${message}`);
  } finally {
    rmSync(entryPath, { force: true });
  }
}
