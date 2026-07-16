/**
 * pruneUnclaimedEntryHtml.ts
 *
 * Shared post-SSG step invoked by BOTH static plugins (server-static and
 * client-static) at the same point, alongside `maybeInlineFlight`.
 *
 * `index.html` is a Vite build INPUT (it is what keys the client bootstrap in
 * the manifest), so Vite emits it into the static outDir on every build. When a
 * page claims `/`, SSG overwrites it with the prerendered document and all is
 * well — which is why this is invisible in a normal static build.
 *
 * When `build.pages` does NOT claim `/`, nothing overwrites it and Vite's bare
 * template survives into the output: an empty `<div id="root">` with no flight.
 * `build.pages` is authoritative about which pages exist, so a file left at a
 * path no page claims is a build intermediate leaking into the served output.
 * On any host that matches the filesystem before applying a rewrite, that shell
 * shadows the per-request route and the render function is never reached.
 *
 * Removing it here — where the page list is known — keeps `build.pages`
 * authoritative and means consumers don't hand-roll a post-build delete pass.
 * Note this deliberately teaches vprs nothing about any deploy target: it is
 * about not publishing our own intermediate, not about anyone's routing rules.
 */
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { Logger } from "vite";
import { routeToOutputDir } from "./fileWriter.js";

export interface PruneUnclaimedEntryHtmlOptions {
  build: {
    outDir?: string;
    static?: string;
    htmlOutputPath?: string;
  };
  /**
   * The routes SSG rendered (the resolved `build.pages`, i.e. `urlMap` keys).
   */
  pages: readonly string[];
  logger?: Logger;
  verbose?: boolean;
}

/**
 * Returns the removed path, or `null` when there was nothing to prune.
 */
export async function pruneUnclaimedEntryHtml(
  options: PruneUnclaimedEntryHtmlOptions
): Promise<string | null> {
  const { build, pages } = options;

  // No SSG at all: `build.pages` isn't claiming anything either way, so the
  // template is the deliverable — a client-only app's SPA shell is the whole
  // point of that build. Only prune when SSG ran and still left `/` unclaimed.
  if (pages.length === 0) return null;

  // Same rule the writer uses, so "claimed" means exactly "SSG wrote here".
  if (pages.some((page) => routeToOutputDir(page) === "")) return null;

  const entryHtml = resolve(
    build.outDir ?? "dist",
    build.static ?? "static",
    build.htmlOutputPath ?? "index.html"
  );

  try {
    await unlink(entryHtml);
  } catch (error) {
    // Already absent is the desired state, not a failure.
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }

  if (options.verbose) {
    options.logger?.info(
      `[vprs] removed ${entryHtml} — no page in build.pages claims "/"`
    );
  }
  return entryHtml;
}
