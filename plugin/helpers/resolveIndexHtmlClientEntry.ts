import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read the project's `index.html` and return the value of its first
 * `<script type="module" src="…">` (with leading `/` stripped), or `null`
 * if there's no `index.html`, no module script, or the file can't be read.
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
