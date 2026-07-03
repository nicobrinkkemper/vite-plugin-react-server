// File-based route matching for vprs.
//
// Convention (borrowed from TanStack Router / Remix, which the team already
// likes): a path segment written `$name` is a dynamic param; a bare `$` is a
// catch-all that swallows the rest of the path. Everything else is a literal.
//
// The type-safety idea comes from mmc's hand-written router, which derived
// params from a hand-maintained `VariableMap`. Here the params fall out of the
// *pattern string itself* via template-literal types, so there's no map to keep
// in sync and no codegen step — `RouteParams<"/profile/$id">` is `{ id: string }`.

/** Split a pattern into its segments at the type level. */
type Split<S extends string> = S extends `${infer Head}/${infer Tail}`
  ? [Head, ...Split<Tail>]
  : [S];

/** A segment's param name, or `never` if it's a literal. Bare `$` → catch-all. */
type ParamName<S extends string> = S extends `$${infer Name}`
  ? Name extends ""
    ? "_splat"
    : Name
  : never;

/** Params inferred from a route pattern. `/blog/$cat/$slug` → `{cat,slug}`. */
export type RouteParams<Pattern extends string> = {
  [Seg in Split<Pattern>[number] as ParamName<Seg>]: string;
};

const segs = (s: string) => s.split("/").filter(Boolean);

/** The placeholder a `$`/`$name` segment probes as — no static segment equals it. */
const PROBE_SEGMENT = "__vprs_dyn__";

/**
 * Normalize a request path for route matching: drop the query, the transport
 * suffix (`.rsc`/`rscOutputPath`) or `.html`, and a trailing slash — so
 * `/profile/42.rsc` and `/profile/42/` both resolve `{ id: "42" }`, not
 * `"42.rsc"`. Shared by the fileRouter-threaded `params` (resolvePageAndProps)
 * and the manual `withParams` escape hatch so the two agree for a given request.
 */
export function normalizePathForMatch(path: string, rscSuffix = ".rsc"): string {
  let p = path.split("?")[0];
  if (rscSuffix && p.endsWith(rscSuffix)) p = p.slice(0, -rscSuffix.length);
  else if (p.endsWith(".html")) p = p.slice(0, -".html".length);
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

// Decode a path segment defensively: a malformed %-escape (e.g. "%zz" or a bare
// "%") makes `decodeURIComponent` throw a URIError. The pathname is
// attacker-controlled and matched on the request thread (incl. the edge handler,
// which resolves routes outside resolvePageAndProps' try), so a throw here would
// surface as an unhandled error / 500. Keep the raw segment instead.
const decodeSegment = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Match one pattern against a pathname. Returns typed params, or null. */
export function matchRoute<P extends string>(
  pattern: P,
  pathname: string,
): RouteParams<P> | null {
  const p = segs(pattern);
  const u = segs(pathname);
  const params: Record<string, string> = {};

  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    if (seg === "$") {
      // Catch-all: take the rest of the path (may be empty).
      params["_splat"] = u.slice(i).map(decodeSegment).join("/");
      return params as RouteParams<P>;
    }
    if (u[i] === undefined) return null;
    if (seg.startsWith("$")) {
      params[seg.slice(1)] = decodeSegment(u[i]);
    } else if (seg !== u[i]) {
      return null;
    }
  }
  // No catch-all consumed the tail, so segment counts must match exactly.
  return p.length === u.length ? (params as RouteParams<P>) : null;
}

/** Per-segment specificity: literal beats param beats catch-all. */
function score(pattern: string): number[] {
  return segs(pattern).map((s) => (s === "$" ? 0 : s.startsWith("$") ? 1 : 2));
}

/** Compare two specificity vectors left-to-right; more-specific sorts first. */
function moreSpecific(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (b[i] ?? -1) - (a[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

/**
 * Inverse of matchRoute: build a concrete url from a pattern + params
 * (`/profile/$id` + `{id:"5"}` → `/profile/5`). Used to enumerate a dynamic
 * route's static paths for prerendering. A bare `$` catch-all is filled from
 * `params._splat` (kept raw — it may itself be a path); named params are
 * percent-encoded. Throws if a named param is missing.
 */
export function fillPattern(
  pattern: string,
  params: Record<string, string>,
): string {
  const out = segs(pattern).map((seg) => {
    if (seg === "$") return params["_splat"] ?? "";
    if (seg.startsWith("$")) {
      const name = seg.slice(1);
      const value = params[name];
      if (value === undefined) {
        throw new Error(`fillPattern: missing param "${name}" for "${pattern}"`);
      }
      return encodeURIComponent(value);
    }
    return seg;
  });
  return `/${out.filter((s) => s !== "").join("/")}`;
}

/**
 * A concrete, matchable "probe" url for a pattern: each `$name` / `$` segment is
 * replaced by a placeholder that no static segment equals, so the functional
 * router resolves it to THIS pattern's page/props. Used at build time to bake a
 * dynamic route's modules (edge bundle) or add them as build inputs, without a
 * real — and therefore prerenderable — url.
 *
 * Catch-all disambiguation: a bare-`$` catch-all is LESS specific than a
 * same-prefix `$name` sibling, so a single-segment probe (`/files/X`) would
 * resolve to the `$name` route and bake the WRONG module for the catch-all (and
 * never build the catch-all's own module). Pass `allPatterns` so a catch-all
 * probe is padded past the longest pattern — only the catch-all matches a url
 * deeper than every named route, so it resolves to itself.
 */
export function patternProbeUrl(
  pattern: string,
  allPatterns?: readonly string[],
): string {
  const parts = segs(pattern);
  const out = parts.map((s) => (s.startsWith("$") ? PROBE_SEGMENT : s));
  const isCatchAll = parts[parts.length - 1] === "$";
  if (isCatchAll && allPatterns?.length) {
    const maxSegs = Math.max(...allPatterns.map((p) => segs(p).length));
    while (out.length <= maxSegs) out.push(PROBE_SEGMENT);
  }
  return `/${out.join("/")}`;
}

/** Match a pathname against many patterns, most-specific first. */
// Specificity ordering only depends on the pattern list, but matchRoutes runs
// per request (dev / edge / Node). Cache the sorted order by array identity —
// callers pass a stable patterns array (fileRouter's routePatterns, the edge
// bundle's ROUTE_PATTERNS) — so we sort once, not on every request.
const orderedCache = new WeakMap<readonly string[], readonly string[]>();
const orderPatterns = <P extends string>(patterns: readonly P[]): readonly P[] => {
  let ordered = orderedCache.get(patterns) as readonly P[] | undefined;
  if (!ordered) {
    ordered = [...patterns].sort((a, b) => moreSpecific(score(a), score(b)));
    orderedCache.set(patterns, ordered);
  }
  return ordered;
};

export function matchRoutes<P extends string>(
  patterns: readonly P[],
  pathname: string,
): { pattern: P; params: RouteParams<P> } | null {
  for (const pattern of orderPatterns(patterns)) {
    const params = matchRoute(pattern, pathname);
    if (params) return { pattern, params };
  }
  return null;
}
