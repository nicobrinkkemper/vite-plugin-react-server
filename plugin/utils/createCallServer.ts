// The browser flight client is imported lazily, at call time, so this module is
// import-safe under the `react-server` condition (importing it statically would
// pull react-dom/client into the server graph). callServer only ever runs in the
// browser, where the dynamic import resolves from the module cache.
//
// The client is CHOSEN per transport (loadBrowserFlightClient): under
// transport:"webpack" the action response is webpack-flavored, and the esm
// decoder mis-reads webpack reference rows — the export-name slot receives the
// chunk array, so components resolve to undefined. Arg encoding (encodeReply)
// follows the same flavor for symmetry with the server's decodeReply.

import { loadBrowserFlightClient } from "./flightClient.browser.js";
import { OUTCOME, OUTCOME_HEADER } from "./outcomeHeader.js";
import { NOT_FOUND_FIELD } from "../router/loaderSignals.js";

/**
 * How an action's terminal outcomes reach the app. The router wires these
 * (startClient) so outcomes land as SPA transitions; without hooks the
 * defaults still behave correctly, just without a router: a redirect becomes
 * a document navigation, not-found rejects with a `notFound()`-marked error
 * (check it with `isNotFound` from the router exports), and success simply
 * returns the value.
 */
export type CallServerHooks = {
  /**
   * A followed action `redirect()` delivered the TARGET page's decoded
   * flight. `route` is the final route path (the address bar's new value).
   */
  onRedirect?: (route: string, page: unknown) => void;
  /** The action answered the not-found outcome. */
  onNotFound?: () => void;
  /** A normal action response settled — the refresh/revalidation trigger. */
  onSuccess?: () => void;
};

const routeFromFlightUrl = (url: string): string => {
  let route = new URL(url).pathname;
  if (route.endsWith("/index.rsc")) {
    route = route.slice(0, -"/index.rsc".length) || "/";
  }
  return route;
};

export const createCallServer = (
  moduleBaseURL: string,
  hooks: CallServerHooks = {}
) => {
  const callServer = async (id: string, args: unknown[]) => {
    const { createFromFetch, encodeReply } = await loadBrowserFlightClient();
    const response = await fetch(moduleBaseURL, {
      method: "POST",
      body: await encodeReply(args),
      headers: {
        Accept: "text/x-component",
        "x-rsc-action": id,
      },
    });

    // Terminal outcomes are a CONTRACT, not body-sniffing: the server declares
    // them (outcome header / content type / a followed 303), and anything that
    // is not declared flight NEVER reaches the flight decoder — a decoder fed
    // JSON or an HTML error page throws parser garbage instead of the actual
    // failure, which is the exact class the outcome protocol retires.
    const declaredFlight = (response.headers.get("content-type") ?? "")
      .includes("text/x-component");
    const decode = () =>
      createFromFetch(Promise.resolve(response), { callServer, moduleBaseURL });

    if (response.headers.get(OUTCOME_HEADER) === OUTCOME.notFound) {
      if (hooks.onNotFound) {
        hooks.onNotFound();
        return undefined;
      }
      const error = new Error("[vprs] server action answered notFound()");
      Object.assign(error, { [NOT_FOUND_FIELD]: true });
      throw error;
    }

    // An action redirect() answers 303 to the TARGET's flight; fetch follows
    // it transparently, so what arrived here is the target page's flight and
    // only the address bar is behind (same shape as a followed loader
    // redirect on a GET).
    if (response.redirected && response.ok && declaredFlight) {
      const route = routeFromFlightUrl(response.url);
      const page = await decode();
      if (hooks.onRedirect) hooks.onRedirect(route, page);
      else if (typeof window !== "undefined") window.location.assign(route);
      return undefined;
    }

    if (!response.ok) {
      if (declaredFlight) {
        // The error outcome: a flight-rendered { error: { message } }
        // envelope. Decode it as flight — that is the point — and reject the
        // action with the server's actual message.
        const payload = (await decode()) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          payload?.error?.message ??
            `[vprs] server action failed (${response.status})`
        );
      }
      // Legacy / codec-less JSON error (or a proxy's error page): report it
      // without ever touching the decoder.
      let message = `[vprs] server action failed (${response.status})`;
      try {
        const parsed = JSON.parse(await response.text()) as {
          error?: unknown;
        };
        if (parsed?.error) message = String(parsed.error);
      } catch {
        // Not JSON — the status alone is the report.
      }
      throw new Error(message);
    }

    if (!declaredFlight) {
      throw new Error(
        "[vprs] server action response is not a flight payload " +
          `(content-type ${response.headers.get("content-type") ?? "<none>"})`
      );
    }

    const result = await decode();
    hooks.onSuccess?.();

    if (result && typeof result === "object" && "returnValue" in result) {
      return (result as { returnValue: unknown }).returnValue;
    }
    return result;
  };
  return callServer;
};
