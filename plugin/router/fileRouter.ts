import { matchRoutes } from "./matchRoute.js";
import { type RouteEntry, scanRoutes } from "./scanRoutes.js";

// `fileRouter` turns a `src/routes/**` tree into the `Page` / `props` /
// `build.pages` config vprs already consumes — so file-based routing is the
// matcher + scanner feeding the EXISTING resolution pipeline (resolveBuildPages
// → urlMap), with no core changes. It replaces the hand-rolled
// `createRouter(file) => (url) => switch {…}` that mmc/bidoof write by hand:
//
//   vitePluginReactServer({ moduleBase: "src", ...fileRouter("src/routes") })
//
// Pass a project-root-relative `routesDir` so the emitted file paths are
// root-relative too (matching how you'd hand-write `Page`/`props`).
export type FileRouterConfig = {
  Page: (url: string) => string;
  props: (url: string) => string | undefined;
  build: { pages: string[] };
  /** The discovered table, exposed for getStaticPaths aggregation / tooling. */
  routes: RouteEntry[];
  /**
   * Params for a concrete url, from the matched pattern (`/profile/123` →
   * `{ id: "123" }`). This is what the loader plumbing threads into
   * `props(url, { params, request })`; returns `{}` when nothing matches.
   */
  getParams: (url: string) => Record<string, string>;
};

export function fileRouter(routesDir: string): FileRouterConfig {
  const routes = scanRoutes(routesDir);
  const patterns = routes.map((r) => r.pattern);
  const byPattern = new Map(routes.map((r) => [r.pattern, r] as const));

  const matched = (url: string): RouteEntry => {
    const m = matchRoutes(patterns, url);
    if (!m) throw new Error(`fileRouter: no route matches "${url}"`);
    return byPattern.get(m.pattern)!;
  };

  return {
    Page: (url) => matched(url).page,
    props: (url) => matched(url).props,
    // Only fully-static routes are prerendered by default; dynamic (`$`) routes
    // are matched per-request (and enumerated via getStaticPaths when wanted).
    build: { pages: routes.filter((r) => !r.dynamic).map((r) => r.pattern) },
    routes,
    getParams: (url) => matchRoutes(patterns, url)?.params ?? {},
  };
}
