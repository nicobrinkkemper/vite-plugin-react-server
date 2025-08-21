import { DEFAULT_CONFIG } from "../../config/index.js";
import type {
  CssContent,
  HtmlComponentType,
  PageComponentType,
  PagePropOpt,
  ResolvedUserOptions,
  RootComponentType,
} from "../../types.js";
import { createRscWorkerLoader } from "./createRscWorkerLoader.js";
import type { Logger } from "vite";
import { routeToURL } from "../../utils/routeToURL.js";
import type { RscRenderMessage } from "./types.js";
import type { React } from "../../vendor/vendor.server.js";
import { Html as DefaultHtml } from "../../components/html.js";
import { Root as DefaultRoot } from "../../components/root.js";

export function hydrateRscRenderMessage(
  {
    message,
    pageProps,
    PageComponent,
    RootComponent,
    HtmlComponent,
    userOptions,
    logger,
    hmrState,
    manifest,
    cssFiles,
    globalCss,
  }: {
    message: RscRenderMessage;
    pageProps: PagePropOpt;
    PageComponent: PageComponentType<PagePropOpt>;
    RootComponent: RootComponentType | typeof React.Fragment;
    HtmlComponent: HtmlComponentType | typeof React.Fragment | undefined;
    userOptions: ResolvedUserOptions;
    logger: Logger;
    hmrState: Map<string, { invalidated: boolean }>;
    manifest: Record<string, { file: string } | string>;
    cssFiles: Map<string, CssContent>;
    globalCss: Map<string, CssContent>;
  },
  // defaults
  { userOptions: defaultUserOptions = {} }: any = {}
) {
  const url =
    message.url ??
    routeToURL(
      message.route,
      userOptions.moduleBaseURL,
      userOptions.build?.rscOutputPath ?? DEFAULT_CONFIG.BUILD.rscOutputPath
    );
  const {
    type = "RSC_RENDER",
    id,
    route,
    pagePath,
    propsPath,
    rootPath,
    htmlPath,
    rootExportName = defaultUserOptions.rootExportName ??
      DEFAULT_CONFIG.ROOT_EXPORT_NAME,
    htmlExportName = defaultUserOptions.htmlExportName ??
      DEFAULT_CONFIG.HTML_EXPORT_NAME,
    pageExportName = defaultUserOptions.pageExportName ??
      DEFAULT_CONFIG.PAGE_EXPORT_NAME,
    propsExportName = defaultUserOptions.propsExportName ??
      DEFAULT_CONFIG.PROPS_EXPORT_NAME,
    projectRoot = defaultUserOptions.projectRoot ?? process.cwd(),
    moduleRootPath = defaultUserOptions.moduleRootPath ?? "",
    moduleBaseURL = defaultUserOptions.moduleBaseURL ??
      DEFAULT_CONFIG.MODULE_BASE_URL,
    moduleBasePath = defaultUserOptions.moduleBasePath ??
      DEFAULT_CONFIG.MODULE_BASE_PATH,
    moduleBase = defaultUserOptions.moduleBase,
    serverPipeableStreamOptions = defaultUserOptions.serverPipeableStreamOptions,
    
    verbose = defaultUserOptions.verbose ?? DEFAULT_CONFIG.VERBOSE,
    build = defaultUserOptions.build ?? DEFAULT_CONFIG.BUILD,
    rscTimeout = defaultUserOptions.rscTimeout ?? DEFAULT_CONFIG.RSC_TIMEOUT,
    panicThreshold = defaultUserOptions.panicThreshold ??
      DEFAULT_CONFIG.PANIC_THRESHOLD,
    publicOrigin = defaultUserOptions.publicOrigin ??
      DEFAULT_CONFIG.PUBLIC_ORIGIN,
    HtmlComponent: _htmlComponent,
    RootComponent: _rootComponent,
    ...rest
  } = message;
  if (type !== "RSC_RENDER") {
    throw new Error("Invalid message type");
  }

  // Create page-specific CSS collection to prevent CSS sharing between pages
  const pageCssFiles = new Map<string, CssContent>();

  // Add any CSS files from the message to the page-specific collection
  if (cssFiles && cssFiles.size > 0) {
    for (const [route, cssContent] of cssFiles.entries()) {
      pageCssFiles.set(route, cssContent);
    }
  }

  if (verbose) {
    logger.info(`[rsc-worker:${route}] Starting render for route: ${route}`);
  }

  return {
    type,
    id,
    url,
    route,
    pagePath,
    propsPath,
    rootPath,
    htmlPath,
    rootExportName,
    htmlExportName,
    pageExportName,
    propsExportName,
    projectRoot,
    moduleRootPath,
    moduleBaseURL,
    moduleBasePath,
    moduleBase,
    serverPipeableStreamOptions,
    verbose,
    build,
    rscTimeout,
    panicThreshold,
    publicOrigin,
    pageProps,
    RootComponent: RootComponent || DefaultRoot, // Use function parameter, not message value
    HtmlComponent: HtmlComponent || DefaultHtml, // Use default HTML component if undefined
    PageComponent,
    loader: createRscWorkerLoader({
      verbose,
      logger,
      hmrState: hmrState,
      projectRoot,
      build,
      manifest: manifest,
    }),
    normalizer: userOptions.normalizer,
    moduleID: userOptions.moduleID,
    logger,
    autoDiscover: userOptions.autoDiscover,
    onMetrics: undefined,
    ...rest,
    // Override with function parameters (after spread to ensure they take precedence)
    cssFiles,
    globalCss,
  };
}
