
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
    } catch (error) {
      return withPublicOrigin + pathWithBaseURL;
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
  if (withBaseURL.endsWith("/")) {
    return (path: string) => {
      if (path === "") return withBaseURL;
      if (path.startsWith(withBaseURL) || isAbsoluteURL(path)) return path;
      return `${withBaseURL}${removeLeadingSlash(path)}`;
    };
  } else {
    return (path: string) => {
      if (path === "") return withBaseURL;
      if (isAbsoluteURL(path)) return path;
      if (path.startsWith("/")) return withBaseURL + path;
      if (path.startsWith(withBaseURL)) return path;
      return `${withBaseURL}/${path}`;
    };
  }
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

export const isBlankRegex = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?\/\//;
export const isAbsoluteURL = (url: string) =>
  isBlankRegex.test(url) || url.startsWith("//");


export const folderName = (path: string, withBaseURL: string) => {
  const baseURL = createBaseURL(withBaseURL);
  return baseURL(path.replace(/\[index.(html?|rsc|HTML?)]$/, ""));
}

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
 * The moduleBasePath being set at the config level as "/",
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
    : addTrailingSlash,
) => {
  return (to: string, fileName: string = "index.rsc") => {
    try {
      // Create the base URL first
      const folderName = addTrailingSlash(
        to.replace(/\[index.(html?|rsc|HTML?)]$/, "")
      );
      const baseURL = createBaseURL(withBaseURL);
      const rscPath = baseURL(folderName) + fileName;
      // Create moduleBaseURL and normalize it to match input format
      const moduleBaseURL = parseURL(withBaseURL, withPublicOrigin);
      if (moduleBaseURL.type === "error") {
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
      return {
        indexRSC: withBaseURL + "index.rsc",
        moduleBaseURL: withBaseURL,
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
    return {
      type: "success",
      url: new URL(url, base),
    };
  } catch (error) {
    return { type: "error", url: url, base: base, error: error as Error };
  }
};
