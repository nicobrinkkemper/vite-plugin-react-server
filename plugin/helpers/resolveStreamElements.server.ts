import type { ResolveStreamElementsOptions } from "./resolveStreamElements.types.js";
import { React } from "../vendor/vendor.server.js";
import { createElementWithReact } from "./createElementWithReact.js";
import { createHandlerOptions } from "../config/createHandlerOptions.server.js";
import {
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
  const shouldClearStashed = false;
  const envId = getEnvironmentId("react-server", "test");


  try {
    // Get proper handler options using the existing infrastructure
    // This already resolves components internally
    const handlerOptions = await createHandlerOptions(options.route, {
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
