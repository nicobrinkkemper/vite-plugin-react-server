import React from "react";
import Markdown from "markdown-to-jsx";
import { createHighlighter, type Highlighter } from "shiki";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { BASE, listDocs, loadMarkdown } from "./docs.js";

/**
 * The docs site's render layer: one SERVER component, run at build time only.
 * It reads markdown for the route (see docs.ts) and renders it to React
 * ELEMENTS with markdown-to-jsx — no dangerouslySetInnerHTML, so the prerendered
 * HTML hydrates cleanly. Code blocks are highlighted with Shiki, also as
 * elements, so the colors are baked in at build time and the browser ships zero
 * highlighting JS. Document metadata (head/title/style) lives in the Html
 * wrapper (html.tsx), not here — the Page is the tree the client hydrates, and
 * head content here would be re-hoisted on the client and duplicate the <head>.
 */

// Shiki themes (dual: light + dark) + the languages our docs actually use.
// github-light/github-dark match the site's light and dark palettes; the active
// one follows prefers-color-scheme via CSS variables (see style.ts).
const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const;
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

// One highlighter for the whole build. The top-level await loads grammars and
// theme once, so codeToHast() is a sync call afterwards and Page stays sync.
const highlighter: Highlighter = await createHighlighter({
  themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
  langs: SHIKI_LANGS,
});

/** Flatten a React text subtree (markdown-to-jsx passes code as string children). */
function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) {
    return textOf(
      (node as React.ReactElement<{ children?: React.ReactNode }>).props.children
    );
  }
  return "";
}

/**
 * markdown-to-jsx renders a fenced block as <pre><code class="lang-x">…</code></pre>.
 * Override <pre> to highlight with Shiki, returning Shiki's own element tree
 * (its <pre class="shiki">…), so highlighting is server-side AND hydration-safe.
 * Unknown/unlabeled languages fall back to a plain block.
 */
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const codeEl = children as
    | React.ReactElement<{ className?: string; children?: React.ReactNode }>
    | undefined;
  const className = codeEl?.props?.className ?? "";
  const lang = className.replace(/^(lang|language)-/, "").trim();
  const code = textOf(codeEl?.props?.children).replace(/\n$/, "");
  if (lang) {
    try {
      // defaultColor:false emits both themes' colors as --shiki-light/--shiki-dark
      // CSS vars per token; style.ts selects per prefers-color-scheme.
      const hast = highlighter.codeToHast(code, {
        lang,
        themes: SHIKI_THEMES,
        defaultColor: false,
      });
      return toJsxRuntime(hast, { Fragment, jsx, jsxs }) as React.ReactElement;
    } catch {
      // unloaded/unknown language — fall through to a plain block
    }
  }
  return (
    <pre className="plain">
      <code>{code}</code>
    </pre>
  );
}

/**
 * Rewrite a cross-doc relative .md link to its site route
 * (./getting-started.md → <base>getting-started/, ../x.md from a subdir →
 * <base>x/). `docDir` is the current doc's directory. Non-.md hrefs pass through.
 */
function rewriteHref(href: string, docDir: string): string {
  const m = href.match(/^(\.{1,2}\/)?([\w./-]+)\.md(#.*)?$/);
  if (!m) return href;
  const [, rel, target, hash] = m;
  let ref = target;
  if (rel !== "../" && docDir && (rel === "./" || rel == null)) {
    ref = `${docDir}/${ref}`;
  }
  ref = ref.replace(/^\.\//, "");
  if (ref.endsWith("/README") || ref === "README") {
    ref = ref.replace(/\/?README$/, "");
  }
  const route = ref === "" ? BASE : `${BASE}${ref}/`;
  return `${route}${hash ?? ""}`;
}

/** markdown-to-jsx options for a doc living in directory `docDir`. */
function mdOptions(docDir: string) {
  return {
    overrides: {
      a: {
        component: ({
          href,
          ...rest
        }: { href?: string } & Record<string, unknown>) => (
          <a {...rest} href={href ? rewriteHref(href, docDir) : href} />
        ),
      },
      pre: { component: CodeBlock },
    },
  };
}

export function Page({ url = "/" }: { url?: string }) {
  // url arrives as the route ("/", "/getting-started") — normalize to a slug
  const slug = url.replace(/^\//, "").replace(/\/$/, "");
  const docs = listDocs();
  const { markdown, docDir } = loadMarkdown(slug);

  return (
    <div className="layout">
      {/* Document metadata (head/title/style) is rendered by the Html wrapper
          (html.tsx), not here — see this file's header. */}
      <nav className="sidebar">
        {/* Color-theme toggle (system → light → dark). Server-renders a default
            icon; client.tsx syncs it to the saved choice and cycles on click. */}
        <button
          type="button"
          className="theme-toggle"
          aria-label="Toggle color theme"
          title="Toggle color theme"
        >
          🖥️
        </button>
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
        <article>
          <Markdown options={mdOptions(docDir)}>{markdown}</Markdown>
        </article>
        <footer className="docfoot">
          Statically generated by vite-plugin-react-server itself — React
          Server Components on stable React, zero client JS for this content.
        </footer>
      </main>
    </div>
  );
}
