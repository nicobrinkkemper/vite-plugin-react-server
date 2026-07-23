import { PassThrough } from "node:stream";
import type { CreateHandlerOptions } from "../types.js";
import { resolveFlightRenderer } from "./flightRenderer.server.js";
import type { StreamHandlers } from "../worker/types.js";
import type { RenderToPipeableStreamOptions } from "react-server-dom-esm/server.node";

/**
 * Server-specific React stream creation with error handling
 * This function is only available in server environments
 */
export function createReactStream(
  element: React.ReactElement,
  options: CreateHandlerOptions,
  handlers: Pick<StreamHandlers<"server">, "onError" | "onPostpone" | "onEnd" | "onData">
): PassThrough {
  const { route, verbose, logger } = options;

  // Create the React stream using ReactDOMServer.renderToPipeableStream
  const streamOptions: RenderToPipeableStreamOptions = {
    ...options.serverPipeableStreamOptions,
    onError: (error: unknown) => {
      if (verbose) {
        logger?.error(
          `[createReactStream:${route}] React stream error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      if (typeof handlers.onError === "function") {
        handlers.onError(route, error);
      }
      if(typeof options?.serverPipeableStreamOptions?.onError === "function") { 
        options.serverPipeableStreamOptions.onError(error);
      }
    },
    onPostpone: (reason: string) => {
      if (verbose) {
        logger?.info(`[createReactStream:${route}] Stream postponed: ${reason}`);
      }
      if(typeof handlers.onPostpone === "function") {
        handlers.onPostpone(route, reason);
      }
      if(typeof options?.serverPipeableStreamOptions?.onPostpone === "function") { 
        options.serverPipeableStreamOptions.onPostpone(reason);
      }
    },
  };

  if (verbose) {
    logger?.info(`[createReactStream:${route}] Creating React stream for element`);
  }

  const { pipe } = resolveFlightRenderer(options).render(
    element,
    streamOptions
  );

  if (verbose) {
    logger?.info(`[createReactStream:${route}] React stream created, got pipe function`);
  }

  // Create a PassThrough stream that can be consumed
  const passThrough = new PassThrough();
  if (typeof handlers.onError === "function") {
    passThrough.on("error", (error: unknown) => {
      if (verbose) {
        logger?.error(
          `[createReactStream:${route}] PassThrough stream error: ${error}`
        );
      }
      if (typeof handlers.onError === "function") {
        handlers.onError(route, error);
      }
    });
  }
  // Pipe the React stream to our PassThrough
  if (verbose) {
    logger?.info(`[createReactStream:${route}] Piping React stream to PassThrough`);
  }
  pipe(passThrough);

  if (verbose) {
    logger?.info(`[createReactStream:${route}] React stream piped, returning PassThrough`);
  }

  return passThrough;
}
