import type { PreRenderedAsset } from "rollup";
import type { PreRenderedChunk } from "rollup";
import type { StreamPluginOptions, ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { createModuleIdGenerator } from "./createModuleIdGenerator.js";

const resolveAutoDiscoverMatcher = (
  options: undefined | string | RegExp | ((path: string) => boolean),
  fallback: RegExp | ((path: string) => boolean)
) => {
  if (!options) {
    if (typeof fallback === "function") {
      return fallback;
    } else {
      return (path: string) => fallback.test(path);
    }
  }
  if (typeof options === "string") {
    const matcher = new RegExp(options);
    return (path: string) => matcher.test(path);
  } else if (typeof options === "function") {
    return options;
  } else {
    return (path: string) => options.test(path);
  }
};

export const resolveOptions = (
  options: StreamPluginOptions,
  isClient: boolean = false
):
  | { type: "success"; userOptions: ResolvedUserOptions }
  | { type: "error"; error: Error } => {
  const projectRoot = options.projectRoot ?? process.cwd();
  const { pageExportName = DEFAULT_CONFIG.PAGE_EXPORT_NAME, propsExportName = DEFAULT_CONFIG.PROPS_EXPORT_NAME } = options;
  const pages =
    typeof options.build?.pages === "function"
      ? options.build.pages
      : Array.isArray(options.build?.pages)
      ? options.build.pages
      : DEFAULT_CONFIG.BUILD.pages;
  let client = options.build?.client ?? DEFAULT_CONFIG.BUILD.client;
  let server = options.build?.server ?? DEFAULT_CONFIG.BUILD.server;

  const api = options.build?.api ?? DEFAULT_CONFIG.BUILD.api;
  const staticBuild = options.build?.static ?? DEFAULT_CONFIG.BUILD.static;
  const outDir = options.build?.outDir ?? DEFAULT_CONFIG.BUILD.outDir;
  const assetsDir =
    options.build?.assetsDir ??
    `${DEFAULT_CONFIG.CLIENT_ASSETS_DIR}`;

  const ensureModuleBase = (n: string | null) => {
    if(!n) return '';
    return n.startsWith(moduleBase + "/") ? n.slice(moduleBase.length + 1) : n;
  }
  const hasWrongRoot = !projectRoot.startsWith('/')
  if(hasWrongRoot) {
    console.warn('projectRoot is not a full path', projectRoot);
  }
  const wrongRoot = !hasWrongRoot ? projectRoot.slice(1) : projectRoot;
  const ensureNoRoot = (n: string | null) => {
    if(!n) return '';
    if(n.startsWith(wrongRoot)) {
      return n.slice(wrongRoot.length + 1);
    }
    return n.startsWith(projectRoot + "/") ? n.slice(projectRoot.length + 1) : n;
  } 

  const testModulePattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.modulePattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.modulePattern
  );

  const testJson = resolveAutoDiscoverMatcher(
    options.autoDiscover?.jsonPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.jsonPattern
  );

  const testCss = resolveAutoDiscoverMatcher(
    options.autoDiscover?.cssPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.cssPattern
  );
  const testHtml = resolveAutoDiscoverMatcher(
    options.autoDiscover?.htmlPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.htmlPattern
  );
  const testClientComponents = resolveAutoDiscoverMatcher(
    options.autoDiscover?.clientComponents,
    DEFAULT_CONFIG.AUTO_DISCOVER.clientComponents
  );
  const testServerFunctions = resolveAutoDiscoverMatcher(
    options.autoDiscover?.serverFunctions,
    DEFAULT_CONFIG.AUTO_DISCOVER.serverFunctions
  );
  const testPropsPattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.propsPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.propsPattern
  );
  const testPagePattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.pagePattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.pagePattern
  );
  const testCssModule = resolveAutoDiscoverMatcher(
    options.autoDiscover?.cssModulePattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.cssModulePattern
  );
  const testVendor = resolveAutoDiscoverMatcher(
    options.autoDiscover?.vendorPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.vendorPattern
  );
  const preserveModulesRoot = options.build?.preserveModulesRoot ?? DEFAULT_CONFIG.BUILD.preserveModulesRoot;
  const hashOption = typeof options.build?.hash === "string" ? options.build.hash : DEFAULT_CONFIG.BUILD.hash
  const hashString = hashOption === '' ? '' : `-[${hashOption}]`;
  const hash = (n: string | null) => {
    if(!n) return '';
    if(hashString === '') return n;
    const extensionIndex = n.lastIndexOf('.') 
    if(extensionIndex !== -1) {
      // put hash between extension and filename
      const extension = n.slice(extensionIndex)
      const filename = n.slice(0, extensionIndex)
      return filename + hashString + extension;
    } else {
      return n + hashString;
    }
  }

  const getOutputPath = (n: string | null) => {
    if(!n) return '';
    // Remove src/ prefix if present
    const path = n.startsWith(moduleBase + "/")
      ? n.slice(moduleBase.length + 1)
      : n;

    if (testClientComponents(path)) {
      if(options.autoDiscover?.clientComponents && typeof options.autoDiscover.clientComponents !== "function") {
        // if it's not a function, use it as an option for replace
        return `${path.replace(options.autoDiscover.clientComponents, '.client.js')}`;
      } else {
        return `${path}.js`;
      }
    }
    if (testCss(path)) {
      if(options.autoDiscover?.cssPattern && typeof options.autoDiscover.cssPattern !== "function") {
        // if it's not a function, use it as an option for replace
        return `${path.replace(options.autoDiscover.cssPattern, '.js')}`;
      } else {
        return `${path.replace('.css.js', '.js')}`;
      }
    }
    if(testHtml(path)) {
      if(options.autoDiscover?.htmlPattern && typeof options.autoDiscover.htmlPattern !== "function") {
        // if it's not a function, use it as an option for replace
        return `${path.replace(options.autoDiscover.htmlPattern, '.js')}`;
      } else {
        return `${path.replace('.html', '.js')}`; 
      }
    }
    if(testJson(path)) {
      if(options.autoDiscover?.jsonPattern && typeof options.autoDiscover.jsonPattern !== "function") {
        // if it's not a function, use it as an option for replace
        return `${path.replace(options.autoDiscover.jsonPattern, '.js')}`;
      } else {
        return `${path}.js`; 
      }
    }
    if (testPropsPattern(path)) {
      if(options.autoDiscover?.propsPattern && typeof options.autoDiscover.propsPattern !== "function") {
        // if it's not a function, use it as an option for replace
        return `${path.replace(options.autoDiscover.propsPattern, 'props.js')}`;
      } else {
        return `${path}.js`; 
      }
    }
    if (testPagePattern(path)) {
      if(options.autoDiscover?.pagePattern && typeof options.autoDiscover.pagePattern !== "function") {
        // if it's not a function, use it as an option for replace
        return `${path.replace(options.autoDiscover.pagePattern, 'page.js')}`;
      } else {
        return `${path}.js`;
      }
    }
    if (testServerFunctions(path)) {
      return `${api}/${path}.js`; // 
    }
    if(testCssModule(path)) {
      if(options.autoDiscover?.cssModulePattern && typeof options.autoDiscover.cssModulePattern !== "function") {
        // if it's not a function, use it as an option for replace
        return `${path.replace(options.autoDiscover.cssModulePattern, '.js')}`;
      } else {
        return `${path.replace('.css.js', '.js')}`;
      }
    }
    if(testVendor(path)) {
      if(options.autoDiscover?.vendorPattern && typeof options.autoDiscover.vendorPattern !== "function") {
        // if it's not a function, use it as an option for replace
        return `${path.replace(options.autoDiscover.vendorPattern, 'vendor.js')}`;
      } else {
        return `vendor`;
      }
    }
    return `${path}.js`;
  };

  const entryFile = (n: PreRenderedChunk) => {
    if(testCss(n.name)) {
      // this is the css.js chunk for ssr, which (if we keep the .css) would go into client, this prevents that.
      const result = `${getOutputPath(ensureModuleBase(ensureNoRoot(n.name + '.js')))}`;
      return result;
    }
    const result = `${getOutputPath(ensureModuleBase(ensureNoRoot(n.name)))}`;
    return result;
  }

  const chunkFile = (n: PreRenderedChunk) => `${getOutputPath(ensureModuleBase(ensureNoRoot(n.name)))}`;

  const assetFile = (n: PreRenderedAsset) => `${getOutputPath(ensureModuleBase(ensureNoRoot(n.names[0])))}`;

  const build =
    typeof options.build === "object" && options.build !== null
      ? {
          pages,
          client,
          server,
          static: staticBuild,
          outDir,
          assetsDir,
          api,
          hash: hashOption,
          preserveModulesRoot,
          entryFile:
            typeof options.build?.entryFile === "function"
              ? options.build.entryFile
              : entryFile,
          chunkFile:
            typeof options.build?.chunkFile === "function"
              ? options.build.chunkFile
              : chunkFile,
          assetFile:
            typeof options.build?.assetFile === "function"
              ? options.build.assetFile
              : assetFile,
        }
      : {
          pages,
          client,
          server,
          static: staticBuild,
          outDir,
          assetsDir,
          api,
          hash: hashOption,
          preserveModulesRoot,
          entryFile,
          chunkFile,
          assetFile,
        };

  const moduleBase =
    typeof options.moduleBase === "string"
      ? options.moduleBase
      : DEFAULT_CONFIG.MODULE_BASE;
  const moduleBasePath =
    typeof options.moduleBasePath === "string"
      ? options.moduleBasePath
      : options.moduleBase.startsWith("/")
      ? options.moduleBase
      : "/" + options.moduleBase;
  const moduleBaseURL =
    typeof options.moduleBaseURL === "string"
      ? options.moduleBaseURL
      : moduleBasePath ?? DEFAULT_CONFIG.MODULE_BASE_URL;
  
  const autoDiscover = {
    modulePattern: testModulePattern,
    cssPattern: testCss,
    jsonPattern: testJson,
    clientComponents: testClientComponents,
    serverFunctions: testServerFunctions,
    propsPattern: testPropsPattern,
    pagePattern: testPagePattern,
    cssModulePattern: testCssModule,
    vendorPattern: testVendor,
  };

  const moduleId = typeof options.moduleId === "function" ? options.moduleId : createModuleIdGenerator({
    isProduction: process.env['NODE_ENV'] === "production",
    inputRoot: projectRoot,
    client: client,
    server: server,
    moduleBase: moduleBase,
    preserveModulesRoot: preserveModulesRoot,
    removeExtension: DEFAULT_CONFIG.FILE_REGEX,
    imports: {},
  });

  try {
    return {
      type: "success",
      userOptions: {
        projectRoot,
        moduleId: moduleId,
        moduleBase,
        moduleBasePath,
        moduleBaseURL,
        build: build,
        Page: options.Page ?? DEFAULT_CONFIG.PAGE,
        props: options.props ?? DEFAULT_CONFIG.PROPS,
        Html: options.Html ?? DEFAULT_CONFIG.HTML,
        pageExportName: pageExportName,
        propsExportName: propsExportName,
        collectCss: options.collectCss ?? DEFAULT_CONFIG.COLLECT_CSS,
        collectAssets: options.collectAssets ?? DEFAULT_CONFIG.COLLECT_ASSETS,
        htmlWorkerPath:
          options.htmlWorkerPath ?? DEFAULT_CONFIG.HTML_WORKER_PATH,
        rscWorkerPath: options.rscWorkerPath ?? DEFAULT_CONFIG.RSC_WORKER_PATH,
        loaderPath: options.loaderPath ?? DEFAULT_CONFIG.LOADER_PATH,
        clientEntry: options.clientEntry ?? DEFAULT_CONFIG.CLIENT_ENTRY,
        serverEntry: options.serverEntry ?? DEFAULT_CONFIG.SERVER_ENTRY,
        moduleBaseExceptions: options.moduleBaseExceptions ?? [],
        autoDiscover: autoDiscover,
        pipableStreamOptions: options.pipableStreamOptions ?? {
          bootstrapModules: [options.clientEntry ?? DEFAULT_CONFIG.CLIENT_ENTRY],
        },
      },
    };
  } catch (error) {
    return {
      type: "error",
      error:
        error instanceof Error ? error : new Error("Failed to resolve options"),
    };
  }
};
