/**
 * maybeInlineFlight.ts
 *
 * Shared post-SSG step invoked by BOTH static plugins (server-static and
 * client-static) at the same point — right after the pages are written and
 * before the `build.ssg.end` event. If `build.inlineFlight` is enabled it
 * inlines each route's flight payload into its `index.html`.
 *
 * The whole reason this lives in the plugin (rather than a consumer's own
 * `closeBundle`) is determinism across build modes: a consumer `closeBundle`
 * sees finalized HTML in server-first builds but runs BEFORE the deferred write
 * in client-first builds, so hand-rolled inlining silently worked in one mode
 * and not the other. Running it here, from the same code path both plugins
 * reach post-write, makes flash-free first render identical whether the build
 * is client-first or server-first — honoring the "both modes work by design"
 * contract. `inlineFlightPayload` is idempotent (htmlHasInlineFlight guard).
 */
import { resolve } from "node:path";
import type { Logger } from "vite";
import type { InlineFlightMetrics } from "../metrics/types.js";
import { inlineFlightPayload } from "./inlineFlightPayload.js";

export interface MaybeInlineFlightOptions {
  build: {
    inlineFlight?: boolean | "blob" | "stream";
    outDir?: string;
    static?: string;
    htmlOutputPath?: string;
    rscOutputPath?: string;
  };
  projectRoot?: string;
  onMetrics?: (metrics: InlineFlightMetrics) => void;
  logger?: Logger;
  verbose?: boolean;
}

/**
 * Returns the number of pages inlined, or null when the option is disabled
 * (or has no static form).
 */
export async function maybeInlineFlight(
  options: MaybeInlineFlightOptions
): Promise<number | null> {
  if (!options.build?.inlineFlight) return null;
  if (options.build.inlineFlight === "stream") {
    // Streamed delivery is per-request only: a prerendered file has no
    // "as it renders" — say so once and leave the pages un-inlined (the
    // client falls back to fetching index.rsc for prerendered routes).
    options.logger?.warn(
      `[vite-plugin-react-server] inlineFlight: "stream" has no static form — ` +
        `prerendered pages are not inlined (the client fetches index.rsc). ` +
        `Use "blob" for static/CDN targets.`
    );
    return null;
  }

  // Anchor a relative outDir to the project root, not the process CWD — same
  // rule as fileWriter, or the two would read/write different trees when the
  // build is launched outside the project root.
  const staticDir = resolve(
    options.projectRoot ?? ".",
    options.build.outDir ?? "dist",
    options.build.static ?? "static"
  );

  const inlineStart = performance.now();
  const count = await inlineFlightPayload({
    staticDir,
    htmlFileName: options.build.htmlOutputPath,
    rscFileName: options.build.rscOutputPath,
    logger: options.logger,
    verbose: options.verbose,
  });

  // The metric replaces the raw log line for onMetrics consumers (their
  // watcher renders it, with timing); without onMetrics the line stays.
  if (options.onMetrics) {
    options.onMetrics({
      route: "*",
      type: "inline-flight",
      pages: count,
      inlineTime: performance.now() - inlineStart,
      description: "post-write inline-flight pass",
    });
  } else {
    options.logger?.info(`[vprs] inlined flight payload into ${count} page(s)`);
  }
  return count;
}
