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
 */
export function patternProbeUrl(pattern: string): string {
  return `/${segs(pattern)
    .map((s) => (s.startsWith("$") ? "__vprs_dyn__" : s))
    .join("/")}`;
}

/** Match a pathname against many patterns, most-specific first. */
export function matchRoutes<P extends string>(
  patterns: readonly P[],
  pathname: string,
): { pattern: P; params: RouteParams<P> } | null {
  const ordered = [...patterns].sort((a, b) => moreSpecific(score(a), score(b)));
  for (const pattern of ordered) {
    const params = matchRoute(pattern, pathname);
    if (params) return { pattern, params };
  }
  return null;
}
