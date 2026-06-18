import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Data layer for the docs site: locate the repo's docs/, list the docs in
 * reading order, load a route's markdown, and resolve a route's <title>.
 *
 * Kept separate from page.tsx (the render layer) so props.ts and the Html
 * wrapper can resolve a route's title without pulling in markdown rendering.
 * Runs at build time only.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

// This module runs from its BUILT location (docs-site/dist/server/page), not
// its source location — walk up until the repo's docs/ dir appears.
function findDocsDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, "docs");
    if (existsSync(resolve(candidate, "README.md"))) return candidate;
    dir = resolve(dir, "..");
  }
  throw new Error("[docs-site] could not locate the repo docs/ directory");
}

export const DOCS_DIR = findDocsDir();
export const BASE = process.env.BASE_URL || "/";

const TITLE_SUFFIX = "vite-plugin-react-server";

export interface DocEntry {
  slug: string; // "" for the index; may contain a "/" for subdir docs
  route: string;
  file: string;
  title: string;
  section: string; // "" for top-level, else the subdirectory name
}

export function docTitle(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fallback;
}

export function listDocs(): DocEntry[] {
  const entries: DocEntry[] = [];
  // one level of subdirectories (internals/, maintenance/) is enough
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(resolve(DOCS_DIR, dir), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory() && prefix === "") {
        walk(entry.name, `${entry.name}/`);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      // README.md is the index of its directory: "" at the top level,
      // "<dir>" for a subdirectory (matches the link-rewriter's collapse).
      const slug =
        entry.name === "README.md"
          ? prefix.replace(/\/$/, "")
          : `${prefix}${entry.name.replace(/\.md$/, "")}`;
      const markdown = readFileSync(
        resolve(DOCS_DIR, prefix, entry.name),
        "utf-8"
      );
      entries.push({
        slug,
        route: slug === "" ? BASE : `${BASE}${slug}/`,
        file: `${prefix}${entry.name}`,
        title: docTitle(markdown, slug || TITLE_SUFFIX),
        section: prefix.replace(/\/$/, ""),
      });
    }
  };
  walk(".", "");
  // Order follows docs/README.md's own link list (the curated reading
  // order); anything README doesn't link to goes after, alphabetical.
  const readme = readFileSync(resolve(DOCS_DIR, "README.md"), "utf-8");
  const readmeOrder = new Map<string, number>();
  for (const match of readme.matchAll(/\]\(\.\/([\w./-]+)\.md(?:#[^)]*)?\)/g)) {
    const slug = match[1];
    if (!readmeOrder.has(slug)) readmeOrder.set(slug, readmeOrder.size);
  }
  const rank = (e: DocEntry) =>
    e.slug === "" ? -1 : readmeOrder.get(e.slug) ?? Number.MAX_SAFE_INTEGER;
  // Sections stay contiguous (one header each): all top-level docs first,
  // then each section as a block, sections ordered by their first README
  // appearance; within a block, README order then title.
  const sectionRank = (section: string): number => {
    let min = Number.MAX_SAFE_INTEGER;
    for (const e of entries) {
      if (e.section === section) min = Math.min(min, rank(e));
    }
    return min;
  };
  entries.sort((a, b) => {
    const aTop = a.section === "" ? 0 : 1;
    const bTop = b.section === "" ? 0 : 1;
    if (aTop !== bTop) return aTop - bTop;
    if (a.section !== b.section) {
      const sa = sectionRank(a.section);
      const sb = sectionRank(b.section);
      if (sa !== sb) return sa - sb;
      return a.section.localeCompare(b.section);
    }
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.title.localeCompare(b.title);
  });
  return entries;
}

export function loadMarkdown(slug: string): {
  markdown: string;
  docDir: string;
} {
  // a slug may be a directory index ("" or "internals") or a doc file
  const candidates =
    slug === "" ? ["README.md"] : [`${slug}.md`, `${slug}/README.md`];
  const file = candidates.find((c) => existsSync(resolve(DOCS_DIR, c)));
  if (!file) {
    throw new Error(`[docs-site] no markdown source for route "/${slug}"`);
  }
  const markdown = readFileSync(resolve(DOCS_DIR, file), "utf-8");
  // The current doc's directory, used to resolve relative cross-doc links.
  const docDir = slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : "";
  return { markdown, docDir };
}

/** Normalize a route ("/", "/getting-started") to a slug ("", "getting-started"). */
export function slugOf(url: string): string {
  return url.replace(/^\//, "").replace(/\/$/, "");
}

/** The document <title> for a route, e.g. "Getting Started — vite-plugin-react-server". */
export function resolveTitle(url: string): string {
  const slug = slugOf(url);
  const doc = listDocs().find((d) => d.slug === slug);
  return doc ? `${doc.title} — ${TITLE_SUFFIX}` : TITLE_SUFFIX;
}
