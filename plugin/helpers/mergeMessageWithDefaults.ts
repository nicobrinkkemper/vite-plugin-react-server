import { DEFAULT_CONFIG } from "../config/index.js";
import type { ResolvedUserOptions } from "../types.js";
import type { RscRenderMessage } from "../worker/rsc/types.js";

/**
 * Merges message values with defaults, prioritizing message values
 * 
 * @param message - The RSC render message containing values to merge
 * @param defaultUserOptions - Default user options to fall back to
 * @returns Merged values with message values taking precedence
 */
export function mergeMessageWithDefaults(
  message: RscRenderMessage,
  defaultUserOptions: Partial<ResolvedUserOptions> = {}
) {
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
    moduleBase = defaultUserOptions.moduleBase || "",
    serverPipeableStreamOptions = defaultUserOptions.serverPipeableStreamOptions,
    verbose = defaultUserOptions.verbose ?? DEFAULT_CONFIG.VERBOSE,
    build = defaultUserOptions.build ?? DEFAULT_CONFIG.BUILD,
    rscTimeout = defaultUserOptions.rscTimeout ?? DEFAULT_CONFIG.RSC_TIMEOUT,
    panicThreshold = defaultUserOptions.panicThreshold ??
      DEFAULT_CONFIG.PANIC_THRESHOLD,
    publicOrigin = defaultUserOptions.publicOrigin ??
      DEFAULT_CONFIG.PUBLIC_ORIGIN,
    HtmlComponent: _htmlComponent, // Ignore message component, use parameter
    RootComponent: _rootComponent, // Ignore message component, use parameter
    ...rest
  } = message;

  return {
    type,
    id,
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
    ...rest,
  };
}
