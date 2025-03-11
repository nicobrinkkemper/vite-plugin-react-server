import type { PreRenderedAsset } from "rollup";
import type { PreRenderedChunk } from "rollup";
import type { StreamPluginOptions, ResolvedUserOptions, InlineCssCollectorProps, CssCollectorProps } from "../types.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { join } from "node:path";
import { pluginRoot } from "../root.js";
import { InlineCssCollector } from "../css-collector-inline.js";
import { CssCollector } from "../css-collector.js";

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

const addJS = (path: string) => {
  if (path.endsWith(".js")) return path;
  if (path.endsWith("/.")) return path.slice(0, -2) + ".js";
  if (path.endsWith(".")) return path + "js";
  return path + ".js";
};

const handleSearchQuery = (path: string) => {
  // make the query part of the name of the file so it's not ending up like index1, index2, etc.
  const searchQuery = path.split("?")[1];
  if (!searchQuery) return path;
  // add the folder before the filename
  const folder = path.split("/").slice(0, -1).join("/");
  const filename = path.split("/").pop();
  return `${folder}/${filename}?${searchQuery}`;
};

const applyPattern = (
  path: string,
  _pattern?: string | RegExp | ((path: string) => boolean) | undefined,
  _fallback?: string | undefined
) => {
  // TODO: What to actually do here? I guess we could replace the extension, but it's not needed since we map them from the manifest anyway.
  return path;
};

