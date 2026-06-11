import React from "react";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

/**
 * The whole docs site is this one SERVER component. It runs at build time
 * only: reads the markdown from the repo's docs/, renders it with marked,
 * and ships pure HTML — the parser never reaches the browser.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      const isIndex = prefix === "" && entry.name === "README.md";
      const slug = isIndex
        ? ""
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
  // index first, then top-level alphabetical, then sections
  entries.sort((a, b) => {
    if (a.slug === "") return -1;
    if (b.slug === "") return 1;
    if (a.section !== b.section) return a.section.localeCompare(b.section);
    return a.title.localeCompare(b.title);
  });
  return entries;
}

function renderDoc(slug: string): string {
  const file = slug === "" ? "README.md" : `${slug}.md`;
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
main.doc code { background: var(--code-bg); padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; }
main.doc pre code { padding: 0; background: none; }
main.doc table { border-collapse: collapse; width: 100%; }
main.doc th, main.doc td { border: 1px solid var(--border); padding: 0.4rem 0.7rem; text-align: left; }
main.doc blockquote { margin: 0; padding: 0.1rem 1rem; border-left: 4px solid var(--accent); background: var(--code-bg); border-radius: 0 8px 8px 0; }
main.doc a { color: var(--accent); }
footer.docfoot { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.85rem; }
@media (max-width: 760px) { .layout { flex-direction: column; } nav.sidebar { width: auto; border-right: none; border-bottom: 1px solid var(--border); } }
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
