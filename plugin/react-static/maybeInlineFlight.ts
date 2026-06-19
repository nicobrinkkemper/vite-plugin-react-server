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
import { inlineFlightPayload } from "./inlineFlightPayload.js";

export interface MaybeInlineFlightOptions {
  build: {
    inlineFlight?: boolean;
    outDir?: string;
    static?: string;
    htmlOutputPath?: string;
    rscOutputPath?: string;
  };
  logger?: Logger;
  verbose?: boolean;
}

/**
 * Returns the number of pages inlined, or null when the option is disabled.
 */
export async function maybeInlineFlight(
  options: MaybeInlineFlightOptions
): Promise<number | null> {
  if (!options.build?.inlineFlight) return null;

  const staticDir = resolve(
    options.build.outDir ?? "dist",
    options.build.static ?? "static"
  );

  const count = await inlineFlightPayload({
    staticDir,
    htmlFileName: options.build.htmlOutputPath,
    rscFileName: options.build.rscOutputPath,
    logger: options.logger,
    verbose: options.verbose,
  });

  options.logger?.info(`[vprs] inlined flight payload into ${count} page(s)`);
  return count;
}
