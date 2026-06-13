import type { HtmlComponentType, RootComponentType } from "../types.js";
import type { React } from "../vendor/vendor.server.js";

/**
 * Resolves components with appropriate fallbacks
 *
 * This helper can be used in both client and server environments to ensure
 * that RootComponent and HtmlComponent are always defined, falling back to
 * default components when needed.
 *
 * The default Root/Html components import React at module scope, so they are
 * loaded lazily here (dynamic import at point-of-use) rather than statically:
 * a static import would root React in the graph of every `…/helpers` consumer
 * and at plugin import. This makes the function async — callers must
 * `await` it.
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
