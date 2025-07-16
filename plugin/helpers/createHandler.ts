import type {
  ReactStreamHandlerFn,
} from "../types.js";
import { createRscStream } from "./createRscStream.js";
import type { ErrorInfo } from "react";
import { toError } from "../error/toError.js";
import type { PassThrough } from "node:stream";
import { routeToURL } from "../utils/routeToURL.js";
import { logError } from "../error/logError.js";
import { getNodeEnv } from "../getNodeEnv.js";

export type CreateHandlerReturn =
  | {
      type: "success";
      stream: PassThrough;
      controller: { abort: () => void; destroy: () => void };
      error?: never;
    }
  | {
      type: "error";
      error: Error;
      stream?: never;
      controller?: never;
    };

export type CreateHandlerFn = ReactStreamHandlerFn<"url" | "onEvent", CreateHandlerReturn>

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
        // Use logError utility for consistent error logging
        if (data.error && handlerOptions.logger) {
          logError(data.error, handlerOptions.logger, getNodeEnv());
          if(data.errorInfo) {
            logError(data.errorInfo, handlerOptions.logger, getNodeEnv()); 
          } 
        }
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

    const url = handlerOptions.url || routeToURL(handlerOptions.route, handlerOptions.moduleBaseURL, handlerOptions.build.rscOutputPath);

    const streamResult = createRscStream({
      ...handlerOptions,
      url,
      onEvent: adaptedOnEvent,
      cssFiles: handlerOptions.cssFiles,  
      PageComponent: handlerOptions.PageComponent,
      pageProps: handlerOptions.pageProps,
    });

    if (streamResult.type === "error") {
      return {
        type: "error",
        error: streamResult.error,
      };
    }

    return {
      type: "success",
      stream: streamResult.stream,
      controller: streamResult.controller,
    };
  } catch (error) {
    const err = toError(error);
    return {
      type: "error",
      error: err,
    };
  }
})
