import type { ResolvedUserOptions, CssContent } from "../types.js";
import { join } from "node:path";
import { deserializeRegExp } from "./serializeUserOptions.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

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
  code,
  userOptions,
}: {
  id: string;
  code: string;
  userOptions: Pick<
    ResolvedUserOptions,
    | "css"
    | "moduleBaseURL"
    | "moduleBasePath"
    | "moduleRootPath"
    | "projectRoot"
    | "normalizer"
    | "moduleID"
    | "publicOrigin"
  >;
}): CssContent<boolean> => {
  const { css, moduleRootPath } = userOptions;
  // If we don't have a bundle entry, create a linked CSS file
  let inline =
    css?.inlineCss !== false &&
    typeof code === "string" &&
    code.length > (css?.inlineThreshold ?? DEFAULT_CONFIG.CSS.inlineThreshold);
  // Normalize the ID to be relative to src/
  const [, value] = userOptions.normalizer(id);
  const moduleID = userOptions?.moduleID?.(value) ?? value;
  if (css.inlinePatterns?.length) {
    // Deserialize RegExp patterns if they exist
    const inlinePatterns = css.inlinePatterns;
    if (inlinePatterns.some((pattern) => pattern.test?.(id))) {
      inline = true;
    }
  }
  if (css.linkPatterns?.length) {
    const linkPatterns = css.linkPatterns?.map((pattern) =>
      typeof pattern === "string" ? deserializeRegExp(pattern) : pattern
    );
    if (linkPatterns.some((pattern) => pattern.test?.(id))) {
      inline = false;
    }
  }
  if (inline) {
    return {
      type: "text/css",
      id: moduleID,
      as: "style",
      children: code.trim(),
      ...(process.env["NODE_ENV"] !== "production"
        ? {
            "data-vite-dev-id": join(moduleRootPath, moduleID),
          }
        : {}),
    } as CssContent<boolean>;
  }
  const processEnv = process.env || {};
  const hasEnv =
    typeof processEnv.VITE_PUBLIC_ORIGIN === "string" &&
    processEnv.VITE_PUBLIC_ORIGIN !== "";
  const importMeta = import.meta || {};
  const hasMetaEnv =
    "env" in importMeta &&
    typeof importMeta.env.PUBLIC_ORIGIN === "string" &&
    importMeta.env.PUBLIC_ORIGIN !== "";
  // final public origin check
  if ((hasEnv || hasMetaEnv) && userOptions.publicOrigin) {
    // change the public origin to the one from the env
    if (hasEnv && userOptions.publicOrigin !== processEnv.VITE_PUBLIC_ORIGIN) {
      // prefer potentially dynamic process.env
      userOptions.publicOrigin = processEnv.VITE_PUBLIC_ORIGIN;
    } else if (
      hasMetaEnv &&
      userOptions.publicOrigin !== import.meta.env.PUBLIC_ORIGIN
    ) {
      // static import.meta.env
      userOptions.publicOrigin = import.meta.env.PUBLIC_ORIGIN;
    }
  }
  // Default case
  return {
    id: moduleID,
    as: "link",
    rel: "stylesheet",
    href:
      userOptions.publicOrigin !== ""
        ? new URL(
            userOptions.moduleBaseURL +
              moduleID.slice(
                Number(
                  moduleID.startsWith("/") &&
                    userOptions.moduleBaseURL.endsWith("/")
                )
              ),
            userOptions.publicOrigin +
              userOptions.moduleBaseURL.slice(
                Number(
                  userOptions.publicOrigin.endsWith("/") &&
                    userOptions.moduleBaseURL.startsWith("/")
                )
              )
          ).href
        : moduleID,
    precedence: "high",
  } as CssContent<boolean>;
};
