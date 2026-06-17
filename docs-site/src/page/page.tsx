import React from "react";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { createHighlighter, type Highlighter } from "shiki";

/**
 * The whole docs site is this one SERVER component. It runs at build time
 * only: reads the markdown from the repo's docs/, renders it with marked,
 * and ships pure HTML — the parser never reaches the browser. Code blocks are
 * highlighted with Shiki here, at build time, so the rendered HTML carries the
 * colors and the browser still downloads zero highlighting JS.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

// Shiki theme + the languages our docs actually use. github-light matches the
// site's light palette.
const SHIKI_THEME = "github-light";
const SHIKI_LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "bash",
  "shellscript",
  "css",
  "html",
  "markdown",
  "diff",
];

// One highlighter for the whole build. The top-level await loads the grammars
// and theme once, up front, which lets `Page` stay a synchronous server
// component: `highlighter.codeToHtml()` is a sync call after this resolves.
const highlighter: Highlighter = await createHighlighter({
  themes: [SHIKI_THEME],
  langs: SHIKI_LANGS,
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Route fenced code blocks through Shiki; unknown/unlabeled languages fall back
// to a plain escaped block rather than throwing the whole build.
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const id = (lang ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      if (id) {
        try {
          return highlighter.codeToHtml(text, { lang: id, theme: SHIKI_THEME });
        } catch {
          // unloaded / unknown language — fall through to plain rendering
        }
      }
      return `<pre class="plain"><code>${escapeHtml(text)}</code></pre>`;
    },
  },
});

// This module renders from its BUILT location (docs-site/dist/server/page),
// not its source location — walk up until the repo's docs/ dir appears.
function findDocsDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, "docs");
    if (existsSync(resolve(candidate, "README.md"))) return candidate;
    dir = resolve(dir, "..");
  }
  throw new Error("[docs-site] could not locate the repo docs/ directory");
}

const DOCS_DIR = findDocsDir();
const BASE = process.env.BASE_URL || "/";

interface DocEntry {
  slug: string; // "" for the index; may contain a "/" for subdir docs
  route: string;
  file: string;
  title: string;
  section: string; // "" for top-level, else the subdirectory name
}

function docTitle(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fallback;
}

function listDocs(): DocEntry[] {
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
        title: docTitle(markdown, slug || "vite-plugin-react-server"),
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

function renderDoc(slug: string): string {
  // a slug may be a directory index ("" or "internals") or a doc file
  const candidates =
    slug === ""
      ? ["README.md"]
      : [`${slug}.md`, `${slug}/README.md`];
  const file = candidates.find((c) => existsSync(resolve(DOCS_DIR, c)));
  if (!file) {
    throw new Error(`[docs-site] no markdown source for route "/${slug}"`);
  }
  const markdown = readFileSync(resolve(DOCS_DIR, file), "utf-8");
  const html = marked.parse(markdown, { async: false }) as string;
  // Cross-doc links in the markdown point at relative .md files — rewrite
  // them to site routes (./getting-started.md → <base>getting-started/,
  // ./internals/architecture.md → <base>internals/architecture/, ../x.md
  // from a subdir doc → <base>x/).
  const docDir = slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : "";
  return html.replace(
    /href="(\.{1,2}\/)?([\w./-]+)\.md(#[^"]*)?"/g,
    (_m, rel, target, hash) => {
      // resolve the target slug relative to the current doc's directory
      let ref = target as string;
      if (rel === "../") ref = ref; // ../x.md from a subdir → top-level x
      else if (docDir && (rel === "./" || rel == null)) ref = `${docDir}/${ref}`;
      ref = ref.replace(/^\.\//, "");
      if (ref.endsWith("/README") || ref === "README") {
        ref = ref.replace(/\/?README$/, "");
      }
      const route = ref === "" ? BASE : `${BASE}${ref}/`;
      return `href="${route}${hash ?? ""}"`;
    }
  );
}

const STYLE = `
:root { --fg: #1a1a1a; --muted: #6b7280; --accent: #646cff; --border: #e5e7eb; --code-bg: #f6f8fa; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--fg); font: 16px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
.layout { display: flex; min-height: 100vh; }
nav.sidebar { width: 240px; flex-shrink: 0; border-right: 1px solid var(--border); padding: 1.5rem 1rem; }
nav.sidebar .brand { font-weight: 700; display: block; margin-bottom: 1rem; color: var(--accent); text-decoration: none; }
nav.sidebar a { display: block; padding: 0.3rem 0.5rem; border-radius: 6px; color: var(--fg); text-decoration: none; font-size: 0.92rem; }
nav.sidebar a:hover { background: var(--code-bg); }
nav.sidebar a.active { color: var(--accent); font-weight: 600; }
nav.sidebar .section { display: block; margin: 0.9rem 0 0.2rem; padding: 0 0.5rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
main.doc { flex: 1; min-width: 0; max-width: 52rem; padding: 2rem 2.5rem 4rem; }
main.doc h1, main.doc h2, main.doc h3 { line-height: 1.3; }
main.doc h2 { border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; margin-top: 2.2rem; }
main.doc pre { background: var(--code-bg); padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.88rem; }
/* Shiki sets an inline (white) background per theme; keep the site's subtle code background instead. */
main.doc pre.shiki { background: var(--code-bg) !important; }
main.doc code { background: var(--code-bg); padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; }
main.doc pre code { padding: 0; background: none; }
main.doc table { border-collapse: collapse; width: 100%; }
main.doc th, main.doc td { border: 1px solid var(--border); padding: 0.4rem 0.7rem; text-align: left; }
main.doc blockquote { margin: 0; padding: 0.1rem 1rem; border-left: 4px solid var(--accent); background: var(--code-bg); border-radius: 0 8px 8px 0; }
main.doc a { color: var(--accent); }
footer.docfoot { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.85rem; }
.nav-toggle, .nav-toggle-label { display: none; }
@media (max-width: 760px) {
  .layout { flex-direction: column; }
  nav.sidebar { width: auto; border-right: none; border-bottom: 1px solid var(--border); padding: 0.75rem 1rem; }
  nav.sidebar .brand { display: inline-block; margin: 0; }
  .nav-toggle-label { display: inline-block; float: right; cursor: pointer; user-select: none; padding: 0.2rem 0.7rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.9rem; }
  .navlinks { display: none; clear: both; padding-top: 0.75rem; }
  .nav-toggle:checked ~ .navlinks { display: block; }
}
`;

export function Page({ url = "/" }: { url?: string }) {
  // url arrives as the route ("/", "/getting-started") — normalize to a slug
  const slug = url.replace(/^\//, "").replace(/\/$/, "");
  const docs = listDocs();
  const html = renderDoc(slug);
  const current = docs.find((d) => d.slug === slug);
  const title = current
    ? `${current.title} — vite-plugin-react-server`
    : "vite-plugin-react-server";

  return (
    <div className="layout">
      {/* React 19 hoists document metadata into <head> — the SSG shell has
          no static head of its own, so charset/title/viewport live here. */}
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <meta
        name="description"
        content="React Server Components for Vite on stable React — no framework, no experimental channel. These docs are statically generated by the plugin itself."
      />
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <nav className="sidebar">
        <a className="brand" href={BASE}>
          vite-plugin-react-server
        </a>
        {/* CSS-only mobile hamburger: the checkbox holds open/closed state,
            no client JS. The expanded list is in-flow (pushes content down,
            overlays nothing). Hidden entirely on desktop. */}
        <input type="checkbox" id="nav-toggle" className="nav-toggle" />
        <label htmlFor="nav-toggle" className="nav-toggle-label">
          ☰ Menu
        </label>
        <div className="navlinks">
        {docs.map((doc, i) => (
          <React.Fragment key={doc.file}>
            {doc.section && docs[i - 1]?.section !== doc.section ? (
              <span className="section">{doc.section}</span>
            ) : null}
            <a
              href={doc.route}
              className={doc.slug === slug ? "active" : undefined}
            >
              {doc.title}
            </a>
          </React.Fragment>
        ))}
        </div>
      </nav>
      <main className="doc">
        <article dangerouslySetInnerHTML={{ __html: html }} />
        <footer className="docfoot">
          Statically generated by vite-plugin-react-server itself — React
          Server Components on stable React, zero client JS for this content.
        </footer>
      </main>
    </div>
  );
}
