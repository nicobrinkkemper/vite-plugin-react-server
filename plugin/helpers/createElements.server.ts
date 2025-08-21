import {
  createElementWithReact,
  type CreateElementWithReactOptions,
} from "./createElementWithReact.js";
import { React } from "../vendor/vendor.server.js";
import type { CreateHandlerOptions } from "../types.js";

export function createElements(
  handlerOptions: CreateElementWithReactOptions &
    Pick<CreateHandlerOptions, "build" | "logger" | "onEvent">
) {
  try {
    if(!handlerOptions.url) {
      throw new Error("url is required");
    }

    if(!handlerOptions.moduleRootPath) {
      throw new Error("moduleRootPath is required");
    }

    const element = createElementWithReact(React, handlerOptions);

    // Return success result with components
    return {
      type: "success" as const,
      elements: element,
    };
  } catch (error) {
    // Return error result
    return {
      type: "error" as const,
      error: error as Error,
    };
  }
}
