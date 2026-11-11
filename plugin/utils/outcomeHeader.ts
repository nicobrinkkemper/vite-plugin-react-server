/**
 * The terminal-outcome header: `x-vprs-outcome`. A response that is NOT plain
 * page/action content declares what it is, so clients branch on a contract
 * instead of sniffing bodies. Values:
 *
 *  - `not-found` — the request resolved to the not-found outcome. A GET flight
 *    miss carries the 404 route's flight as its body (createRequestHandler);
 *    an action answering `notFound()` carries no body and the client router
 *    fetches the 404 route's flight itself.
 *  - `redirect` — an action answered `redirect()`; rides the 303 whose
 *    `location` is the TARGET's flight. `fetch` follows it transparently, so
 *    browser clients observe `response.redirected` instead of this header.
 *  - `error` — the action failed; the body is a flight-rendered
 *    `{ error: { message } }` envelope (never JSON/text for a flight client).
 *  - `refresh` — the action succeeded and called `ctx.refresh()`; the body is
 *    the usual `{ returnValue }` flight, and the client router refetches the
 *    current route after decoding it. A success without it leaves the view.
 *
 * Plain constants, importable from every runtime (browser, Node, edge bake).
 */
export const OUTCOME_HEADER = "x-vprs-outcome";

export const OUTCOME = {
  notFound: "not-found",
  redirect: "redirect",
  error: "error",
  refresh: "refresh",
} as const;

export type Outcome = (typeof OUTCOME)[keyof typeof OUTCOME];

/**
 * A redirect target as a flight URL: a loader or action `redirect("/next/")`
 * answers a flight request with a 3xx pointing at the TARGET's flight — fetch
 * follows it, the client decodes the target page, and the router fixes the
 * address bar. The flight file sits on the pathname, so a query string and a
 * fragment stay behind it: `/search?q=a` is `/search/index.rsc?q=a`.
 */
export const flightRedirectLocation = (
  to: string,
  flightFile = "index.rsc"
): string => {
  const tailAt = to.search(/[?#]/);
  const pathname = tailAt === -1 ? to : to.slice(0, tailAt);
  const tail = tailAt === -1 ? "" : to.slice(tailAt);
  return pathname.replace(/\/$/, "") + "/" + flightFile + tail;
};

/**
 * The inverse, on the client: the route a followed redirect landed on, read
 * from the final flight URL (`response.url`). The query string is part of the
 * route. `toRoute` maps the document pathname first (strip a deploy base).
 */
export const routeFromFlightUrl = (
  url: string,
  toRoute: (pathname: string) => string = (pathname) => pathname
): string => {
  const { pathname, search } = new URL(url);
  let route = toRoute(pathname);
  if (route.endsWith("/index.rsc")) {
    route = route.slice(0, -"/index.rsc".length) || "/";
  }
  return route + search;
};
