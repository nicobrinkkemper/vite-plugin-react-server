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
    // A headless (page-level) stream must drop the Html wrapper so its .rsc has
    // no <html>/<head>/<body> — that's what the browser client mounts into
    // #root (a full document there nests <html> inside a <div> and wedges it).
    // createElementWithReact reads `HtmlComponent`, NOT `Html`, so the previous
    // `Html: Fragment` was silently ignored: the Fragment override never took
    // effect and the headless stream kept emitting the full document. Set the
    // key the helper actually reads. (The dev server already does this.)
    HtmlComponent: isHeadless ? React.Fragment : finalOptions.HtmlComponent,
    as: isHeadless ? React.Fragment : "div",
  });
}

/**
 * Pure function for storing headless stream data
 */
