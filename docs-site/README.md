# docs-site

The vprs docs site — statically generated **by vite-plugin-react-server
itself**. React Server Components on stable React, prerendered to plain
HTML; the markdown pipeline (`marked`) runs inside a server component at
build time and ships zero bytes to the browser.

- Content source of truth: the repo's [`docs/*.md`](../docs) (this site just
  reads them — edit the markdown, not this app).
- One route per doc, one level of subdirectories (`internals/`,
  `maintenance/`) included. Cross-doc `.md` links are rewritten to routes.
- Build: `npm run build:docs-site` (repo root). Output: `docs-site/dist/static`.
- Deploy: `.github/workflows/docs-site.yml` publishes to GitHub Pages on
  pushes to main, with `BASE_URL=/<repo>/` threaded through Vite and the
  plugin.

Because the site builds against the repo's HEAD (package self-reference →
`dist/`), it doubles as a living integration test: a change that breaks SSG
breaks this build in the same PR.
