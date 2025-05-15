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
 * This can replace code like `${process.env.VITE_BASE_URL}test` with `baseURL(path)`, and you can be sure that it will work after
 * changing the plugin settings.
 */
export const createBaseURL = (withBaseURL: string) => {
  if (withBaseURL.endsWith("/")) {
    return (path: string) => {
      if (typeof path !== "string" || path === "") return withBaseURL;
      if (path.match(/^https?:\/\//) || path.startsWith(withBaseURL))
        return path;
      return `${withBaseURL}${path.slice(Number(path.startsWith("/")))}`;
    };
  } else {
    return (path: string) => {
      if (typeof path !== "string" || path === "") return withBaseURL;
      if (path.startsWith("/")) return withBaseURL + path;
      if (path.match(/^https?:\/\//) || path.startsWith(withBaseURL))
        return path;
      return `${withBaseURL}/${path}`;
    };
  }
};

/**
 * # createPageURL
 *
 * This function takes a baseURL, public origin and a optional normalizer function that mirrors the baseURL's format.
 * If baseURL DID NOT end with a slash, we continue it using the URL itself (must end with a slash)
 *
 * - `indexRSC`: The path to the index.rsc file
 * - `moduleBaseURL`: The baseURL to use for the module
 *
 * These can be passed in directly to the createReactFetcher and also determine the defaults when no input are provided.
 *
 * @example
 * ```ts
 * import { createFromFetch } from "react-server-dom-esm/client.browser";
 * const parsedURL = pageURL(url ?? "/");
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
 * If you're still wondering why that works, image the moduleBasePath being set at the config level as "/",
 * then we pass it to create a stream `renderToPipeableStream(elements, moduleBasePath)`, and we see
 * ```text
 * 2:I["components/Clickable.client-Dx9diOqr.js","ClientClickable"]
 * ```
 *
 */
export const createPageURL = (
  withBaseURL: string,
  withPublicOrigin: string,
  normalizer = !withBaseURL.endsWith("/")
    ? (url: string) => url.replace(/\/$/, "")
    : (url: string) => (url.endsWith("/") ? url : url + "/")
) => {
  return (to: string) => {
    // Get the path without extension and remove any trailing index
    const folderName = to.replace(/\[index.(html?|rsc|HTML?)]$/, "");
    // Construct the RSC path
    const rscPath =
      folderName + (folderName.endsWith("/") ? "" : "/") + "index.rsc";
    try {
      const moduleBaseURL = new URL(withBaseURL, withPublicOrigin);
      return {
        indexRSC: new URL(rscPath, moduleBaseURL).toString(),
        moduleBaseURL: normalizer(moduleBaseURL.toString()),
      };
    } catch (error) {
      console.error("Error parsing pageURL", error);
      return {
        indexRSC: withBaseURL + "index.rsc",
        moduleBaseURL: withBaseURL,
      };
    }
  };
};
