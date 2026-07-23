import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Logger } from "vite";
import type { ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

/**
 * transport: "webpack" — re-render every enumerated route's prerendered
 * snapshots (index.html + index.rsc) THROUGH THE BAKED PAIR, so the static
 * surface carries the same flight flavor the per-request path serves. This is
 * what makes one deploy free to serve any route from the CDN or the function:
 * one transport, no cross-flavor decode failures.
 *
 * Runs after the edge bake: imports the emitted producer/consumer from
 * dist/<edge.outDir> exactly like a consumer's server entry would, requests
 * each route via createEdgeRequestHandler, and overwrites the esm-flavored
 * SSG snapshots in place. Composition over new machinery — the render path is
 * byte-identical to what a deployed handler serves.
 */
export async function freezeStaticSnapshots(opts: {
  userOptions: ResolvedUserOptions;
  projectRoot: string;
  routes: readonly string[];
  logger: Logger;
}): Promise<void> {
  const { userOptions, projectRoot, routes, logger } = opts;
  const bakeStart = performance.now();
  const outRoot = join(projectRoot, userOptions.build.outDir);
  const edgeDir = join(
    outRoot,
    userOptions.build.edge.outDir ?? DEFAULT_CONFIG.BUILD.edge.outDir
  );
  const staticDir = join(outRoot, userOptions.build.static);
  const htmlName =
    userOptions.build.htmlOutputPath ?? DEFAULT_CONFIG.BUILD.htmlOutputPath;
  const rscName =
    userOptions.build.rscOutputPath ?? DEFAULT_CONFIG.BUILD.rscOutputPath;

  const { createEdgeRequestHandler } = await import("../edge/index.js");
  const bundle = await import(
    pathToFileURL(join(edgeDir, DEFAULT_CONFIG.EDGE.entryFileName)).href
  );
  const consumer = await import(
    pathToFileURL(join(edgeDir, "consumer.js")).href
  );
  const handler = createEdgeRequestHandler(bundle, {
    renderFlightToHtml: consumer.renderFlightToHtml,
  });

  const ORIGIN = "https://prerender.local";
  for (const route of routes) {
    const dir = join(staticDir, route === "/" ? "" : route.replace(/^\//, ""));
    await mkdir(dir, { recursive: true });
    const htmlRes = await handler(new Request(new URL(route, ORIGIN)));
    if (htmlRes.status !== 200) {
      throw new Error(
        `[transport:webpack] freezing ${route} html failed (${htmlRes.status})`
      );
    }
    await writeFile(join(dir, htmlName), await htmlRes.text());
    const rscUrl = new URL(
      (route === "/" ? "" : route) + "/" + rscName,
      ORIGIN
    );
    const rscRes = await handler(new Request(rscUrl));
    if (rscRes.status !== 200) {
      throw new Error(
        `[transport:webpack] freezing ${route} rsc failed (${rscRes.status})`
      );
    }
    await writeFile(join(dir, rscName), await rscRes.text());
  }
  if (userOptions.onMetrics) {
    userOptions.onMetrics({
      route: "*",
      type: "edge-bake",
      kind: "producer",
      outputPath: staticDir,
      moduleCount: routes.length,
      bakeTime: performance.now() - bakeStart,
      description: `froze ${routes.length} route snapshot(s) through the baked pair`,
    });
  } else {
    logger.info(
      `[transport:webpack] froze ${routes.length} route snapshot(s) through the baked pair → ${staticDir}`
    );
  }
}
