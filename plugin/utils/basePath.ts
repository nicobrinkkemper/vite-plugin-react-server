// The deploy base, in one place: how a path goes under it and how a document
// pathname comes back out. Kept out of urls.ts, whose exports are public.

export const isBlankRegex = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?\/\//;
export const isAbsoluteURL = (url: string) =>
  isBlankRegex.test(url) || url.startsWith("//");

/**
 * Put an app-relative path under the base, always. Unlike createBaseURL it
 * never takes a path that happens to start with the base for an already-based
 * one: under base `/docs/` the route `/docs/intro/` is `/docs/docs/intro/`.
 */
export const joinBaseURL = (withBaseURL: string) => {
  if (withBaseURL === "") return (path: string) => path;
  const slashed = withBaseURL.endsWith("/");
  return (path: string) => {
    if (path === "") return withBaseURL;
    if (isAbsoluteURL(path)) return path;
    if (slashed) return withBaseURL + path.replace(/^\//, "");
    return path.startsWith("/") ? withBaseURL + path : `${withBaseURL}/${path}`;
  };
};

/** The pathname a base is served under, ending on a slash (`/` when none). */
export const basePathOf = (withBaseURL: string): string => {
  try {
    const { pathname } = new URL(withBaseURL, "http://vprs.invalid");
    return pathname.endsWith("/") ? pathname : `${pathname}/`;
  } catch {
    return "/";
  }
};

/**
 * The one rule for reading a document pathname as an app-relative path: a
 * pathname under `basePath` (as basePathOf returns it) loses the base once,
 * anything else is returned as it came.
 */
export const stripBasePath = (pathname: string, basePath: string): string => {
  if (basePath === "/") return pathname;
  if (pathname === basePath.slice(0, -1)) return "/";
  return pathname.startsWith(basePath)
    ? pathname.slice(basePath.length - 1)
    : pathname;
};
