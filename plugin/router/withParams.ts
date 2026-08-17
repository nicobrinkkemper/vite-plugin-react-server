import {
  matchRoute,
  normalizePathForMatch,
  type RouteParams,
} from "./matchRoute.js";

// vprs calls a route's `props` export as `props(url)`. `withParams` wraps a
// loader so it instead receives typed params parsed from that url against the
// route's pattern — no core plumbing, no codegen:
//
//   // src/routes/profile/$id/props.ts
//   export const props = withParams("/profile/$id", ({ params }) => ({
//     id: params.id, // params.id: string (inferred from the pattern literal)
//   }));
//
// Declare the same pattern as the route's file location. `withParams` is now
// OPTIONAL: when you configure the plugin via `fileRouter(...)`, vprs threads
// `params` (and `request`) into your loader automatically as
// `props(url, { params, request })` — no pattern to repeat. Reach for
// `withParams` only when you want the params typed from a pattern literal
// without wiring up the file router, or to parse params off a one-off url.
export type LoaderContext<Pattern extends string> = {
  /** The concrete request url vprs passed to the loader. */
  url: string;
  /** Params parsed from `url` against `Pattern`; `{}` if it doesn't match. */
  params: RouteParams<Pattern>;
};

export type WithParamsOptions = {
  /** Transport suffix stripped before matching (`build.rscOutputPath`). */
  rscSuffix?: string;
  /**
   * Strip a trailing `.html` before matching (default `true`, the
   * SSG-correct behavior: `/profile/42.html` → `{ id: "42" }`). Set `false`
   * when `.html` is content, not transport — a catch-all like `/docs/$`
   * whose splat values legitimately end in `.html`.
   */
  stripHtmlSuffix?: boolean;
};

export function withParams<Pattern extends string, T>(
  pattern: Pattern,
  loader: (ctx: LoaderContext<Pattern>) => T,
  options?: WithParamsOptions,
): (url: string) => T {
  return (url) =>
    loader({
      url,
      // Match against the normalized pathname (drop query / `.rsc` / trailing
      // slash) so `withParams` yields the same params the fileRouter-threaded
      // `params` does for the same request — e.g. `/greet/alice.rsc` → `alice`.
      params: (matchRoute(
        pattern,
        normalizePathForMatch(
          url,
          options?.rscSuffix,
          options?.stripHtmlSuffix,
        ),
      ) ?? {}) as RouteParams<Pattern>,
    });
}
