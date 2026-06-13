import type { HtmlComponentType, RootComponentType } from "../types.js";
import type { React } from "../vendor/vendor.server.js";

/**
 * Resolves components with appropriate fallbacks
 *
 * This helper can be used in both client and server environments to ensure
 * that RootComponent and HtmlComponent are always defined, falling back to
 * default components when needed.
 *
 * Async because it dynamic-imports the default components only when a fallback
 * is actually needed. The defaults import React at module scope; a static
 * import of them would pull React into the graph of every `…/helpers` consumer
 * (and into the plugin's import graph) at load time, so keep them dynamic.
 *
 * @param RootComponent - The root component to use, or undefined to use default
 * @param HtmlComponent - The HTML component to use, or undefined to use default
 * @returns Promise of an object containing resolved RootComponent and HtmlComponent
 */
export async function resolveWithDefaultRootAndHtml(
  RootComponent?: RootComponentType | typeof React.Fragment | undefined,
  HtmlComponent?: HtmlComponentType | typeof React.Fragment | undefined
) {
  const [{ Root: DefaultRoot }, { Html: DefaultHtml }] = await Promise.all([
    RootComponent ? Promise.resolve({ Root: undefined }) : import("../components/root.js"),
    HtmlComponent ? Promise.resolve({ Html: undefined }) : import("../components/html.js"),
  ]);
  return {
    RootComponent: RootComponent || DefaultRoot,
    HtmlComponent: HtmlComponent || DefaultHtml,
  };
}
