import {
  basePathOf,
  isAbsoluteURL,
  isBlankRegex,
  joinBaseURL,
  stripBasePath,
} from "./basePath.js";

/**
 * # createAbsoluteUrl
 *
 * This function takes a baseURL and a public origin and returns a function that takes a path and returns the path with the baseURL attached to it.
 *
 * @example
 * ```ts
 * const absoluteURL = createAbsoluteURL("/mmc", "https://bidoof.com")
 * console.log(absoluteURL("/test")) // "https://bidoof.com/mmc/test"
 * ```
 *
 * @example
 * ```ts
 * const absoluteURL = createAbsoluteURL("/mmc", "https://bidoof.com")
 * console.log(absoluteURL("/test")) // "https://bidoof.com/mmc/test"
 * ```
 *
 * This can replace code like `${process.env.VITE_PUBLIC_ORIGIN}/test` with `absoluteUrl('/test')`, and you can be sure that it will work after
 * changing the plugin settings.
 */
export const createAbsoluteURL = (
  withBaseURL: string,
  withPublicOrigin: string
) => {
  const baseURL = createBaseURL(withBaseURL);
  if (withPublicOrigin === "" || typeof withPublicOrigin !== "string")
    return baseURL;
  return (path: string) => {
    const pathWithBaseURL = baseURL(path);
    try {
      return new URL(pathWithBaseURL, withPublicOrigin).toString();
    } catch {
      // Fallback: ensure proper URL construction
      const publicOrigin = withPublicOrigin.endsWith("/") 
        ? withPublicOrigin.slice(0, -1) 
        : withPublicOrigin;
      const pathPart = pathWithBaseURL.startsWith("/") 
        ? pathWithBaseURL 
        : `/${pathWithBaseURL}`;
      return publicOrigin + pathPart;
    }
  };
};

/**
 * # createBaseURL
 *
 * This function takes a baseURL and returns a function that takes a path and returns the path with the baseURL attached to it.
 *
 * @example
 * ```ts
 * const baseURL = createBaseURL("/mmc")
 * console.log(baseURL("/test")) // "/mmc/test"
 * ```
 *
 * @example
 * ```ts
 * const baseURL = createBaseURL("/mmc/")
 * console.log(baseURL("/test")) // "/mmc/test"
 * ```
 *
 * This can replace code like `${import.meta.env.test` with `baseURL(path)`, and you can be sure that it will work after
 * changing the plugin settings.
 *
 * Path handling logic:
 * 1. For baseURL ending with "/":
 *    - If path starts with "/", slice off the leading slash to avoid double slashes
 *    - If path doesn't start with "/", keep it as is
 *
 * 2. For baseURL not ending with "/":
 *    - If path starts with "/", directly concatenate with baseURL
 *    - If path doesn't start with "/", add a slash between baseURL and path
 *
 * baseURL "src"  + path "src/test" -> should not concatenate to src/src/test
 * baseURL "/" + path "https://bidoof.com" -> should not concatenate to /https://bidoof.com"
 */
export const createBaseURL = (withBaseURL: string) => {
  const join = joinBaseURL(withBaseURL);
  if (withBaseURL === "") return join;
  if (withBaseURL.endsWith("/")) {
    return (path: string) => (path.startsWith(withBaseURL) ? path : join(path));
  }
  return (path: string) =>
    !path.startsWith("/") && path.startsWith(withBaseURL) ? path : join(path);
};

/** Remove a single trailing slash from the URL if it ends with one */
export const removeTrailingSlash = (url: string) =>
  url.endsWith("/") ? url.slice(0, -1) : url;

/** Add a single trailing slash to the URL if it doesn't end with one */
export const addTrailingSlash = (url: string) =>
  url.endsWith("/") ? url : `${url}/`;

export const removeLeadingSlash = (url: string) =>
  url.startsWith("/") ? url.slice(1) : url;

export const addLeadingSlash = (url: string) =>
  url.startsWith("/") ? url : `/${url}`;

export { isAbsoluteURL, isBlankRegex };

export const folderName = (path: string, withBaseURL: string) => {
  const baseURL = createBaseURL(withBaseURL);
  return baseURL(path.replace(/\[index.(html?|rsc|HTML?)]$/, ""));
};

/**
 * # createPageURL
 *
 * This function takes a baseURL, public origin and a optional normalizer function that mirrors the baseURL's format.
 * If baseURL ends with a slash, we continue it using the URL itself (must end with a slash)
 *
 * - `indexRSC`: The path to the index.rsc file
 * - `moduleBaseURL`: The baseURL to use for the module
 *
 * These can be passed in directly to the createReactFetcher and also determine the defaults when no input are provided.
 *
 * @example
 * ```ts
 * import { createFromFetch } from "react-server-dom-esm/client.browser";
 * const parsedURL = pageURL(window.location.pathname ?? "/");
 * const data = createFromFetch(
 *  fetch(parsedURL.indexRSC, {
 *    headers: {
 *      Accept: "text/x-component",
 *    }
 *  }),
 *  {
 *    callServer: callServer,
 *    moduleBaseURL: parsedURL.moduleBaseURL,
 *  }
 * );
 * ```
 *
 * The moduleBasePath being set at the config level as "",
 * then we pass it to create a stream `renderToPipeableStream(elements, moduleBasePath)`, and we see
 * ```text
 * 2:I["src/components/Clickable.client-Dx9diOqr.js","ClientClickable"]
 * ```
 *
 */
