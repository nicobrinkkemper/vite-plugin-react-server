import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** One layer of a route's nested-layout chain (a `route.tsx` + its loader). */
export type RouteLayer = {
  /** A `route.tsx` layout component wrapping this segment and its children. */
  component: string;
  /** The segment's `props.ts` loader — shared by the layout and its page. */
  props?: string;
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
   * Ordered root→leaf chain of `route.tsx` layouts wrapping this page. Each
   * `route.tsx` in an ancestor (or this page's own) segment adds a layer; the
   * page composes as `<L0><L1>...<Page/>...</L1></L0>`. Empty for an unwrapped
   * page.
   */
  layouts: RouteLayer[];
};

// File conventions for the scan. `pagePattern` / `propsPattern` default here but
// the plugin passes the resolved `autoDiscover.pagePattern` / `propsPattern`
// (see resolveRoutesOption) so the scanner and the rest of the build share one
// source of truth — a custom autoDiscover pattern is honored, no divergence.
// `route.tsx` layouts are router-specific (no autoDiscover equivalent).
export type ScanPatterns = {
  pagePattern?: RegExp;
  propsPattern?: RegExp;
  layoutPattern?: RegExp;
};

const DEFAULT_PAGE = /^page\.(t|j)sx?$/;
const DEFAULT_PROPS = /^props\.(t|j)sx?$/;
const DEFAULT_LAYOUT = /^route\.(t|j)sx?$/;

// Convention: every page file under `routesDir` defines a route; its directory
// path (relative to routesDir) is the URL, with `$name` segments as params and a
// bare `$` directory as a catch-all. A sibling props file is the segment's
// loader. A `route.tsx` in a segment is a LAYOUT that wraps that segment's page
// and every descendant, sharing the segment's props.
export function scanRoutes(
  routesDir: string,
  patterns: ScanPatterns = {},
): RouteEntry[] {
  const pagePattern = patterns.pagePattern ?? DEFAULT_PAGE;
  const propsPattern = patterns.propsPattern ?? DEFAULT_PROPS;
  const layoutPattern = patterns.layoutPattern ?? DEFAULT_LAYOUT;

  const findProps = (names: string[], dir: string): string | undefined => {
    const n = names.find((name) => propsPattern.test(name));
    return n ? join(dir, n) : undefined;
  };

  const walk = (dir: string, layouts: RouteLayer[]): RouteEntry[] => {
    const out: RouteEntry[] = [];
    const names = readdirSync(dir).sort();
    const segProps = findProps(names, dir);
    // A `route.tsx` here wraps this segment's page and all descendants, sharing
    // this segment's loader — extend the chain for children and this page.
    const layoutName = names.find((name) => layoutPattern.test(name));
    const chain = layoutName
      ? [...layouts, { component: join(dir, layoutName), props: segProps }]
      : layouts;
    for (const name of names) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        out.push(...walk(abs, chain));
      } else if (pagePattern.test(name)) {
        const rel = relative(routesDir, dir);
        const parts = rel === "" ? [] : rel.split(sep);
        const pattern = parts.length ? "/" + parts.join("/") : "/";
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
