import { matchRoute, type RouteParams } from "./matchRoute.js";

// vprs calls a route's `props` export as `props(url)`. `withParams` wraps a
// loader so it instead receives typed params parsed from that url against the
// route's pattern — no core plumbing, no codegen:
//
//   // src/routes/profile/$id/props.ts
//   export const props = withParams("/profile/$id", ({ params }) => ({
//     id: params.id, // params.id: string (inferred from the pattern literal)
//   }));
//
// Declare the same pattern as the route's file location. This is the minimal,
// composable way to get params into a loader; an automatic (no-pattern) variant
// can thread params through the handler pipeline later as an enhancement.
export type LoaderContext<Pattern extends string> = {
  /** The concrete request url vprs passed to the loader. */
  url: string;
  /** Params parsed from `url` against `Pattern`; `{}` if it doesn't match. */
  params: RouteParams<Pattern>;
};

export function withParams<Pattern extends string, T>(
  pattern: Pattern,
  loader: (ctx: LoaderContext<Pattern>) => T,
): (url: string) => T {
  return (url) =>
    loader({ url, params: (matchRoute(pattern, url) ?? {}) as RouteParams<Pattern> });
}
