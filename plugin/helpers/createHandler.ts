import type { CreateHandlerOptions, InlineCssOpt } from "../types.js";
import type { PagePropOpt } from "../../server.js";
import { createRscStream } from "./createRscStream.js";

export function createHandler<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(handlerOptions: CreateHandlerOptions<T, InlineCSS>) {
  if (!handlerOptions.PageComponent) {
    throw new Error("PageComponent is required");
  }

  const onEvent = (type: string, data: any) =>
    handlerOptions.onEvent?.({
      type: `route.${type}` as any,
      data: { route: handlerOptions.route, ...data },
    });

  const streamResult = createRscStream({
    ...handlerOptions,
    onEvent: (event, data) => onEvent(event, data),
    cssFiles: handlerOptions.cssFiles,
    PageComponent: handlerOptions.PageComponent as any,
    pageProps: handlerOptions.pageProps,
  });

  if (streamResult.type === "error") {
    onEvent("error", { error: streamResult.error });
  }

  return streamResult;
}
