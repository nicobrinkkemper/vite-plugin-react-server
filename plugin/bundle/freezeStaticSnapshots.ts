import { existsSync } from "node:fs";
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

  // This pass renders THROUGH the baked pair, so a bake that failed or was
  // partially skipped upstream (warn-and-continue, additive contract) must
  // fail here naming that cause, not as the ERR_MODULE_NOT_FOUND a blind
  // import would produce. BOTH halves are required: buildConsumerBundle has
  // warn-and-return skip paths that leave a producer without a consumer.
  const producerPath = join(edgeDir, DEFAULT_CONFIG.EDGE.entryFileName);
  const consumerPath = join(edgeDir, "consumer.js");
  const missing = [producerPath, consumerPath].filter((p) => !existsSync(p));
  if (missing.length > 0) {
    throw new Error(
      `[transport:webpack] SSG renders through the baked edge pair, but ` +
        `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} ` +
        `missing — the edge bake failed or was partially skipped (see the ` +
        `earlier [build.edge] warning for the cause; a skipped consumer bake ` +
        `leaves per-request serving intact but the SSG freeze cannot run). ` +
        `Fix the bake, or set build.pages to [] to skip SSG.`
    );
  }

  const { createEdgeRequestHandler } = await import("../edge/index.js");
  const bundle = await import(pathToFileURL(producerPath).href);
  const consumer = await import(pathToFileURL(consumerPath).href);
  // Collect render-time errors per route. The freeze only checks the response
  // STATUS, but the status commits on the first chunk — a component that
  // throws mid-stream (e.g. a router hook rendered in the HTML shell outside
  // its provider) degrades that subtree while the stream completes fine, and
  // the freeze would write a shell-only document with exit 0: a silent bad
  // deploy. React reports those through onError; route it through handleError
  // so the default production threshold ("all_errors") fails the build naming
  // the route and the component error, while a relaxed panicThreshold keeps
  // the degrade-and-continue behavior — loudly.
  const renderErrors: unknown[] = [];
  // The freeze renders documents through the consumer's PRERENDER export:
  // react-dom/static waits out every Suspense boundary and the artifact
  // carries final markup at position (the static artifact contract), while
  // per-request serving keeps the streaming renderFlightToHtml. A pair baked
  // by this build always carries the export; fail loud on a foreign pair
  // rather than silently freezing the streamed shape.
  if (typeof consumer.prerenderFlightToHtml !== "function") {
    throw new Error(
      `[transport:webpack] ${consumerPath} exports no prerenderFlightToHtml — ` +
        `the consumer bundle predates the prerender freeze; rebuild the pair.`
    );
  }
  const handler = createEdgeRequestHandler(bundle, {
    renderFlightToHtml: consumer.prerenderFlightToHtml,
    onError: (error: unknown) => {
      renderErrors.push(error);
    },
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
    const errorsBefore = renderErrors.length;
    const htmlRes = await handler(new Request(new URL(route, ORIGIN)));
    if (htmlRes.status !== 200 || !htmlRes.body) {
      throw new Error(
        `[transport:webpack] freezing ${route} html failed (${htmlRes.status})`
      );
    }
    // The document render is fully buffered before the Response returns (the
    // handler awaits the HTML text), so every onError for this route has fired
    // by now — check BEFORE writing so a degraded document is never emitted.
    if (renderErrors.length > errorsBefore) {
      const panicError = handleError({
        error: renderErrors[errorsBefore],
        logger,
        panicThreshold: userOptions.panicThreshold,
        log: true,
        context: `[transport:webpack] freezing ${route}: the HTML shell render errored — the document would be missing that subtree`,
      });
      if (panicError != null) {
        throw panicError;
      }
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
