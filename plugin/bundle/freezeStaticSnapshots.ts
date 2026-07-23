import { join } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import type { Logger } from "vite";
import type { ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { fileWriter } from "../react-static/fileWriter.js";
import { pruneUnclaimedEntryHtml } from "../react-static/pruneUnclaimedEntryHtml.js";
import { handleError } from "../error/handleError.js";

/**
 * transport: "webpack" — THE SSG pass for the webpack flavor. Every artifact
 * renders once, in its flavor: the esm SSG pass is skipped entirely (see the
 * react-static plugins), and this step renders every enumerated route's
 * snapshots (index.html + index.rsc) THROUGH THE BAKED PAIR, so the static
 * surface carries the same flight flavor the per-request path serves. One
 * deploy may then serve any route from the CDN or the function: one
 * transport, no cross-flavor decode failures.
 *
 * Because it replaces the SSG pass, it owns the SSG pass's contract:
 * `build.ssg.start`/`build.ssg.end`, per-route `file.write`/`file.write.done`
 * (through the same fileWriter, degraded-document guard included), the
 * `ssg-render` metric summary, and the unclaimed-entry-html prune — onEvent
 * and onMetrics consumers cannot tell the renderer changed. There is no
 * inline-flight pass: pair documents carry their own inline flight.
 *
 * Runs after the edge bake: imports the emitted producer/consumer from
 * dist/<edge.outDir> exactly like a consumer's server entry would, and
 * requests each route via createEdgeRequestHandler. Composition over new
 * machinery — the render path is byte-identical to what a deployed handler
 * serves.
 */
export async function freezeStaticSnapshots(opts: {
  userOptions: ResolvedUserOptions;
  projectRoot: string;
  routes: readonly string[];
  logger: Logger;
}): Promise<void> {
  const { userOptions, projectRoot, routes, logger } = opts;

  // Same rule as the esm pass: no pages means no SSG at all — no events, no
  // metric, nothing to freeze.
  if (routes.length === 0) return;

  const outRoot = join(projectRoot, userOptions.build.outDir);
  const edgeDir = join(
    outRoot,
    userOptions.build.edge.outDir ?? DEFAULT_CONFIG.BUILD.edge.outDir
  );
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

  // The SSG pass's event contract, emitted the same way the react-static
  // plugins emit it (there is no rollup bundle in scope at this build point).
  if (typeof userOptions.onEvent === "function") {
    try {
      const r = userOptions.onEvent({
        type: "build.ssg.start",
        data: {
          pages: [...routes],
          options: null as any,
          bundle: {} as any,
        },
      });
      if (r != null && typeof r === "object" && "then" in r) {
        await (r as Promise<any>);
      }
    } catch (error) {
      const eventPanicError = handleError({
        error,
        logger,
        panicThreshold: userOptions.panicThreshold,
        context: "onEvent(build.ssg.start)",
      });
      if (eventPanicError != null) {
        throw eventPanicError;
      } else {
        throw new Error("Failed to emit build.ssg.start event");
      }
    }
  }

  const renderStart = performance.now();
  const ORIGIN = "https://prerender.local";
  const writerOptions = {
    build: userOptions.build,
    projectRoot: userOptions.projectRoot,
    onEvent: userOptions.onEvent,
    panicThreshold: userOptions.panicThreshold,
    verbose: userOptions.verbose,
    logger,
  };

  for (const route of routes) {
    const htmlRes = await handler(new Request(new URL(route, ORIGIN)));
    if (htmlRes.status !== 200 || !htmlRes.body) {
      throw new Error(
        `[transport:webpack] freezing ${route} html failed (${htmlRes.status})`
      );
    }
    await fileWriter(
      Readable.fromWeb(htmlRes.body as import("node:stream/web").ReadableStream),
      "html",
      { ...writerOptions, route }
    );
    const rscUrl = new URL(
      (route === "/" ? "" : route) + "/" + rscName,
      ORIGIN
    );
    const rscRes = await handler(new Request(rscUrl));
    if (rscRes.status !== 200 || !rscRes.body) {
      throw new Error(
        `[transport:webpack] freezing ${route} rsc failed (${rscRes.status})`
      );
    }
    await fileWriter(
      Readable.fromWeb(rscRes.body as import("node:stream/web").ReadableStream),
      "rsc",
      { ...writerOptions, route }
    );
  }
  const duration = Math.round(performance.now() - renderStart);

  if (userOptions.onMetrics) {
    userOptions.onMetrics({
      route: "*",
      type: "ssg-render",
      pages: routes.length,
      failed: 0,
      renderTime: duration,
      description: "static render pass",
    });
  } else {
    logger.info(`Rendered ${routes.length} pages in ${duration}ms`);
  }

  // Keep build.pages authoritative, same as the esm pass: drop Vite's bare
  // index.html template when no page claims "/".
  await pruneUnclaimedEntryHtml({
    build: userOptions.build,
    projectRoot: userOptions.projectRoot,
    pages: [...routes],
    logger,
    verbose: userOptions.verbose,
  });

  // No inline-flight pass on purpose: the pair's documents already carry
  // their own inline flight.

  if (typeof userOptions.onEvent === "function") {
    try {
      const r = userOptions.onEvent({
        type: "build.ssg.end",
        data: {
          pages: [...routes],
          options: null as any,
          bundle: {} as any,
        },
      });
      if (r != null && typeof r === "object" && "then" in r) {
        await (r as Promise<any>);
      }
    } catch (error) {
      if (error != null) {
        throw error;
      } else {
        throw new Error("Failed to emit build.ssg.end event");
      }
    }
  }
}
