import type { ResolvedUserOptions, CssContent } from "../types.js";
import { join, relative } from "node:path";
import { deserializeRegExp } from "./serializeUserOptions.js";

/**
 * Creates a CssContent object for a given path and css options
 *
 * Requirements:
 * - path is a string
 * - css is an object with the following properties:
 *   - inlineCss: boolean
 *   - purgeCss: boolean
 *   - inlineThreshold: number
 *   - inlinePatterns: RegExp[]
 *   - linkPatterns: RegExp[]
 * based on the bundle, we retrieve the css content and check if it should be inlined or linked
 * inlined tags get the as:style and the children are the css content
 * linked tags get the as:link and the href is the path
 *
 * @param path - The path to the css file
 * @param css - The css options
 * @returns A CssContent object
 */
export const createCssProps = <
  T = unknown,
  InlineCSS extends boolean | undefined = undefined
>({
  id,
  code,
  userOptions,
}: {
  id: string;
  code: string;
  userOptions: Pick<
    ResolvedUserOptions<T, InlineCSS>,
    | "css"
    | "moduleBaseURL"
    | "moduleBasePath"
    | "moduleRootPath"
    | "projectRoot"
  >;
}): CssContent<InlineCSS> => {
  const { css, moduleBaseURL, moduleBasePath, moduleRootPath, projectRoot } =
    userOptions;
  // If we don't have a bundle entry, create a linked CSS file
  let inline = typeof code === "string" && code.length > css.inlineThreshold;
  // Normalize the ID to be relative to src/
  const normalizedId = id.startsWith(projectRoot)
    ? relative(projectRoot, id)
    : id;

  if (css.inlinePatterns?.length) {
    // Deserialize RegExp patterns if they exist
    const inlinePatterns = css.inlinePatterns?.map((pattern) =>
      typeof pattern === "string" ? deserializeRegExp(pattern) : pattern
    );
    if (inlinePatterns.some((pattern) => pattern.test?.(normalizedId))) {
      inline = true;
    }
  }
  if (css.linkPatterns?.length) {
    const linkPatterns = css.linkPatterns?.map((pattern) =>
      typeof pattern === "string" ? deserializeRegExp(pattern) : pattern
    );
    if (linkPatterns.some((pattern) => pattern.test?.(normalizedId))) {
      inline = false;
    }
  }
  if (inline) {
    return {
      type: "text/css",
      id: normalizedId,
      as: "style",
      children: code.trim(),
      ...(process.env["NODE_ENV"] !== "production"
        ? {
            "data-vite-dev-id": join(projectRoot, moduleRootPath, normalizedId),
          }
        : {}),
    } as CssContent<InlineCSS>;
  }
  const joined = normalizedId.startsWith(moduleBasePath)
    ? normalizedId
    : join(moduleBasePath, normalizedId);
  const moduleBaseHasTrailingSlash = moduleBaseURL.endsWith("/");
  const joinedHasLeadingSlash = joined.startsWith("/");
  const safeParseURL = (() => {
    if (
      joined.startsWith(
        moduleBaseHasTrailingSlash ? moduleBaseURL.slice(0, -1) : moduleBaseURL
      )
    ) {
      return joined;
    }
    try {
      if (moduleBaseURL.includes("//")) {
        // relative to moduleBaseURL
        return new URL(
          joinedHasLeadingSlash ? joined.slice(1) : joined,
          moduleBaseURL
        ).href;
      }
    } catch (error) {}
    // if the url is not valid, we return the moduleBaseURL + the normalizedId
    // dont make it a argument of join or it will mangle something like http:// into http:/
    return (
      moduleBaseURL +
      (!moduleBaseHasTrailingSlash && !joinedHasLeadingSlash ? "/" : "") +
      (moduleBaseHasTrailingSlash ? joined.slice(1) : joined)
    );
  })();
  // Default case
  return {
    id: normalizedId,
    as: "link",
    rel: "stylesheet",
    href: safeParseURL,
    precedence: "high",
  } as CssContent<InlineCSS>;
};
