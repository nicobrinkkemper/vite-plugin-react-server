import type {
  ReactStreamHandlerFn,
} from "../types.js";
import { createRscStream } from "./createRscStream.js";
import type { ErrorInfo } from "react";
import { toError } from "../error/toError.js";
import type { PassThrough } from "node:stream";

export type CreateHandlerReturn =
  | {
      type: "success";
      stream: PassThrough;
      error?: never;
    }
  | {
      type: "error";
      error: Error;
      stream?: never;
    };

export type CreateHandlerFn = ReactStreamHandlerFn<CreateHandlerReturn>

export const createHandler: CreateHandlerFn = ((handlerOptions) => {
  if (!handlerOptions.PageComponent) {
    throw new Error("PageComponent is required");
  }
  try {
    const adaptedOnEvent = (
      event: "error" | "postpone",
      data: {
        error?: Error | null;
        errorInfo?: ErrorInfo;
        reason?: string | null;
      }
    ) => {
      if (event === "error") {
        handlerOptions.onEvent?.({
          type: "route.error",
          data: {
            route: handlerOptions.route,
            ...data,
          },
        });
      } else if (event === "postpone") {
        handlerOptions.onEvent?.({
          type: "route.postpone",
          data: {
            route: handlerOptions.route,
            reason: data.reason,
            ...data,
          },
        });
      }
    };

    const streamResult = createRscStream({
      ...handlerOptions,
      onEvent: adaptedOnEvent,
      cssFiles: handlerOptions.cssFiles,  
      PageComponent: handlerOptions.PageComponent,
      pageProps: handlerOptions.pageProps,
    });

    if (streamResult.type === "error") {
      handlerOptions.onEvent?.({
        type: "route.error",
        data: {
          route: handlerOptions.route,
          error: streamResult.error,
        },
      });
      throw streamResult.error;
    }

    return {
      type: "success",
      stream: streamResult.stream,
    };
  } catch (error) {
    const err = toError(error);
    handlerOptions.onEvent?.({
      type: "route.error",
      data: {
        route: handlerOptions.route,
        error: err,
      },
    });
    return {
      type: "error",
      error: err,
    };
  }
})
