import type { ResolvedUserOptions } from "../../types.js";
import { glob, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sourceHasTopLevelClientDirective } from "../../loader/directives/sourceHasTopLevelClientDirective.js";

const MODULE_SCRIPT_SRC =
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']|<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["']/gi;

function indexHtmlScriptSources(projectRoot: string): Set<string> {
  const path = join(projectRoot, "index.html");
  if (!existsSync(path)) return new Set();
  try {
    const html = readFileSync(path, "utf-8");
    const srcs = new Set<string>();
    for (const m of html.matchAll(MODULE_SCRIPT_SRC)) {
      const src = (m[1] ?? m[2]).replace(/^\/+/, "");
      if (src) srcs.add(resolve(projectRoot, src));
    }
    return srcs;
  } catch {
    return new Set();
  }
}

/**
 * Auto-discovers first-party client modules detected by a top-of-file
 * `"use client"` DIRECTIVE rather than the `.client.` filename convention.
 *
 * Why this exists: `createGlobAutoDiscover("**\/*.client.*")` only finds
 * filename-convention client modules. A directive-only client module
 * (e.g. `src/components/Counter.tsx` starting with `"use client"`) was never
 * added as a client/SSR build input, so it was NOT emitted to `dist/client`.
 * The server build's `registerClientReference` then pointed its hosted
 * moduleID at a file that didn't exist, and the html-worker's import 404'd at
 * SSG-render time.
 *
 * Adding these modules as build inputs makes Vite emit them to `dist/client`
 * at preserved-module paths that line up with the hashed/hosted moduleIDs
 * generated in `createTransformerPlugin`.
 *
 * Detection is structural (`sourceHasTopLevelClientDirective`), never the
 * naive "contains the word client" substring test.
 */
export function createDirectiveClientAutoDiscover(
  modulePattern = "**/*.{tsx,jsx,mts,cts,ts,js,mjs,cjs}"
) {
  return async function _directiveClientAutoDiscover({
    inputs,
    userOptions,
  }: {
    inputs: Record<string, string>;
    userOptions: Pick<
      ResolvedUserOptions,
      "moduleBase" | "projectRoot" | "normalizer"
    >;
  }) {
    const baseDir = resolve(userOptions.projectRoot, userOptions.moduleBase);
    const absolutePattern = resolve(baseDir, modulePattern);
    // Files Vite already discovers via index.html's <script type="module">
    // entries — adding them again here makes Vite drop the index.html
    // manifest entry, which downstream CSS-injection depends on.
    const indexHtmlEntries = indexHtmlScriptSources(userOptions.projectRoot);

    let allFiles: AsyncIterable<string>;
    try {
      allFiles = glob(absolutePattern);
    } catch {
      return inputs;
    }

    for await (const file of allFiles) {
      // Skip files already covered by the `.client.` filename convention —
      // `createGlobAutoDiscover` discovers those separately.
      if (/\.client\.[cm]?[jt]sx?$/.test(file)) continue;
      // Never treat dependencies as first-party client inputs.
      if (file.includes("node_modules")) continue;
      // Skip files index.html already references; Vite will discover them.
      if (indexHtmlEntries.has(file)) continue;

      let source: string;
      try {
        source = await readFile(file, "utf-8");
      } catch {
        continue;
      }

      if (!sourceHasTopLevelClientDirective(source)) continue;

      const relativePath = file
        .replace(baseDir, "")
        .replace(/^\/+/, "");
      const [key, value] = userOptions.normalizer(
        join(userOptions.moduleBase, relativePath)
      );
      if (!inputs[key]) {
        inputs[key] = value;
      }
    }

    return inputs;
  };
}
