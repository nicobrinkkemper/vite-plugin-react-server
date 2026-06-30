import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

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
};

const PAGE = /^page\.(t|j)sx?$/;
const PROPS = ["props.ts", "props.js"];

// Convention: every `page.tsx` under `routesDir` defines a route; its directory
// path (relative to routesDir) is the URL, with `$name` segments as params and a
// bare `$` directory as a catch-all. A sibling `props.ts` is the route's loader.
export function scanRoutes(routesDir: string, base = routesDir): RouteEntry[] {
  const out: RouteEntry[] = [];
  for (const name of readdirSync(routesDir).sort()) {
    const abs = join(routesDir, name);
    if (statSync(abs).isDirectory()) {
      out.push(...scanRoutes(abs, base));
    } else if (PAGE.test(name)) {
      const rel = relative(base, routesDir);
      const parts = rel === "" ? [] : rel.split(sep);
      const pattern = parts.length ? "/" + parts.join("/") : "/";
      const props = PROPS.map((p) => join(routesDir, p)).find(existsSync);
      out.push({
        pattern,
        page: abs,
        props,
        dynamic: parts.some((p) => p.startsWith("$")),
      });
    }
  }
  return out;
}
