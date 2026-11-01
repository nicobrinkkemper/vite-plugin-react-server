/**
 * Which URL the inline flight payload answers, and whether a fetch asks for it.
 *
 * Every inline delivery (the blob element, the streamed chunk scripts, the
 * static prerender, the edge bake) carries the server's answer to THE REQUEST
 * THAT PRODUCED THIS DOCUMENT. So the document's own URL is the record of what
 * the payload is for, and no emitter has to stamp anything. A stamp naming the
 * rendered route would be the wrong record anyway: a host that serves its
 * prerendered 404 page for `/missing` hands the client a document whose payload
 * is the 404 render, and the client's first fetch (for `/missing`) is exactly
 * what that payload answers.
 *
 * The document URL is read from the navigation timing entry: it is the URL the
 * document was served for (after redirects), and `history.pushState` /
 * `replaceState` never change it, so client code that rewrites the address
 * before the first fetch can't make a payload look like another page's. Where
 * the entry is unavailable, the address at module evaluation stands in (the
 * client entry imports vprs before its own body runs).
 */

const PLACEHOLDER_ORIGIN = "http://vprs.invalid";

type LocationLike = { pathname?: string; search?: string; href?: string };

function currentLocation(): LocationLike | undefined {
  const g = globalThis as {
    location?: LocationLike;
    window?: { location?: LocationLike };
  };
  return g.location ?? g.window?.location;
}

function navigationEntryURL(): string | undefined {
  try {
    const perf = (globalThis as { performance?: Performance }).performance;
    const entry = perf?.getEntriesByType?.("navigation")?.[0];
    return entry?.name || undefined;
  } catch {
    return undefined;
  }
}

function locationURL(): string | undefined {
  const loc = currentLocation();
  if (!loc) return undefined;
  if (typeof loc.href === "string" && loc.href) return loc.href;
  if (typeof loc.pathname !== "string") return undefined;
  return loc.pathname + (loc.search ?? "");
}

const addressAtLoad = locationURL();

/**
 * The URL this document was served for, or `undefined` outside a browser (or
 * anywhere it can't be told), in which case the payload is adopted as before.
 */
export function inlineFlightDocumentURL(): string | undefined {
  return navigationEntryURL() ?? addressAtLoad ?? locationURL();
}

/**
 * Reduce a page or flight URL to the route it names, the way the fetch path is
 * built (see createPageURL): drop the hash, the origin and the deploy base,
 * drop a trailing `index.html` / `index.rsc`, and end on a slash. The search
 * is kept apart because it is compared differently.
 */
export function flightRouteKey(
  url: string,
  basePath = "/"
): { path: string; search: string } {
  let parsed: URL;
  try {
    // A path, never a protocol-relative url: `//about` is the route /about/.
    parsed = new URL(url.replace(/^\/{2,}/, "/"), PLACEHOLDER_ORIGIN);
  } catch {
    return { path: url, search: "" };
  }
  let path = parsed.pathname.replace(/\/{2,}/g, "/");
  path = path.replace(/\/index\.(?:html?|rsc)$/i, "/");
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  if (base !== "/" && (path === base.slice(0, -1) || path.startsWith(base))) {
    path = path.slice(base.length - 1) || "/";
  }
  if (!path.startsWith("/")) path = `/${path}`;
  if (!path.endsWith("/")) path = `${path}/`;
  return { path, search: parsed.search };
}

/**
 * Whether a fetch for `requested` may take the payload inlined for
 * `documentURL`. The routes must be the same. The search must be the same
 * only when the fetch names one: a fetch for the bare pathname is how most
 * callers ask for "this page" (`window.location.pathname` is the default), and
 * a static or pathname-keyed render answers every query alike.
 *
 * An unknown document URL matches, which keeps the payload for environments
 * that can't tell (the behaviour before this check existed).
 */
export function inlineFlightMatches(
  requested: string,
  documentURL: string | undefined,
  basePath = "/"
): boolean {
  if (documentURL === undefined) return true;
  const want = flightRouteKey(requested, basePath);
  const have = flightRouteKey(documentURL, basePath);
  if (want.path !== have.path) return false;
  return want.search === "" || want.search === have.search;
}
