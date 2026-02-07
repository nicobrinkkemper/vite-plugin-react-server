import type { CreateHandlerOptions } from "../types.js";
import { handleError } from "../error/handleError.js";

export function createMainThreadHandlers(
  handlerOptions: CreateHandlerOptions,
  onError?: (error: Error, isPanic: boolean) => void
) {
  return {
    onError: (_id: string, error: unknown, context?: { route?: string; context?: string }) => {
      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[createMainThreadHandlers] onError called for route ${handlerOptions.route}: ${error}`
        );
      }
      
      const originalError = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
      const panicError = handleError({
        error: originalError,
        critical: false,
        logger: handlerOptions.logger,
        panicThreshold: handlerOptions.panicThreshold,
        context: `${context?.context || "Unknown"} for route ${handlerOptions.route}`,
      });
      
      if (handlerOptions.verbose) {
        handlerOptions.logger?.info(
          `[createMainThreadHandlers] Calling onError callback for route ${handlerOptions.route} with panicError: ${!!panicError}`
        );
      }
      
      // Call the callback with the error and panic status
      onError?.(panicError || originalError, !!panicError);
    },
    onData: (_id: string, _data: Uint8Array) => {
      // No-op for main thread
    },
    onEnd: (_id: string) => {
      // No-op for main thread
    },
    onPostpone: (_id: string, _reason: string) => {
      // No-op for main thread
    },
  };
}
