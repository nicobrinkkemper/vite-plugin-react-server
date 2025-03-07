import type { PipeableStream } from "react-dom/server";
import { createLogger } from "vite";
import {
  collectManifestClientFiles,
  collectModuleGraphCss,
} from "../collect-manifest-client-files.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { resolvePage } from "../resolvePage.js";
import { resolveProps } from "../resolveProps.js";
import type { CheckFilesExistReturn, CreateHandlerOptions, ResolvedUserOptions } from "../types.js";
import { createRscStream } from "./createRscStream.js";

type CreateHandlerResult = 
  | { type: "success"; controller: AbortController; stream: PipeableStream; assets: any; clientPath: string }
  | { type: "error"; error: Error }
  | { type: "skip" };

interface HandlerAssets {
  css: Set<string>;
  clientPath: string;
}

export async function createHandler<T>({
  url,
  urlMap,
  pluginOptions,
  streamOptions,
}: {
  url: string,
  urlMap: CheckFilesExistReturn['urlMap'],
  pluginOptions: ResolvedUserOptions,
  streamOptions: CreateHandlerOptions<T>
}): Promise<CreateHandlerResult> {
  const root = pluginOptions.projectRoot ?? process.cwd();

  const Html = pluginOptions.Html ?? DEFAULT_CONFIG.HTML;
  const pageExportName =
    pluginOptions.pageExportName ?? DEFAULT_CONFIG.PAGE_EXPORT_NAME;
  const propsExportName =
    pluginOptions.propsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT_NAME;
  const controller = new AbortController();

  const cssFiles = streamOptions.cssFiles;


  const cssModules = streamOptions.cssModules ?? new Set<string>();

  if (!(streamOptions.serverManifest || streamOptions.moduleGraph))
    throw new Error("Missing server manifest or moduleGraph, pass it to options.");

  const getCss = streamOptions.serverManifest
    ? (id: string) =>
        collectManifestClientFiles({
          manifest: streamOptions.serverManifest!,
          root: root,
          pagePath: id,
          onCss: streamOptions.onCssFile,
          moduleBase: pluginOptions.moduleBase,
          preserveModulesRoot: pluginOptions.build.preserveModulesRoot,
        }).cssFiles
    : (id: string) =>
        collectModuleGraphCss({
          moduleGraph: streamOptions.moduleGraph!,
          pagePath: id,
          onCss: streamOptions.onCssFile,
        });

  const loadWithCss = async (id: string, parentUrl: string) => {
    try {
      const mod = await streamOptions.loader(id);
      const pageCss = await Promise.resolve(getCss(id));
      Array.from(pageCss.keys()).forEach((css) => {
        cssModules.add(css);
        // Notify about new CSS file if callback exists
        if (streamOptions.onCssFile) {
          streamOptions.onCssFile(css, parentUrl);
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
    propsModule: await loadWithCss(urlMap.get(url)?.props ?? url, url),
    path: String(urlMap.get(url)?.props ?? url),
    exportName: propsExportName,
    url,
  });
  if (PropsModule.type !== "success") {
    return PropsModule
  }
  const PageModule = await resolvePage({
    pageModule: await loadWithCss(urlMap.get(url)?.page ?? url, url),
    path: String(urlMap.get(url)?.page ?? url),
    exportName: pageExportName,
    url,
  });
  if (PageModule.type !== "success") {
    return PageModule
  }

  // Add any additional CSS files
  if (streamOptions.cssFiles) {
    streamOptions.cssFiles.forEach((css) => cssModules.add(css));
  }
  const stream = createRscStream({
    Html: Html,
    Page: PageModule[pageExportName as keyof typeof PageModule],
    props: PropsModule[propsExportName as keyof typeof PropsModule],
    moduleBasePath: '',
    logger: streamOptions.logger ?? createLogger(),
    cssFiles: Array.from(cssModules),
    route: url,
    url,
    pipableStreamOptions: streamOptions.pipableStreamOptions,
    htmlProps: {
      pageProps: PropsModule[propsExportName as keyof typeof PropsModule],
      route: url,
      url: url,
    },
  });

  if (!stream) {
    return { type: "skip" as const };
  }

  const assets: HandlerAssets = {
    css: new Set(cssFiles ?? []),
    clientPath: urlMap.get(url)?.page ?? ''
  };

  return {
    type: "success",
    controller,
    stream,
    assets,
    clientPath: assets.clientPath,
  };
}
