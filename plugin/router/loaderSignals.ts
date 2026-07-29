/**
 * Loader control-flow signals: a route/layout loader (`props.ts`) or a `head.ts`
 * can end the render early by throwing `redirect(...)` / `notFound()` instead
 * of returning data. The request pipeline translates the signal per render
 * path: a per-request render (dev / Node / edge) answers with the 3xx or the
 * 404 route; the static prerender skips the page with a warning.
 *
 * The signals are plain `Error`s carrying PLAIN string-keyed marker fields —
 * not a class or Symbol — so they survive both duplicate module instances
 * (dev/build/edge each bake their own copy) and the worker postMessage
 * boundary (serializeError spreads own enumerable fields onto the envelope;
 * toError re-applies them on rehydration, mirroring the panic flag).
 */

export const REDIRECT_FIELD = "$$vprsRedirect";
export const NOT_FOUND_FIELD = "$$vprsNotFound";

export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

export type RedirectError = Error & {
  [REDIRECT_FIELD]: true;
  to: string;
  status: RedirectStatus;
};

export type NotFoundError = Error & { [NOT_FOUND_FIELD]: true };

/** Throw from a loader to answer with a redirect (302 by default). */
export function redirect(to: string, status: RedirectStatus = 302): never {
  const err = new Error(`[vprs] redirect ${status} -> ${to}`);
  Object.assign(err, { [REDIRECT_FIELD]: true, to, status });
  throw err;
}

/** Throw from a loader to answer with the 404 route / not-found handling. */
export function notFound(): never {
  const err = new Error("[vprs] notFound");
  Object.assign(err, { [NOT_FOUND_FIELD]: true });
  throw err;
}

export const isRedirect = (e: unknown): e is RedirectError =>
  typeof e === "object" &&
  e !== null &&
  (e as Record<string, unknown>)[REDIRECT_FIELD] === true &&
  typeof (e as Record<string, unknown>)["to"] === "string";

export const isNotFound = (e: unknown): e is NotFoundError =>
  typeof e === "object" &&
  e !== null &&
  (e as Record<string, unknown>)[NOT_FOUND_FIELD] === true;

/** Either signal — anything the pipeline should translate, not report. */
export const isLoaderSignal = (e: unknown): boolean =>
  isRedirect(e) || isNotFound(e);
