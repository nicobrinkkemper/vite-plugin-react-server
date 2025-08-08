import type { ResolveStreamElementsOptions } from "./resolveStreamElements.types.js";
import { React } from "../vendor/vendor.server.js";
import { createElementWithReact } from "./createElementWithReact.js";
import { createHandlerOptions } from "../config/createHandlerOptions.js";
import {
  stashUserOptions,
  clearStashedUserOptions,
  getEnvironmentId,
} from "../config/stashedOptionsState.js";

/**
 * Server version of resolveStreamElements.
 *
 * Strategy: Resolve components and create React elements.
 * This involves:
 * 1. Getting handler options (which already resolves components)
 * 2. Creating React elements that can be passed to ReactDOMServer.renderToPipeableStream
 * 3. Returning the React elements for server-side rendering
 */
export async function resolveStreamElements(
  options: ResolveStreamElementsOptions
) {
  let shouldClearStashed = false;
  const envId = getEnvironmentId("react-server", "test");

  // If userOptions are provided directly (standalone usage), stash them temporarily
  if (options.userOptions) {
    stashUserOptions(envId, options.userOptions);
    shouldClearStashed = true;
  }

  try {
    // Get proper handler options using the existing infrastructure
    // This already resolves components internally
    const handlerOptions = await createHandlerOptions(options.route, {
      condition: "react-server",
      logger: options.logger,
    });
    return {
      type: "server" as const,
      elements: createElementWithReact(React, handlerOptions),
    };
  } finally {
    // Clean up temporarily stashed options if we stashed them
    if (shouldClearStashed) {
      clearStashedUserOptions(envId);
    }
  }
}