export const createPageURL = (
  withBaseURL: string,
  withPublicOrigin: string,
  isDev = false,
  normalizer = !withBaseURL.endsWith("/")
    ? removeTrailingSlash
    : addTrailingSlash
) => {
  return (to: string, fileName: string = "index.rsc") => {
    // `to` is a document location. Its base comes off by the one rule
    // (stripBasePath) and goes back on unconditionally, so a route whose first
    // segment equals the base (`/docs/docs/intro/` under `/docs/`) keeps both.
    // An app-relative path outside the base passes the strip untouched.
    //
    // The router hands over the whole location (`/level/?course=x`), but the
    // flight file sits on the PATHNAME: `<pathname>/index.rsc?course=x`. Built
    // from the full string instead, `/level/?course=x/index.rsc` asks a static
    // host for the html page and the client falls back to a full load. The
    // fragment never reaches a server, so it is dropped rather than carried.
    const tailAt = to.search(/[?#]/);
    const pathname = tailAt === -1 ? to : to.slice(0, tailAt);
    const search = tailAt === -1 ? "" : to.slice(tailAt).replace(/#.*$/, "");
    try {
      // Ensure withBaseURL is a string
      const baseURLString = typeof withBaseURL === 'string' ? withBaseURL : String(withBaseURL || '/');

      // Create the base URL first
      const folderName = addTrailingSlash(
        pathname.replace(/\[index.(html?|rsc|HTML?)]$/, "")
      );
      const rscPath =
        joinBaseURL(baseURLString)(
          stripBasePath(folderName, basePathOf(baseURLString))
        ) +
        fileName +
        search;
      // Create moduleBaseURL and normalize it to match input format
      const moduleBaseURL = parseURL(baseURLString, withPublicOrigin);
      if (moduleBaseURL.type === "error") {
        if(isDev) console.error("Error parsing moduleBaseURL", moduleBaseURL.error);
        throw moduleBaseURL.error;
      }
      const indexRSC = parseURL(rscPath, withPublicOrigin);
      if (indexRSC.type === "error") {
        throw indexRSC.error;
      }
      return {
        indexRSC: indexRSC.url.toString(),
        moduleBaseURL: normalizer(moduleBaseURL.url.toString()),
      };
    } catch (error) {
      if (isDev) console.error("Error parsing pageURL", error);
      const shouldJoin = !pathname.endsWith("/") && !fileName.startsWith("/");
      const shouldSlice = pathname.endsWith("/") && fileName.startsWith("/");
      return {
        indexRSC:
          pathname +
          (shouldJoin ? "/" : "") +
          (shouldSlice ? fileName.slice(1) : fileName) +
          search,
        moduleBaseURL: typeof withBaseURL === 'string' ? withBaseURL : String(withBaseURL || '/'),
      };
    }
  };
};

/**
 * # moduleBaseURL
 *
 * This function takes a baseURL, public origin and a optional normalizer function that mirrors the baseURL's format.
 *
 * @example
 * ```ts
 * const moduleBaseURL = parseURL("/mmc", "https://bidoof.com")
 * if(moduleBaseURL.type === "error") {
 *   console.error(moduleBaseURL.error)
 * } else {
 *   console.log(moduleBaseURL.url)
 * }
 * ```
 *
 **/
export const parseURL = (
  url: string,
  base: string
):
  | { type: "success"; url: URL; error?: never; base?: never }
  | { type: "error"; url: string; base: string; error: Error } => {
  try {
    // In a BROWSER the document's own origin always wins over the baked
    // PUBLIC_ORIGIN. These URLs name same-origin assets of the page being
    // served — client-component chunks, index.rsc, the action endpoint — and
    // resolving them against a baked origin splits them off the document the
    // moment the app is served from anywhere else (a different port,
    // 127.0.0.1 vs localhost, a preview deploy): the page's scripts come from
    // origin A, the flight-loaded chunks from origin B, two module graphs
    // bundle TWO REACTS, and hydration dies with a null dispatcher deep in a
    // client component — no 404, no warning. PUBLIC_ORIGIN is for absolute
    // URLs in metadata (canonical, og:image — see createAbsoluteURL), not for
    // module loading. An explicitly absolute `url` (a CDN moduleBaseURL the
    // consumer passed on purpose) still passes through below.
    let effectiveBase = base;
    if (typeof window !== "undefined" && window.location) {
      effectiveBase = window.location.origin;
    } else if (
      (!effectiveBase || effectiveBase === "/" || !isAbsoluteURL(effectiveBase)) &&
      !effectiveBase
    ) {
      // Non-browser with an EMPTY base only: neutral placeholder. An invalid
      // non-empty base deliberately keeps its value so `new URL` throws and
      // the caller's relative-URL fallback applies (pre-existing contract).
      effectiveBase = "http://localhost";
    }

    // If url is already absolute, use it directly
    if (isAbsoluteURL(url)) {
      return {
        type: "success",
        url: new URL(url),
      };
    }

    return {
      type: "success",
      url: new URL(url, effectiveBase),
    };
  } catch (error) {
    return { type: "error", url: url, base: base, error: error as Error };
  }
};