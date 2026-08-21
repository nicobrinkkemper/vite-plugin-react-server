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
 *
 * Plain constants, importable from every runtime (browser, Node, edge bake).
 */
export const OUTCOME_HEADER = "x-vprs-outcome";

export const OUTCOME = {
  notFound: "not-found",
  redirect: "redirect",
  error: "error",
} as const;

export type Outcome = (typeof OUTCOME)[keyof typeof OUTCOME];

/**
 * The action redirect target as a flight URL: an action `redirect("/next/")`
 * answers 303 pointing at the TARGET's flight — fetch follows it, the client
 * decodes the target page, and the router fixes the address bar.
 */
export const actionRedirectLocation = (to: string): string =>
  (to === "/" ? "" : to.replace(/\/$/, "")) + "/index.rsc";
