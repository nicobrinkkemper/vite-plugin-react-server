import type { CreateHandlerOptions, InlineCssOpt } from "../types.js";
import type { PagePropOpt } from "../../server.js";
import { createRscStream } from "./createRscStream.js";
import type { ErrorInfo } from "react";
import { toError } from "../error/toError.js";

export function createHandler<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt,
  N1 extends string = "Page",
  N2 extends string = "props",
  ID1 extends string = string,
  ID2 extends string | undefined = ID1,
>(handlerOptions: CreateHandlerOptions<T, N1, N2, ID1, ID2, InlineCSS>) {
  if (!handlerOptions.PageComponent) {
    throw new Error("PageComponent is required");
  }
  try {
    const adaptedOnEvent = (event: "error" | "postpone", data: {
      error?: Error | null;
      errorInfo?: ErrorInfo;
      reason?: string | null;
    }) => {
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
}
