import { dirname, posix } from "node:path";

/** The subset of a Vite manifest entry this reads. */
type ManifestEntry = { file?: string; imports?: string[] } | undefined;

/**
 * The manifest keys an html input claims: the html itself, whatever its
 * manifest record imports, and every module its own `<script src>` names.
 *
 * The two bundlers record an html input differently. Rolldown (Vite 8) gives
 * the html a manifest key whose `imports` list the entry scripts; Rollup
 * (Vite 6/7) lists no html key at all, only the script module, with nothing
 * marking it as the browser entry. The html source is the one fact both agree
 * on, so it is read as well, through `readSource` (which returns undefined
 * for an html that does not exist in the project). Script paths resolve the
 * way Vite keys them: `/src/client.tsx` → `src/client.tsx`, a relative path
 * against the html's own directory.
 *
 * `htmlInputs` are the html files the build may have used as inputs without
 * a manifest key — the `index.html` fallback a client environment with no
 * explicit inputs builds.
 */
export function htmlClaimedKeys(
  manifest: Record<string, ManifestEntry>,
  readSource: (key: string) => string | undefined,
  htmlInputs: readonly string[] = ["index.html"]
): Set<string> {
  const htmlKeys = new Set<string>(htmlInputs);
  for (const key of Object.keys(manifest)) {
    if (key.endsWith(".html")) htmlKeys.add(key);
  }
  const claimed = new Set<string>();
  for (const key of htmlKeys) {
    const entry = manifest[key];
    const source = readSource(key);
    if (!entry && source === undefined) continue;
    claimed.add(key);
    for (const imported of entry?.imports ?? []) claimed.add(imported);
    for (const src of scriptSources(source ?? "")) {
      claimed.add(
        src.startsWith("/")
          ? src.slice(1)
          : posix.normalize(posix.join(dirname(key), src))
      );
    }
  }
  return claimed;
}

const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
// `scheme:` and `//host` sources are not project modules.
const EXTERNAL_SRC = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

function scriptSources(html: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(SCRIPT_SRC)) {
    const src = match[1]!;
    if (EXTERNAL_SRC.test(src)) continue;
    out.push(src);
  }
  return out;
}
