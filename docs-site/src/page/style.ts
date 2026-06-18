/**
 * The docs site's stylesheet, inlined into the document <head> by the Html
 * wrapper (html.tsx). It lives in the full (HTML-generating) stream's <head>,
 * not in the Page, so it's emitted once into the prerendered <head> and never
 * re-hoisted on the client — and it stays put across client navigations (which
 * only swap #root).
 */
export const STYLE = `
:root { --fg: #1a1a1a; --muted: #6b7280; --accent: #646cff; --border: #e5e7eb; --code-bg: #f6f8fa; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--fg); font: 16px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
.layout { display: flex; min-height: 100vh; }
nav.sidebar { width: 240px; flex-shrink: 0; border-right: 1px solid var(--border); padding: 1.5rem 1rem; position: sticky; top: 0; align-self: flex-start; max-height: 100vh; overflow-y: auto; }
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
  /* On mobile the sidebar is an in-flow top bar (not sticky) so the expanded
     hamburger menu pushes content down instead of overlaying it. */
  nav.sidebar { width: auto; border-right: none; border-bottom: 1px solid var(--border); padding: 0.75rem 1rem; position: static; align-self: auto; max-height: none; overflow-y: visible; }
  nav.sidebar .brand { display: inline-block; margin: 0; }
  .nav-toggle-label { display: inline-block; float: right; cursor: pointer; user-select: none; padding: 0.2rem 0.7rem; border: 1px solid var(--border); border-radius: 6px; font-size: 0.9rem; }
  .navlinks { display: none; clear: both; padding-top: 0.75rem; }
  .nav-toggle:checked ~ .navlinks { display: block; }
}
`;
