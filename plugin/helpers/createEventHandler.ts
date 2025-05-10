import type { PluginEvent } from "../types.js";

/**
 * Creates a unified event handler that can be used by both static and server plugins.
 * This handler converts React stream events into plugin events and provides a consistent
 * interface for event handling across the codebase.
 * 
 * @param options Options for the event handler
 * @returns A function that handles both React stream events and plugin events
 */
export interface EventHandlerOptions {
  onEvent?: (event: PluginEvent) => void | Promise<void>;
}

export function createEventHandler(onEvent : EventHandlerOptions['onEvent']) {
  return async function handleEvent(event: PluginEvent) {
    // Call the user's event handler if provided
    if (onEvent) {
      const result = onEvent(event);
      if (!result) {
        return {
          type: "success",
          data: undefined,
        };
      }
      if (result instanceof Promise) {
        try {
          const awaited = await result;
          return {
            type: "success",
            data: awaited,
          };
        } catch (error) {
          return {
            type: "error",
            error: error as Error,
          };
        }
      }
    }

    return event;
  };
} 