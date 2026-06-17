/**
 * inlineFlightPayload.ts
 *
 * Post-render step for the static build: for each prerendered `index.html`,
 * inline its sibling `index.rsc` flight payload into the HTML as a
 * non-executable <script>. The browser then has the initial route's RSC payload
 * available synchronously at load — no `index.rsc` round-trip, and the
 * prerequisite for flash-free hydrate-in-place (see createReactFetcher, which
 * reads this on its first call).
 *
 * The payload is base64-encoded so it can be embedded verbatim without worrying
 * about the flight wire format colliding with HTML/script parsing.
 *
 * This runs against the built output (both files already exist), so it never
 * touches the streaming render path.
 */
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "vite";
import { INLINE_FLIGHT_ID } from "../utils/inlineFlightId.js";

export { INLINE_FLIGHT_ID };

export interface InlineFlightPayloadOptions {
  /** The static output directory (e.g. dist/static). */
  staticDir: string;
  /** The emitted RSC filename per route (default "index.rsc"). */
  rscFileName?: string;
  /** The HTML filename per route (default "index.html"). */
  htmlFileName?: string;
  logger?: Logger;
  verbose?: boolean;
}

async function listHtmlDirs(dir: string, htmlFileName: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    let hasHtml = false;
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name === htmlFileName) {
        hasHtml = true;
      }
    }
    if (hasHtml) out.push(d);
  };
  await walk(dir);
  return out;
}

function injectInlineScript(html: string, scriptTag: string): string {
  // Place it at the end of <body> so it's parsed before the deferred client
  // module runs; fall back to appending if there's no recognizable body.
  const idx = html.lastIndexOf("</body>");
  if (idx !== -1) return html.slice(0, idx) + scriptTag + html.slice(idx);
  return html + scriptTag;
}

/**
 * Inline the per-route flight payload into each prerendered HTML file.
 * Returns the number of pages inlined.
 */
export async function inlineFlightPayload(
  options: InlineFlightPayloadOptions
): Promise<number> {
  const {
    staticDir,
    rscFileName = "index.rsc",
    htmlFileName = "index.html",
    logger,
    verbose,
  } = options;

  const dirs = await listHtmlDirs(staticDir, htmlFileName);
  let inlined = 0;

  for (const dir of dirs) {
    const rscPath = join(dir, rscFileName);
    try {
      if (!(await stat(rscPath)).isFile()) continue;
    } catch {
      continue; // no sibling .rsc — nothing to inline (e.g. a non-RSC page)
    }

    const htmlPath = join(dir, htmlFileName);
    const [html, rsc] = await Promise.all([
      readFile(htmlPath, "utf-8"),
      readFile(rscPath),
    ]);

    if (html.includes(`id="${INLINE_FLIGHT_ID}"`)) continue; // already inlined

    const base64 = rsc.toString("base64");
    const scriptTag = `<script type="text/x-component" id="${INLINE_FLIGHT_ID}" data-encoding="base64">${base64}</script>`;
    await writeFile(htmlPath, injectInlineScript(html, scriptTag));
    inlined++;

    if (verbose) {
      logger?.info(
        `[inlineFlightPayload] inlined ${rsc.length}B flight payload into ${htmlPath}`
      );
    }
  }

  return inlined;
}
