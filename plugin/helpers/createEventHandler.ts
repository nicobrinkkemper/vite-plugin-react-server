import type { Logger } from "vite";
import { handleError } from "../error/handleError.js";
import type { PluginEvent, ResolvedUserOptions } from "../types.js";

/**
 * Creates a unified event handler that can be used by both static and server plugins.
 * This handler converts React stream events into plugin events and provides a consistent
 * interface for event handling across the codebase.
 *
 * @param options Options for the event handler
 * @returns A function that handles both React stream events and plugin events
 */
export const createEventHandler: CreateEventHandlerFn =
  function _createEventHandler(options) {
    const { onEvent, logger, panicThreshold, verbose } = options;
    return async function handleEvent(event: PluginEvent) {
      try {
        if (verbose) {
          logger.info(`[CreateEventHandler] Event: ${event.type}`);
        }
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
            return {
              type: "success",
              data: await result,
            };
          }
        }
      } catch (error) {
        const panicError = handleError({
          error: error,
          logger: logger,
          panicThreshold: panicThreshold,
          context: `onEvent(${event.type})`,
        });
        if (panicError != null) {
          return {
            type: "error",
            error: panicError,
          };
        }
        return {
          type: "error",
          error: error as Error,
        };
      }
      return { type: "success" };
    };
  };

// for helpers, we combine both the type and the function into a single file
// so they are portable packages on a file-by-file basis
export type EventHandlerOptions = {
  onEvent?: (
    event: PluginEvent
  ) =>
    | void
    | Promise<void>
    | Promise<
        { type: "success"; data?: unknown } | { type: "error"; error?: unknown }
      >;
  logger: Logger;
  panicThreshold: ResolvedUserOptions["panicThreshold"];
  verbose: boolean;
};

export type CreateEventHandlerFn = (
  options: EventHandlerOptions
) => (
  event: PluginEvent
) => Promise<
  { type: "success"; data?: unknown } | { type: "error"; error?: unknown }
>;