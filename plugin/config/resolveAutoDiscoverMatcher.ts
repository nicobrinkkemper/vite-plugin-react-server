/**
 * Resolves a matcher pattern to a function that tests paths
 */
export const resolveAutoDiscoverMatcher = (
  options: undefined | string | RegExp | ((path: string) => boolean),
  fallback: RegExp | ((path: string) => boolean)
) => {
  if (!options) {
    if (typeof fallback === "function") {
      return fallback;
    } else {
      return (path: string) => fallback.test(path);
    }
  }
  if (typeof options === "string") {
    const matcher = new RegExp(options);
    return (path: string) => matcher.test(path);
  } else if (typeof options === "function") {
    return options;
  } else {
    return (path: string) => options.test(path);
  }
};
