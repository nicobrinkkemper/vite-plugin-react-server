import { DEFAULT_CONFIG } from "../config/index.js";
import type { ResolvedUserOptions } from "../types.js";
import { routeToURL } from "../utils/routeToURL.js";
import type { RscRenderMessage } from "../worker/rsc/types.js";

/**
 * Resolves the URL for the render operation, either from message or computed from route
 * 
 * @param message - The RSC render message containing route information
 * @param userOptions - User options containing module base URL and build configuration
 * @returns The resolved URL for the render operation
 */
export function resolveRenderUrl(
  message: RscRenderMessage,
  userOptions: ResolvedUserOptions
): string {
  const options = message.options || {};
  return (
    options.url ??
    routeToURL(
      options.route,
      userOptions.moduleBaseURL,
      userOptions.build?.rscOutputPath ?? DEFAULT_CONFIG.BUILD.rscOutputPath
    )
  );
}