export const resolveOptions = <InlineCSS extends boolean = boolean>(
  options: StreamPluginOptions<InlineCSS>,
  isClient: boolean
):
  | { type: "success"; userOptions: ResolvedUserOptions<InlineCSS> }
  | { type: "error"; error: Error } => {
  const projectRoot = options.projectRoot ?? process.cwd();
  const {
    pageExportName = DEFAULT_CONFIG.PAGE_EXPORT_NAME,
    propsExportName = DEFAULT_CONFIG.PROPS_EXPORT_NAME,
  } = options;
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
    options.build?.assetsDir ?? `${DEFAULT_CONFIG.CLIENT_ASSETS_DIR}`;

  const ensureModuleBase = (n: string | null) => {
    if (!n) return "";
    return n.startsWith(moduleBase + "/") ? n.slice(moduleBase.length + 1) : n;
  };
  const hasWrongRoot = !projectRoot.startsWith("/");
  if (hasWrongRoot) {
    console.warn("projectRoot is not a full path", projectRoot);
  }
  const wrongRoot = !hasWrongRoot ? projectRoot.slice(1) : projectRoot;
  const ensureNoRoot = (n: string | null) => {
    if (!n) return "";
    if (n.startsWith(wrongRoot)) {
      return n.slice(wrongRoot.length + 1);
    }
    return n.startsWith(projectRoot + "/")
      ? n.slice(projectRoot.length + 1)
      : n;
  };

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
  const preserveModulesRoot =
    options.build?.preserveModulesRoot ??
    DEFAULT_CONFIG.BUILD.preserveModulesRoot;
  const hashOption =
    typeof options.build?.hash === "string"
      ? options.build.hash
      : DEFAULT_CONFIG.BUILD.hash;
  const hashString = hashOption === "" ? "" : `-[${hashOption}]`;
  const hash = (n: string | null) => {
    if (!n) return "";
    if (hashString === "" || (  !isClient && !n.endsWith('.css')  && !n.endsWith('.json') ) ) {
      return n;
    }
    const extensionIndex = n.lastIndexOf(".");
    if (extensionIndex !== -1) {
      // put hash between extension and filename
      const extension = n.slice(extensionIndex);
      const filename = n.slice(0, extensionIndex);
      return filename + hashString + extension;
    } else {
      return n + hashString;
    }
  };

  const getOutputPath = (n: string | null) => {
    if (!n) return "";
    let path = handleSearchQuery(n);
    // Remove src/ prefix if present
    path = path.startsWith(moduleBase + "/")
      ? path.slice(moduleBase.length + 1)
      : path;

    if (testVendor(path)) {
      return path;
    }

    if (testCssModule(path)) {
      // For CSS modules, keep the .css.js extension
      return applyPattern(
        path,
        options.autoDiscover?.cssModulePattern,
        ".css.js"
      );
    }

    if (testCss(path)) {
      // For regular CSS files, keep the .css extension
      return applyPattern(path, options.autoDiscover?.cssPattern, ".css");
    }

    if (testClientComponents(path)) {
      return applyPattern(
        path,
        options.autoDiscover?.clientComponents,
        "client"
      );
    }
    if (testHtml(path)) {
      return applyPattern(path, options.autoDiscover?.htmlPattern, ".html");
    }
    if (testJson(path)) {
      return applyPattern(path, options.autoDiscover?.jsonPattern, ".json");
    }
    if (testPropsPattern(path)) {
      return applyPattern(
        path,
        options.autoDiscover?.propsPattern,
        options.propsExportName?.toLowerCase() ??
          DEFAULT_CONFIG.PROPS_EXPORT_NAME.toLowerCase()
      );
    }
    if (testPagePattern(path)) {
      return applyPattern(
        path,
        options.autoDiscover?.pagePattern,
        options.pageExportName?.toLowerCase() ??
          DEFAULT_CONFIG.PAGE_EXPORT_NAME.toLowerCase()
      );
    }
    if (testServerFunctions(path)) {
      return applyPattern(
        path,
        options.autoDiscover?.serverFunctions,
        "server"
      );
    }
    if (testModulePattern(path)) {
      return path;
    }
    return path;
  };

  const entryFile = (n: PreRenderedChunk) => {
    if (testVendor(n.name)) {
      const search = n.facadeModuleId?.split("?")[1];
      if (search) {
        return hash(`${n.name}.${search}.js`);
      } else {
        return hash(`${n.name}.js`);
      }
    }
    return hash(addJS(getOutputPath(ensureModuleBase(ensureNoRoot(n.name)))));
  };

  const chunkFile = (n: PreRenderedChunk) => {
    // For chunks, we always want .js
    return hash(addJS(getOutputPath(ensureModuleBase(ensureNoRoot("_" + n.name)))));
  };

  const assetFile = (n: PreRenderedAsset) => {
    // For assets, keep the original extension
    return hash(getOutputPath(ensureModuleBase(ensureNoRoot(n.names[0]))));
  };

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
      : DEFAULT_CONFIG.MODULE_BASE_PATH;
  const moduleBaseURL =
    typeof options.moduleBaseURL === "string"
      ? options.moduleBaseURL
      : DEFAULT_CONFIG.MODULE_BASE_URL;
  const rscWorkerPath =
    typeof options.rscWorkerPath === "string"
      ? join(projectRoot, options.rscWorkerPath)
      : join(pluginRoot, DEFAULT_CONFIG.RSC_WORKER_PATH);
  const htmlWorkerPath =
    typeof options.htmlWorkerPath === "string"
      ? join(projectRoot, options.htmlWorkerPath)
      : join(pluginRoot, DEFAULT_CONFIG.HTML_WORKER_PATH);
  const loaderPath =
    typeof options.loaderPath === "string"
      ? join(projectRoot, options.loaderPath)
      : join(pluginRoot, DEFAULT_CONFIG.LOADER_PATH);

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
  const inlineCss = options.inlineCss;
  const InlineOrLinkCssCollector = options.CssCollector ?? inlineCss ? InlineCssCollector : CssCollector;
  try {
    return {
      type: "success",
      userOptions: {
        projectRoot,
        moduleBase,
        moduleBasePath,
        moduleBaseURL,
        build: build,
        Page: options.Page ?? DEFAULT_CONFIG.PAGE,
        props: options.props ?? DEFAULT_CONFIG.PROPS,
        Html: options.Html ?? DEFAULT_CONFIG.HTML,
        CssCollector: InlineOrLinkCssCollector as InlineCSS extends true ? React.FC<React.PropsWithChildren<InlineCssCollectorProps>> : React.FC<React.PropsWithChildren<CssCollectorProps>>,
        pageExportName: pageExportName,
        propsExportName: propsExportName,
        collectCss: options.collectCss ?? DEFAULT_CONFIG.COLLECT_CSS,
        collectAssets: options.collectAssets ?? DEFAULT_CONFIG.COLLECT_ASSETS,
        inlineCss: options.inlineCss ?? DEFAULT_CONFIG.INLINE_CSS,
        htmlWorkerPath: htmlWorkerPath,
        rscWorkerPath: rscWorkerPath,
        loaderPath: loaderPath,
        clientEntry: options.clientEntry ?? DEFAULT_CONFIG.CLIENT_ENTRY,
        serverEntry: options.serverEntry ?? DEFAULT_CONFIG.SERVER_ENTRY,
        moduleBaseExceptions: options.moduleBaseExceptions ?? [],
        autoDiscover: autoDiscover,
        pipableStreamOptions: options.pipableStreamOptions ?? {
          bootstrapModules: [
            options.clientEntry ?? DEFAULT_CONFIG.CLIENT_ENTRY,
          ],
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
