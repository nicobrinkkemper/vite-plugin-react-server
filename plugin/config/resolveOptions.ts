import type { StreamPluginOptions, ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "./defaults.js";

export const resolveOptions = (
  options: StreamPluginOptions
): { type: "success"; userOptions: ResolvedUserOptions } | { type: "error"; error: Error } => {
  const projectRoot = options.projectRoot ?? process.cwd();

  const build = options.build ?? DEFAULT_CONFIG.BUILD;

  try {
    return {
      type: "success",
      userOptions: {
        projectRoot,
        moduleBase: options.moduleBase ?? DEFAULT_CONFIG.MODULE_BASE,
        moduleBasePath: options.moduleBasePath ?? DEFAULT_CONFIG.MODULE_BASE_PATH,
        moduleBaseURL: options.moduleBaseURL ?? DEFAULT_CONFIG.MODULE_BASE_URL,
        build: {
          pages: build.pages ?? DEFAULT_CONFIG.BUILD.pages,
          client: build.client ?? DEFAULT_CONFIG.BUILD.client,
          server: build.server ?? DEFAULT_CONFIG.BUILD.server,
          static: build.static ?? DEFAULT_CONFIG.BUILD.static,
        },
        Page: options.Page ?? DEFAULT_CONFIG.PAGE,
        props: options.props ?? DEFAULT_CONFIG.PROPS,
        Html: options.Html ?? DEFAULT_CONFIG.HTML,
        pageExportName: options.pageExportName ?? DEFAULT_CONFIG.PAGE_EXPORT,
        propsExportName: options.propsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT,
        collectCss: options.collectCss ?? DEFAULT_CONFIG.COLLECT_CSS,
        collectAssets: options.collectAssets ?? DEFAULT_CONFIG.COLLECT_ASSETS,
        assetsDir: options.assetsDir ?? DEFAULT_CONFIG.CLIENT_ASSETS_DIR,
        htmlWorkerPath: options.htmlWorkerPath ?? DEFAULT_CONFIG.HTML_WORKER_PATH,
        rscWorkerPath: options.rscWorkerPath ?? DEFAULT_CONFIG.RSC_WORKER_PATH,
        loaderPath: options.loaderPath ?? DEFAULT_CONFIG.LOADER_PATH,
        clientEntry: options.clientEntry ?? DEFAULT_CONFIG.CLIENT_ENTRY,
        serverEntry: options.serverEntry ?? DEFAULT_CONFIG.SERVER_ENTRY,
        moduleBaseExceptions: options.moduleBaseExceptions ?? [],
        autoDiscover: {
            pagePattern: options.autoDiscover?.pagePattern ?? DEFAULT_CONFIG.AUTO_DISCOVER.pagePattern,
            propsPattern: options.autoDiscover?.propsPattern ?? DEFAULT_CONFIG.AUTO_DISCOVER.propsPattern,
            clientComponents: options.autoDiscover?.clientComponents ?? DEFAULT_CONFIG.AUTO_DISCOVER.clientComponents,
            serverFunctions: options.autoDiscover?.serverFunctions ?? DEFAULT_CONFIG.AUTO_DISCOVER.serverFunctions,
        },
      }
    };
  } catch (error) {
    return {
      type: "error",
      error: error instanceof Error ? error : new Error('Failed to resolve options')
    };
  }
}; 