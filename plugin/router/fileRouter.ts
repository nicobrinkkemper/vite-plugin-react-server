import { fillPattern, matchRoutes } from "./matchRoute.js";
import { type RouteEntry, scanRoutes } from "./scanRoutes.js";

// Per-dynamic-route enumeration of concrete paths to prerender. Each entry is a
// full url ("/blog/tech/rsc") or a params object ({category:"tech",slug:"rsc"})
// that fileRouter expands against the pattern. Keyed by route pattern. This is
// vprs's getStaticPaths, kept in config (data-driven) rather than loaded from
// route modules at build time.
export type StaticPathEntry = string | Record<string, string>;
export type StaticPathsMap = Record<
  string,
  () => Iterable<StaticPathEntry> | Promise<Iterable<StaticPathEntry>>
>;

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
  build: { pages: string[] | (() => Promise<string[]>) };
  /** The discovered table, exposed for getStaticPaths aggregation / tooling. */
  routes: RouteEntry[];
  /**
   * The route patterns (`["/", "/profile/$id", "/blog/$category/$slug"]`).
   * Spread into the plugin config so vprs can compute a loader's `params`
   * automatically at request time — no `withParams` pattern to repeat.
   */
  routePatterns: string[];
  /**
   * Params for a concrete url, from the matched pattern (`/profile/123` →
   * `{ id: "123" }`). This is what the loader plumbing threads into
   * `props(url, { params, request })`; returns `{}` when nothing matches.
   */
  getParams: (url: string) => Record<string, string>;
};

export function fileRouter(
  routesDir: string,
  opts: { staticPaths?: StaticPathsMap } = {},
): FileRouterConfig {
  const routes = scanRoutes(routesDir);
  const patterns = routes.map((r) => r.pattern);
  const byPattern = new Map(routes.map((r) => [r.pattern, r] as const));

  const matched = (url: string): RouteEntry => {
    const m = matchRoutes(patterns, url);
    if (!m) throw new Error(`fileRouter: no route matches "${url}"`);
    return byPattern.get(m.pattern)!;
  };

  const staticRoutes = routes.filter((r) => !r.dynamic).map((r) => r.pattern);

  // Without staticPaths, only fully-static routes prerender; dynamic (`$`)
  // routes resolve per-request. With staticPaths, each dynamic route's concrete
  // urls are enumerated into the (async) prerender list too. A dynamic route
  // with no staticPaths entry stays server-only.
  const { staticPaths } = opts;
  const pages: string[] | (() => Promise<string[]>) = staticPaths
    ? async () => {
        const out = [...staticRoutes];
        for (const route of routes) {
          if (!route.dynamic) continue;
          const gen = staticPaths[route.pattern];
          if (!gen) continue;
          for (const entry of await gen()) {
            out.push(
              typeof entry === "string" ? entry : fillPattern(route.pattern, entry),
            );
          }
        }
        return out;
      }
    : staticRoutes;

  return {
    Page: (url) => matched(url).page,
    props: (url) => matched(url).props,
    build: { pages },
    routes,
    routePatterns: patterns,
    getParams: (url) => matchRoutes(patterns, url)?.params ?? {},
  };
}
