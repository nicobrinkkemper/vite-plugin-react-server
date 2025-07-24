import type { ReactStreamHandlerFn } from "../types.js";
import { createRscStream } from "./createRscStream.server.js";
import { PassThrough } from "node:stream";
import { routeToURL } from "../utils/routeToURL.js";
import { handleError } from "../error/index.js";

export type CreateHandlerReturn =
  | {
      type: "success";
      stream: PassThrough;
      controller: { abort: (reason: unknown) => void; destroy: () => void };
      error?: never;
    }
  | {
      type: "error";
      error: unknown;
      stream?: never;
      controller?: never;
    };

export type CreateHandlerFn = ReactStreamHandlerFn<
  "url",
  CreateHandlerReturn
>;

export const createHandler: CreateHandlerFn = (handlerOptions) => {
  try {
    const url =
      handlerOptions.url ||
      routeToURL(
        handlerOptions.route,
        handlerOptions.moduleBaseURL,
        handlerOptions.build.rscOutputPath
      );
    const passThrough = new PassThrough();
    const streamResult = createRscStream({
      ...handlerOptions,
      url,
      onEvent: handlerOptions.onEvent,
      cssFiles: handlerOptions.cssFiles,
      PageComponent: handlerOptions.PageComponent,
      pageProps: handlerOptions.pageProps,
      panicThreshold: handlerOptions.panicThreshold,
    }, passThrough);

    if (streamResult.type === "error") {
      throw streamResult.error;
    }

    return {
      type: "success",
      stream: passThrough,
      controller: streamResult.controller,
    };
  } catch (error) {
      return {
        type: "error",
        error: handleError({
          error: error,
          logger: handlerOptions.logger,
          panicThreshold: handlerOptions.panicThreshold,
          context: `CreateHandler Setup Error (${handlerOptions.route})`,
      }) ?? error,
    };
  }
};
