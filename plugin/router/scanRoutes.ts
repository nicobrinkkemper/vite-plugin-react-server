import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** One layer of a route's nested-layout chain (a segment's wrapping files). */
export type RouteLayer = {
  /**
   * A `route.tsx` layout component wrapping this segment and its children.
   * Absent when the segment contributes only boundaries/head (an `error.tsx`,
   * `loading.tsx` or `head.ts` without a layout).
   */
  component?: string;
  /** The segment's `props.ts` loader — shared by the layout and its page. */
  props?: string;
  /**
   * An `error.tsx` client boundary for this segment and its children. The file
   * must be a `"use client"` module exporting the boundary (wrap a fallback
   * with `createErrorBoundary` from the router client runtime).
   */
  error?: string;
  /** A `loading.tsx` Suspense fallback for this segment and its children. */
  loading?: string;
  /** A `head.ts` head/meta contribution, merged root→leaf (leaf wins). */
  head?: string;
};

// One route entry, shaped to feed vprs's existing `urlMap`
// (`pattern → { page, props }`) — i.e. this replaces the hand-rolled
// `createRouter(file) => (url) => switch {...}` that mmc/bidoof write by hand.
export type RouteEntry = {
  /** URL pattern with `$name` params, e.g. "/profile/$id". */
  pattern: string;
  /** Server component file for the route. */
  page: string;
  /** Sibling loader file, if present. */
  props?: string;
  /** True when the pattern has a `$` segment (can't be a fixed prerender). */
  dynamic: boolean;
  /**
   * Ordered root→leaf chain of segment layers wrapping this page. Each segment
   * with a `route.tsx` layout (or an `error.tsx` / `loading.tsx` / `head.ts`)
   * adds a layer; the page composes as `<L0><L1>...<Page/>...</L1></L0>`.
   * Empty for an unwrapped page.
   */
  layouts: RouteLayer[];
};

// File conventions for the scan. `pagePattern` / `propsPattern` default here but
// the plugin passes the resolved `autoDiscover.pagePattern` / `propsPattern`
// (see resolveRoutesOption) so the scanner and the rest of the build share one
// source of truth — a custom autoDiscover pattern is honored, no divergence.
// The remaining conventions are router-specific (no autoDiscover equivalent).
export type ScanPatterns = {
  pagePattern?: RegExp;
  propsPattern?: RegExp;
  layoutPattern?: RegExp;
  indexPattern?: RegExp;
  errorPattern?: RegExp;
  loadingPattern?: RegExp;
  headPattern?: RegExp;
};

const DEFAULT_PAGE = /^page\.(t|j)sx?$/;
const DEFAULT_PROPS = /^props\.(t|j)sx?$/;
/** Default `route.tsx` layout-file matcher; shared with the unwired-layouts warning. */
export const DEFAULT_LAYOUT = /^route\.(t|j)sx?$/;
// `index.tsx` is an alternate leaf-page name (TanStack-style; `page.tsx` wins
// when both exist). Deliberately jsx/tsx-ONLY: `index.ts` is the conventional
// barrel filename, and matching it would turn every re-export barrel inside the
// routes tree into a route.
const DEFAULT_INDEX = /^index\.(t|j)sx$/;
const DEFAULT_ERROR = /^error\.(t|j)sx$/;
const DEFAULT_LOADING = /^loading\.(t|j)sx$/;
const DEFAULT_HEAD = /^head\.(t|j)s$/;

/** A `(group)` directory: shares its layers with children, adds no URL segment. */
const isPathlessGroup = (name: string) =>
  name.startsWith("(") && name.endsWith(")") && name.length > 2;

// Convention: every page file under `routesDir` defines a route; its directory
// path (relative to routesDir) is the URL, with `$name` segments as params, a
// bare `$` directory as a catch-all, and `(group)` directories contributing no
// URL segment (pathless grouping). A `route.tsx` in a segment is a LAYOUT that
// wraps that segment's page and every descendant, sharing the segment's props;
// `error.tsx` / `loading.tsx` / `head.ts` ride the same layer.
export function scanRoutes(
  routesDir: string,
  patterns: ScanPatterns = {},
): RouteEntry[] {
  const pagePattern = patterns.pagePattern ?? DEFAULT_PAGE;
  const propsPattern = patterns.propsPattern ?? DEFAULT_PROPS;
  const layoutPattern = patterns.layoutPattern ?? DEFAULT_LAYOUT;
  const indexPattern = patterns.indexPattern ?? DEFAULT_INDEX;
  const errorPattern = patterns.errorPattern ?? DEFAULT_ERROR;
  const loadingPattern = patterns.loadingPattern ?? DEFAULT_LOADING;
  const headPattern = patterns.headPattern ?? DEFAULT_HEAD;

  const find = (names: string[], dir: string, p: RegExp): string | undefined => {
    const n = names.find((name) => p.test(name));
    return n ? join(dir, n) : undefined;
  };

  // Pathless groups can collapse distinct directories onto one URL pattern
  // ("(a)/page.tsx" and "(b)/page.tsx" are both "/"). Fail loudly — a silent
  // last-wins would serve one and drop the other.
  const seen = new Map<string, string>();

  const walk = (dir: string, layouts: RouteLayer[]): RouteEntry[] => {
    const out: RouteEntry[] = [];
    const names = readdirSync(dir).sort();
    const segProps = find(names, dir, propsPattern);
    // Any wrapping file here (layout / error boundary / loading fallback /
    // head contribution) adds a layer for this segment's page and all
    // descendants, sharing this segment's loader.
    const component = find(names, dir, layoutPattern);
    const error = find(names, dir, errorPattern);
    const loading = find(names, dir, loadingPattern);
    const head = find(names, dir, headPattern);
    const chain =
      component || error || loading || head
        ? [...layouts, { component, props: segProps, error, loading, head }]
        : layouts;
    // Leaf page: `page.tsx` (canonical) or `index.tsx` (alternate; page wins).
    const pageName =
      names.find((name) => pagePattern.test(name)) ??
      names.find((name) => indexPattern.test(name));
    for (const name of names) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        out.push(...walk(abs, chain));
      } else if (name === pageName) {
        const rel = relative(routesDir, dir);
        const rawParts = rel === "" ? [] : rel.split(sep);
        const parts = rawParts.filter((p) => !isPathlessGroup(p));
        const pattern = parts.length ? "/" + parts.join("/") : "/";
        const prior = seen.get(pattern);
        if (prior) {
          throw new Error(
            `scanRoutes: routes "${prior}" and "${abs}" both resolve to "${pattern}" — pathless (group) segments must not collapse two pages onto one URL`,
          );
        }
        seen.set(pattern, abs);
        out.push({
          pattern,
          page: abs,
          props: segProps,
          dynamic: parts.some((p) => p.startsWith("$")),
          layouts: chain,
        });
      }
    }
    return out;
  };

  return walk(routesDir, []);
}
