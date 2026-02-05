import { React, ReactDOMServer } from "../vendor/vendor.server.js";
import type {
  CreateHandlerOptions,
  PagePropOpt,
} from "../types.js";

export function createRscStream<T extends PagePropOpt = PagePropOpt>({
  Html = React.Fragment,
  PageComponent,
  pageProps,
  moduleBase,
  moduleRootPath,
  moduleBasePath,
  moduleBaseURL,
  cssFiles = new Map(),
  globalCss = new Map(),
  route,
  pipeableStreamOptions,
  CssCollector,
  manifest,
  onEvent,
  projectRoot,
}: Pick<
  CreateHandlerOptions<T>,
  | "Html"
  | "PageComponent"
  | "pageProps"
  | "moduleBase"
  | "moduleRootPath"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "cssFiles"
  | "route"
  | "pipeableStreamOptions"
  | "CssCollector"
  | "globalCss"
  | "manifest"
  | "projectRoot"
> & {
  onEvent?: (event: "error" | "postpone", data: any) => void;
}):
  | { type: "success"; stream: any }
  | { type: "error"; error: Error } {
  if (!PageComponent) {
    return { type: "error", error: new Error("PageComponent is required") };
  }

  try {
    const htmlIsFragment = Html === React.Fragment;
    const url = route.startsWith(moduleBaseURL) ? route : moduleBaseURL + route;

    const elements = htmlIsFragment ? (
      <CssCollector
        key={route}
        as={React.Fragment}
        cssFiles={cssFiles}
        pageProps={pageProps}
        Page={PageComponent}
      />
    ) : (
      <Html
        moduleBase={moduleBase}
        moduleBaseURL={moduleBaseURL}
        moduleBasePath={moduleBasePath}
        moduleRootPath={moduleRootPath}
        projectRoot={projectRoot}
        url={url}
        route={route}
        pageProps={pageProps}
        cssFiles={cssFiles}
        globalCss={globalCss}
        CssCollector={CssCollector}
        manifest={manifest}
        Page={PageComponent}
        as={"div"}
      />
    );

    const stream = ReactDOMServer.renderToPipeableStream(
      elements,
      moduleBasePath,
      {
        ...pipeableStreamOptions,
        moduleBaseURL,
        onError(error: Error, errorInfo: any) {
          onEvent?.("error", { route, error, errorInfo });
        },
        onPostpone(reason: string) {
          onEvent?.("postpone", { route, reason });
        },
      }
    );

    return { type: "success", stream };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onEvent?.("error", { route, error: err });
    return { type: "error", error: err };
  }
}
