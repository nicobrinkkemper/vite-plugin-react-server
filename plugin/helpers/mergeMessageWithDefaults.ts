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
  // Extract options from the nested structure
  const options = message.options || {};
  
  const {
    type = "INIT",
    id,
    route = options.route,
    pagePath = options.pagePath,
    propsPath = options.propsPath,
    rootPath = options.rootPath,
    htmlPath = options.htmlPath,
    rootExportName = options.rootExportName ?? defaultUserOptions.rootExportName ??
      DEFAULT_CONFIG.ROOT_EXPORT_NAME,
    htmlExportName = options.htmlExportName ?? defaultUserOptions.htmlExportName ??
      DEFAULT_CONFIG.HTML_EXPORT_NAME,
    pageExportName = options.pageExportName ?? defaultUserOptions.pageExportName ??
      DEFAULT_CONFIG.PAGE_EXPORT_NAME,
    propsExportName = options.propsExportName ?? defaultUserOptions.propsExportName ??
      DEFAULT_CONFIG.PROPS_EXPORT_NAME,
    projectRoot = options.projectRoot ?? defaultUserOptions.projectRoot ?? process.cwd(),
    moduleRootPath = options.moduleRootPath ?? defaultUserOptions.moduleRootPath ?? "",
    moduleBaseURL = options.moduleBaseURL ?? defaultUserOptions.moduleBaseURL ??
      DEFAULT_CONFIG.MODULE_BASE_URL,
    moduleBasePath = options.moduleBasePath ?? defaultUserOptions.moduleBasePath ??
      DEFAULT_CONFIG.MODULE_BASE_PATH,
    moduleBase = options.moduleBase ?? defaultUserOptions.moduleBase ?? "",
    serverPipeableStreamOptions = options.serverPipeableStreamOptions ?? defaultUserOptions.serverPipeableStreamOptions,
    verbose = options.verbose ?? defaultUserOptions.verbose ?? DEFAULT_CONFIG.VERBOSE,
    build = options.build ?? defaultUserOptions.build ?? DEFAULT_CONFIG.BUILD,
    rscTimeout = options.rscTimeout ?? defaultUserOptions.rscTimeout ?? DEFAULT_CONFIG.RSC_TIMEOUT,
    panicThreshold = options.panicThreshold ?? defaultUserOptions.panicThreshold ??
      DEFAULT_CONFIG.PANIC_THRESHOLD,
    publicOrigin = options.publicOrigin ?? defaultUserOptions.publicOrigin ??
      DEFAULT_CONFIG.PUBLIC_ORIGIN,
    HtmlComponent: _htmlComponent = options.HtmlComponent, // Ignore message component, use parameter
    RootComponent: _rootComponent = options.RootComponent, // Ignore message component, use parameter
    ...rest
  } = { ...message, ...options };

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
