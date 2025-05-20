import type { CreateHandlerOptions } from "../types.js";
import { createRscStream } from "./createRscStream.js";

export async function createHandler<
  T = unknown,
  InlineCSS extends boolean | undefined = undefined
>(handlerOptions: CreateHandlerOptions<T, React.ComponentType<T>, InlineCSS>) {
  if (!handlerOptions.PageComponent) {
    throw new Error("PageComponent is required");
  }
  try {
    const adaptedOnEvent = (event: "error" | "postpone", data: any) => {
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
            ...data,
          },
        });
      }
    };

    const streamResult = createRscStream({
      ...handlerOptions,
      onEvent: adaptedOnEvent,
      cssFiles: handlerOptions.cssFiles,
      PageComponent: handlerOptions.PageComponent as any,
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
    handlerOptions.onEvent?.({
      type: "route.error",
      data: {
        route: handlerOptions.route,
        error,
      },
    });
    return {
      type: "error",
      error: error as Error,
    };
  }
}
