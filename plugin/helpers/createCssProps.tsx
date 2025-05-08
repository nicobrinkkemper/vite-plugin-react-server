import type { ResolvedUserOptions, CssContent } from "../types.js";
import { join, relative } from "node:path";


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
export const createCssProps = ({
  id,
  css,
  code,
  projectRoot,
  moduleBaseURL,
  moduleBasePath,
  moduleRootPath,
}: {
  id: string;
  code: string;
} & Pick<ResolvedUserOptions, "css" | "moduleBaseURL" | "moduleBasePath" | "moduleRootPath" | "projectRoot">): CssContent => {
  // If we don't have a bundle entry, create a linked CSS file
  let inline = typeof code === "string" && code.length < css.inlineThreshold;

  // Normalize the ID to be relative to src/
  const normalizedId = id.startsWith(projectRoot) ? relative(projectRoot, id) : id;
  if(css.inlinePatterns && css.inlinePatterns.some(pattern => pattern.test(normalizedId))) {
    inline = true;
  }
  if(css.linkPatterns && css.linkPatterns.some(pattern => pattern.test(normalizedId))) {
    inline = false;
  }
  if (inline) {
    return {
      type: "text/css",
      id: normalizedId,
      as: "style",
      children: code.trim(),
      ...(process.env["NODE_ENV"] !== "production" ? {
        "data-vite-dev-id": join(moduleRootPath, normalizedId),
      } : {}),
    } as CssContent<true>;
  }

  // Default case
  return {
    id: normalizedId,
    as: "link",
    rel: "stylesheet",
    href: join(moduleBaseURL, moduleBasePath, normalizedId),
    precedence: "high",
  } as CssContent<false>;
};
