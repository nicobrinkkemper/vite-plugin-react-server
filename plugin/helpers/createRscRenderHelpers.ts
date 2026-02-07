import type { CreateHandlerOptions } from "../types.js";
import type { RscRenderContext } from "../stream/renderRscStream.types.js";
import { createElementWithReact } from "./createElementWithReact.js";
import { React } from "../vendor/vendor.server.js";
import { createHeadlessReusePageComponent } from "./headlessStreamReuseHandler.js";

/**
 * Pure function for creating React element
 * This is environment-agnostic and can be used in both client and server
 */
export function createReactElement(
  options: CreateHandlerOptions,
  context: RscRenderContext,
) {
  // Determine if this is a headless stream by checking if htmlPath is empty
  // This is more reliable than checking the ID
  const isHeadless = options.htmlPath === "";

  // Handle headless stream reuse for full streams
  let finalOptions = options;
  if (!isHeadless && context.reuseHeadlessStreamId) {
    const reusePageComponent = createHeadlessReusePageComponent({
      reuseHeadlessStreamId: context.reuseHeadlessStreamId,
      headlessStreamElements: context.headlessStreamElements || new Map<string, any>(),
      headlessStreamErrors: context.headlessStreamErrors || new Map<string, any>(),
      route: context.route,
      verbose: context.verbose,
      logger: context.logger,
    });
    
    if (reusePageComponent !== undefined) {
      finalOptions = {
        ...options,
        PageComponent: reusePageComponent,
      };
    }
  }

  return createElementWithReact(React, {
    ...finalOptions,
    Html: isHeadless ? React.Fragment : finalOptions.HtmlComponent,
    as: isHeadless ? React.Fragment : "div",
  });
}

/**
 * Pure function for storing headless stream data
 */
export function storeHeadlessStreamData(
  context: RscRenderContext,
  finalOptions: CreateHandlerOptions
): void {
  // Determine if this is a headless stream by checking if htmlPath is empty
  const isHeadless = finalOptions.htmlPath === "";

  if (
    context.headlessStreamElements &&
    isHeadless &&
    !context.headlessStreamErrors?.has(context.route)
  ) {
    // Store the rendered elements for reuse
    const element = createElementWithReact(React, {
      ...finalOptions,
      Html: React.Fragment,
      as: React.Fragment,
    });
    context.headlessStreamElements.set(context.id, {
      elements: element,
      errored: false,
    });
  }
}

export const createRscRenderHelpers = {
  createReactElement,
  storeHeadlessStreamData,
};
