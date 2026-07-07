import { existsSync, readdirSync, statSync } from "node:fs";
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

const PAGE = /^page\.(t|j)sx?$/;
const LAYOUT = /^route\.(t|j)sx?$/;
const PROPS = ["props.ts", "props.js"];

const findProps = (dir: string): string | undefined =>
  PROPS.map((p) => join(dir, p)).find(existsSync);

// Convention: every `page.tsx` under `routesDir` defines a route; its directory
// path (relative to routesDir) is the URL, with `$name` segments as params and a
// bare `$` directory as a catch-all. A sibling `props.ts` is the segment's
// loader. A `route.tsx` in a segment is a LAYOUT that wraps that segment's page
// and every descendant, sharing the segment's `props.ts`.
export function scanRoutes(
  routesDir: string,
  base = routesDir,
  layouts: RouteLayer[] = [],
): RouteEntry[] {
  const out: RouteEntry[] = [];
  const names = readdirSync(routesDir).sort();
  const segProps = findProps(routesDir);
  // A `route.tsx` here wraps this segment's page and all descendants, sharing
  // this segment's loader — extend the chain for children and this page.
  const layoutName = names.find((n) => LAYOUT.test(n));
  const chain = layoutName
    ? [...layouts, { component: join(routesDir, layoutName), props: segProps }]
    : layouts;
  for (const name of names) {
    const abs = join(routesDir, name);
    if (statSync(abs).isDirectory()) {
      out.push(...scanRoutes(abs, base, chain));
    } else if (PAGE.test(name)) {
      const rel = relative(base, routesDir);
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
}
