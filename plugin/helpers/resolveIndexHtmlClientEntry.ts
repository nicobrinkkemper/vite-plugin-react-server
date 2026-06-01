import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The static build emits a Vite manifest entry keyed `"index.html"` when the
 * project's `index.html` is treated as a build input — its `css` array then
 * transitively includes every CSS file the entry's `<script type="module">`
 * imports, which is how vprs's `<Css cssFiles={globalCss} />` historically
 * picked up the project's global styles (e.g. `import "./globalStyles.css"`
 * from `src/client.tsx`).
 *
 * That behaviour breaks the moment Vite stops emitting the `"index.html"`
 * manifest entry — which happens, in practice, whenever another input
 * already references the same module the index's script tag does (for
 * example after PR #55's `createDirectiveClientAutoDiscover` started adding
 * directive-detected client modules as explicit inputs). The fallback in
 * `processCssFilesForPages` then collects an empty `indexHtmlCssInputs`,
 * `globalCss` ends up empty, and the rendered HTML loses every stylesheet
 * the client entry was importing — silently, with no error.
 *
 * Recover by reading the project's `index.html` and pulling out the
 * `<script type="module" src="…">` value directly. The resulting path
 * (e.g. `src/client.tsx`) is the same key the manifest already lists,
 * carrying the same transitive CSS — so passing it to `collectManifestCss`
 * reconstructs the `globalCss` set the old `"index.html"` manifest entry
 * used to provide.
 *
 * Returns `null` if the project has no `index.html`, the file can't be read,
 * or there's no `<script type="module" src="…">` to extract.
 */
export function resolveIndexHtmlClientEntry(
  projectRoot: string,
): string | null {
  const indexHtmlPath = join(projectRoot, "index.html");
  if (!existsSync(indexHtmlPath)) return null;

  let html: string;
  try {
    html = readFileSync(indexHtmlPath, "utf-8");
  } catch {
    return null;
  }

  // Match the first <script type="module" src="…"> (or src="…" type="module"
  // — attribute order varies in the wild). Captured groups: 1 = src when
  // type came first, 2 = src when src came first.
  const match = html.match(
    /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']|<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["']/i,
  );
  if (!match) return null;

  const raw = match[1] ?? match[2];
  if (!raw) return null;

  // Strip a leading `/` so the result matches the manifest's key shape
  // (manifest keys are project-root-relative, e.g. `src/client.tsx`).
  return raw.replace(/^\/+/, "");
}
