import type { HtmlComponentType, RootComponentType } from "../types.js";
import type { React } from "../vendor/vendor.server.js";
import { Html as DefaultHtml } from "../components/html.js";
import { Root as DefaultRoot } from "../components/root.js";

/**
 * Resolves components with appropriate fallbacks
 * 
 * This helper can be used in both client and server environments to ensure
 * that RootComponent and HtmlComponent are always defined, falling back to
 * default components when needed.
 * 
 * @param RootComponent - The root component to use, or undefined to use default
 * @param HtmlComponent - The HTML component to use, or undefined to use default
 * @returns Object containing resolved RootComponent and HtmlComponent
 */
export function resolveComponents(
  RootComponent: RootComponentType | typeof React.Fragment,
  HtmlComponent: HtmlComponentType | typeof React.Fragment | undefined
) {
  return {
    RootComponent: RootComponent || DefaultRoot,
    HtmlComponent: HtmlComponent || DefaultHtml,
  };
}
