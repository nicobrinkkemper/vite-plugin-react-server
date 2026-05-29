import type { ResolvedUserOptions } from "../../types.js";
import { glob, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sourceHasTopLevelClientDirective } from "../../loader/directives/sourceHasTopLevelClientDirective.js";

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
