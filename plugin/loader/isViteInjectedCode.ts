/**
 * Heuristic: does this source carry Vite-injected preamble?
 *
 * Vite prepends code above a module's own source in several situations — most
 * importantly a `__vitePreload` import for files that use dynamic `import()`,
 * and HMR / env wiring in dev. That injected preamble lands *above* a file's
 * `"use client"` / `"use server"` directive, which would otherwise look like
 * "real code before the directive".
 *
 * react-server-loader is deliberately bundler-agnostic: its directive engine
 * only warns about a misplaced directive unless the host says leading code is
 * expected, via the `tolerateLeadingCode` predicate. This is vprs's Vite-aware
 * implementation of that predicate — when these markers are present the leading
 * code is Vite's, not the author's, so the directive-placement warning is
 * suppressed.
 */
export const isViteInjectedCode = (source: string): boolean =>
  source.includes("__vite__createHotContext") ||
  source.includes("import.meta.hot") ||
  source.includes("import.meta.env") ||
  source.includes("/@vite/client") ||
  source.includes("__vitePreload") ||
  source.includes("\0vite/");
