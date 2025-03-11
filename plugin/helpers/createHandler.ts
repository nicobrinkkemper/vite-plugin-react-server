import type { PipeableStream } from "react-dom/server";
import { resolvePage } from "../resolvePage.js";
import { resolveProps } from "../resolveProps.js";
import type { CreateHandlerOptions, CssContent } from "../types.js";
import { createRscStream } from "./createRscStream.js";
type CreateHandlerResult =
  | {
      type: "success";
      controller: AbortController;
      stream: PipeableStream;
      assets: any;
      route: string;
    }
  | { type: "error"; error: Error }
  | { type: "skip" };

interface HandlerAssets {
  css: (string | CssContent)[];
  bootstrapModules: string[];
}

export async function createHandler<T>({
  getCss,
  root,
  cssFiles = [],
  cssModules = new Map<string, string | CssContent>(),
  onCssFile,
  logger,
  loader,
  Html,
  CssCollector,
  pagePath,
  propsPath,
  pageExportName,
  propsExportName,
  inlineCss,
  moduleBase,
  preserveModulesRoot: _preserveModulesRoot,
  moduleBasePath,
  moduleRootPath,
  moduleBaseURL,
  route,
  pipableStreamOptions,
}: CreateHandlerOptions<T>): Promise<CreateHandlerResult> {
  const controller = new AbortController();

  const loadWithCss = async (id: string) => {
    try {
      const mod = await loader(id);
      const pageCss = await Promise.resolve(getCss(id));
      Array.from(pageCss.entries()).forEach(([css, linkOrContent]) => {
        cssModules.set(css, linkOrContent);
        // Notify about new CSS file if callback exists
        if (typeof onCssFile === "function") {
          onCssFile(css, id);
        }
      });
      return mod as Record<string, any>;
    } catch (e: any) {
      if (e.message?.includes("module runner has been closed")) {
        return { type: "skip" } as Record<string, any>;
      } else {
        return { type: "error", error: e } as Record<string, any>;
      }
    }
  };

  const PropsModule = await resolveProps({
    propsModule: propsPath
      ? await loadWithCss(propsPath)
      : { [propsExportName]: (url: string) => ({url}) },
    path: String(propsPath),
    exportName: propsExportName,
    url: route,
  });
  if (PropsModule.type !== "success") {
    return PropsModule;
  }
  const PageModule = await resolvePage({
    pageModule: pagePath
      ? await loadWithCss(pagePath)
      : { [pageExportName]: () => null },
    path: String(pagePath),
    exportName: pageExportName,
    url: route,
  });
  if (PageModule.type !== "success") {
    return PageModule;
  }

  // Add any additional CSS files
  if (cssFiles) {
    cssFiles.forEach((css) => cssModules.set(typeof css === "string" ? css : css.path, css));
    cssFiles = Array.from(cssModules.values());
  }
  const url =
    typeof moduleBaseURL === "string" && moduleBaseURL !== ""
      ? new URL(route, moduleBaseURL).href
      : route;
  const stream = createRscStream({
    Html: Html,
    CssCollector: CssCollector,
    Page: PageModule[pageExportName as keyof typeof PageModule],
    props: PropsModule[propsExportName as keyof typeof PropsModule],
    moduleBase: moduleBase,
    moduleRootPath: moduleRootPath,
    moduleBasePath: moduleBasePath,
    moduleBaseURL: moduleBaseURL,
    logger: logger,
    cssFiles: Array.from(cssModules.values()),
    route,
    url,
    pipableStreamOptions: pipableStreamOptions,
    htmlProps: {},
    root: root,
    loader: loader,
    inlineCss: inlineCss,
  });

  if (!stream) {
    return { type: "skip" as const };
  }

  const assets: HandlerAssets = {
    css: cssFiles,
    bootstrapModules: pipableStreamOptions?.bootstrapModules ?? [],
  };
  return {
    type: "success",
    controller,
    stream,
    assets,
    route: route,
  };
}
