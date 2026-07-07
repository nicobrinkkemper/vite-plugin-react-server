import { join, relative, resolve, sep } from "node:path";
import { fillPattern, matchRoutes } from "./matchRoute.js";
import { type RouteEntry, type RouteLayer, scanRoutes } from "./scanRoutes.js";

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
  /**
   * Root→leaf `route.tsx` layout chain for a url's matched route. Threaded like
   * `Page`/`props`: resolveOptions projects it onto the request pipeline so the
   * renderer folds the nested tree. Empty array when the route is unwrapped.
   */
  layouts: (url: string) => RouteLayer[];
};

export function fileRouter(
  routesDir: string,
  opts: { staticPaths?: StaticPathsMap; root?: string } = {},
): FileRouterConfig {
  // `root` decouples "where to scan" from "what path to emit": scan
  // `resolve(root, routesDir)` on disk but emit page/props paths relative to
  // `root` (the project root vprs resolves modules against). Omitting it keeps
  // the default — the emitted paths are exactly what `join(routesDir, …)`
  // produces (relative for a relative routesDir, which is the common case where
  // cwd is the project root). Supply `root` when cwd ≠ project root.
  const { root } = opts;
  const scanned = scanRoutes(root ? resolve(root, routesDir) : routesDir);
  const toRel = (p: string) => relative(root!, p).split(sep).join("/");
  const routes: RouteEntry[] = root
    ? scanned.map((r) => ({
        ...r,
        page: toRel(r.page),
        props: r.props ? toRel(r.props) : undefined,
        layouts: r.layouts.map((l) => ({
          component: toRel(l.component),
          props: l.props ? toRel(l.props) : undefined,
        })),
      }))
    : scanned;
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
    layouts: (url) => matched(url).layouts,
  };
}

/**
 * The declarative form of the plugin's `routes` option: an optional route-tree
 * directory plus optional per-dynamic-route prerender paths.
 *
 *   routes: {}                // scans `moduleBase` itself (the default)
 *   routes: { dir: "app" }    // scans `moduleBase` + "/app" (a subfolder)
 */
export type FileRoutesConfig = {
  /**
   * Route-tree directory, relative to `moduleBase`. Defaults to `moduleBase`
   * itself; set it only when routes live in a subfolder of a larger source root
   * (`{ dir: "app" }` → `src/app` when `moduleBase: "src"`).
   */
  dir?: string;
  /** Concrete paths to prerender per dynamic route — vprs's getStaticPaths. */
  staticPaths?: StaticPathsMap;
};

/**
 * The `routes` plugin option: either a declarative {@link FileRoutesConfig}, or
 * an already-built router table — a `fileRouter()` result or a hand-rolled
 * router supplying `Page` / `props` / `routePatterns` / `build.pages`.
 */
export type RoutesOption = FileRoutesConfig | FileRouterConfig;

/**
 * Resolve the `routes` option to a router table. A {@link FileRoutesConfig} is
 * scanned into a file router — its `dir` joined onto `moduleBase`, with paths
 * emitted relative to `projectRoot` so they're independent of the cwd. An
 * already-built table is returned as-is. Called by resolveOptions to project
 * routing into the existing `Page` / `props` / `routePatterns` / `build.pages`.
 */
export function resolveRoutesOption(
  routes: RoutesOption,
  opts: { moduleBase: string; projectRoot: string },
): FileRouterConfig {
  // A pre-built router table has a `Page` resolver; a declarative config
  // doesn't (so `dir` can be omitted to mean "scan moduleBase itself").
  if ("Page" in routes) return routes;
  return fileRouter(join(opts.moduleBase, routes.dir ?? ""), {
    staticPaths: routes.staticPaths,
    root: opts.projectRoot,
  });
}
