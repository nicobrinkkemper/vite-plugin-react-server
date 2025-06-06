import type { PreRenderedAsset } from "rollup";
import type { PreRenderedChunk } from "rollup";
import type {
  StreamPluginOptions,
  ResolvedUserOptions,
  PagePropOpt,
  InlineCssOpt,
} from "../types.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { join } from "node:path";
import { pluginRoot } from "../root.js";
import { CssCollector } from "../components/css-collector.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { resolveAutoDiscoverMatcher } from "./resolveAutoDiscoverMatcher.js";
import { extMap } from "./extMap.js";
// /**
//  * Ensures a path ends with .js extension
//  */
// const addExtension = (path: string, extension: string = "js") => {
//   if (path.endsWith(`.${extension}`)) return path;
//   if (path.endsWith("/.")) return path.slice(0, -2) + "." + extension;
//   if (path.endsWith(".")) return path + "." + extension;
//   return path + "." + extension;
// };

/**
 * Handles search query parameters in file paths
 */
const handleSearchQuery = (path: string) => {
  const searchQuery = path.split("?")[1];
  if (!searchQuery) return path;
  const folder = path.split("/").slice(0, -1).join("/");
  const filename = path.split("/").pop();
  return `${folder}/${filename}?${searchQuery}`;
};

/**
 * Applies pattern matching to file paths
 */
const registerPath = (
  path: string,
  _pattern?: string | RegExp | ((path: string) => boolean) | undefined,
  ext?: string | undefined
) => {
  if (ext && !path.endsWith(ext)) {
    return path + ext;
  }
  return path;
};

// ============================================================================
// Main Options Resolver
// ============================================================================

export const resolveOptions = <
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(
  options: StreamPluginOptions<T, InlineCSS>
):
  | { type: "success"; userOptions: ResolvedUserOptions<T, InlineCSS> }
  | { type: "error"; error: Error } => {
  // Module path configuration
  const moduleBase =
    typeof options.moduleBase === "string"
      ? options.moduleBase
      : DEFAULT_CONFIG.MODULE_BASE;
  // Basic configuration
  const projectRoot = options.projectRoot ?? process.cwd();

  // Build options
  const preserveModulesRoot =
    options.build?.preserveModulesRoot ??
    DEFAULT_CONFIG.BUILD.preserveModulesRoot;

  const isProd =
    process.env["NODE_ENV"] === "production" ||
    process.env["VITE_PROD"] === "true" ||
    process.env["VITE_PROD"] === "1";
  const prodModuleBase = isProd && preserveModulesRoot ? moduleBase : undefined;

  const {
    pageExportName = DEFAULT_CONFIG.PAGE_EXPORT_NAME,
    propsExportName = DEFAULT_CONFIG.PROPS_EXPORT_NAME,
  } = options;

  // Build configuration
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

  const moduleBasePath =
    typeof options.moduleBasePath === "string"
      ? options.moduleBasePath
      : process.env.VITE_BASE_URL ?? DEFAULT_CONFIG.MODULE_BASE_PATH;
  
  const moduleBaseURL =
    typeof options.moduleBaseURL === "string"
      ? options.moduleBaseURL
      : process.env.VITE_BASE_URL ?? DEFAULT_CONFIG.MODULE_BASE_URL;

  const moduleRootPath =
    typeof options.moduleRootPath === "string"
      ? options.moduleRootPath
      : join(projectRoot, outDir, client);

  const publicOrigin =
    typeof options.publicOrigin === "string"
      ? options.publicOrigin
      : process.env.VITE_PUBLIC_ORIGIN ?? DEFAULT_CONFIG.PUBLIC_ORIGIN;

  // Worker and loader paths
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
  // these will never be cleaned up, because, we are resolving the user options
  // and it's assumed they are relevant until the process stops
  if (process.env.VITE_BASE_URL !== moduleBaseURL) {
    process.env.VITE_BASE_URL = moduleBaseURL;
  }
  if (process.env.VITE_PUBLIC_ORIGIN !== publicOrigin) {
    process.env.VITE_PUBLIC_ORIGIN = publicOrigin;
  }

  const moduleExtension = resolveAutoDiscoverMatcher(
    options.autoDiscover?.moduleExtension,
    DEFAULT_CONFIG.AUTO_DISCOVER.moduleExtension
  );
  // Auto-discovery pattern matchers
  const modulePattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.modulePattern,
    options.autoDiscover?.moduleExtension
      ? (id: string) => moduleExtension(id.toLowerCase())
      : DEFAULT_CONFIG.AUTO_DISCOVER.modulePattern
  );

  const jsonPattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.jsonPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.jsonPattern
  );

  const cssPattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.cssPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.cssPattern
  );

  const testHtml = resolveAutoDiscoverMatcher(
    options.autoDiscover?.htmlPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.htmlPattern
  );

  const testRsc = resolveAutoDiscoverMatcher(
    options.autoDiscover?.rscPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.rscPattern
  );

  const clientComponents = resolveAutoDiscoverMatcher(
    options.autoDiscover?.clientComponents,
    options.autoDiscover?.moduleExtension
      ? (id: string) => /(\.|\/)?client(\.|\/)?/.test(id.toLowerCase())
      : DEFAULT_CONFIG.AUTO_DISCOVER.clientComponents
  );

  const serverFunctions = resolveAutoDiscoverMatcher(
    options.autoDiscover?.serverFunctions,
    options.autoDiscover?.moduleExtension
      ? (id: string) => /(\.|\/)?server(\.|\/)?/.test(id.toLowerCase())
      : DEFAULT_CONFIG.AUTO_DISCOVER.serverFunctions
  );

  const nodeOnly = resolveAutoDiscoverMatcher(
    options.autoDiscover?.nodeOnly,
    DEFAULT_CONFIG.AUTO_DISCOVER.nodeOnly
  );

  const propsPattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.propsPattern,
    options.autoDiscover?.moduleExtension
      ? (id: string) =>
          moduleExtension(id.toLowerCase()) &&
          /(\.|\/)?props(\.|\/)/.test(id.toLowerCase())
      : DEFAULT_CONFIG.AUTO_DISCOVER.propsPattern
  );

  const pagePattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.pagePattern,
    options.autoDiscover?.moduleExtension
      ? (id: string) =>
          moduleExtension(id.toLowerCase()) &&
          /(\.|\/)?page(\.|\/)/.test(id.toLowerCase())
      : DEFAULT_CONFIG.AUTO_DISCOVER.pagePattern
  );

  const cssModulePattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.cssModulePattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.cssModulePattern
  );

  const vendorPattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.vendorPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.vendorPattern
  );

  const virtualPattern = resolveAutoDiscoverMatcher(
    options.autoDiscover?.virtualPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.virtualPattern
  );

  const dotFiles = resolveAutoDiscoverMatcher(
    options.autoDiscover?.dotFiles,
    DEFAULT_CONFIG.AUTO_DISCOVER.dotFiles
  );

  const isServerFunctionCode = resolveAutoDiscoverMatcher(
    options.autoDiscover?.isServerFunctionCode,
    options.autoDiscover?.serverDirective
      ? (code: string, moduleId?: string) =>
          code.match(options.autoDiscover?.serverDirective!) != null ||
          (moduleId && serverFunctions(moduleId)) ||
          false
      : DEFAULT_CONFIG.AUTO_DISCOVER.isServerFunctionCode
  );

  const isClientComponentCode = resolveAutoDiscoverMatcher(
    options.autoDiscover?.isClientComponentCode,
    options.autoDiscover?.clientDirective
      ? (code: string, moduleId?: string) =>
          code.match(options.autoDiscover?.clientDirective!) != null ||
          (moduleId && clientComponents(moduleId)) ||
          false
      : DEFAULT_CONFIG.AUTO_DISCOVER.isClientComponentCode
  );

  const hashOption =
    typeof options.build?.hash === "string"
      ? options.build.hash
      : DEFAULT_CONFIG.BUILD.hash;

  const hashString = hashOption === "" ? "" : `-[${hashOption}]`;
  // const addModuleExtension = (path: string) => {
  //   const isAsset =
  //     autoDiscover.cssPattern(path) || autoDiscover.jsonPattern(path);
  //   if (isAsset) {
  //     return path;
  //   }
  //   return addExtension(path);
  // };

  // File naming and hashing
  const hash = (n: string | null, ssr: boolean) => {
    if (!n) return "";
    if (ssr) return n;
    if (hashString === "" || autoDiscover.nodeOnly(n)) {
      return n;
    }
    const extensionIndex = n.lastIndexOf(".");
    if (extensionIndex !== -1) {
      const extension = n.slice(extensionIndex);
      const filename = n.slice(0, extensionIndex);
      return filename + hashString + extension;
    } else {
      return n + hashString;
    }
  };
  const jsExtension = options.autoDiscover?.jsExtension ?? ".js";
  const cssExtension = options.autoDiscover?.cssExtension ?? ".css";
  const htmlExtension = options.autoDiscover?.htmlExtension ?? ".html";
  const jsonExtension = options.autoDiscover?.jsonExtension ?? ".json";
  const rscExtension = options.autoDiscover?.rscExtension ?? ".rsc";

  // Output path resolution
  const getOutputPath = (n: string | null) => {
    if (!n) return "";
    let path = handleSearchQuery(n);
    path = path.startsWith(moduleBase + moduleBasePath)
      ? path.slice(moduleBase.length + moduleBasePath.length)
      : path;

    if (vendorPattern(path))
      return registerPath(
        path,
        options.autoDiscover?.vendorPattern,
        jsExtension
      );
    if (cssModulePattern(path))
      return registerPath(
        path,
        options.autoDiscover?.cssModulePattern,
        cssExtension + jsExtension
      );
    if (cssPattern(path))
      return registerPath(path, options.autoDiscover?.cssPattern, cssExtension);
    if (clientComponents(path))
      return registerPath(
        path,
        options.autoDiscover?.clientComponents,
        jsExtension
      );
    if (testHtml(path))
      return registerPath(
        path,
        options.autoDiscover?.htmlPattern,
        htmlExtension
      );
    if (jsonPattern(path))
      return registerPath(
        path,
        options.autoDiscover?.jsonPattern,
        jsonExtension
      );
    if (propsPattern(path))
      return registerPath(
        path,
        options.autoDiscover?.propsPattern,
        jsExtension
      );
    if (pagePattern(path))
      return registerPath(path, options.autoDiscover?.pagePattern, jsExtension);
    if (serverFunctions(path))
      return registerPath(
        path,
        options.autoDiscover?.serverFunctions,
        jsExtension
      );
    if (modulePattern(path))
      return registerPath(
        path,
        options.autoDiscover?.modulePattern,
        jsExtension
      );
    return registerPath(path, options.autoDiscover?.modulePattern, jsExtension);
  };

  const normalizer =
    options.normalizer ??
    createInputNormalizer({
      root: projectRoot,
      preserveModulesRoot: prodModuleBase,
      removeExtension: true,
      moduleBasePath,
    });
  // File naming functions
  const entryFile = (n: PreRenderedChunk, ssr: boolean) => {
    if (vendorPattern(n.name)) {
      const search = n.facadeModuleId?.split("?")[1];
      if (search) {
        return hash(`${n.name}.${search}${jsExtension}`, ssr);
      } else {
        return hash(`${n.name}${jsExtension}`, ssr);
      }
    }
    return hash(getOutputPath(normalizer(n.name)[0]), ssr);
  };

  const chunkFile = (n: PreRenderedChunk, ssr: boolean) => {
    return hash(getOutputPath(normalizer(n.name)[0]), ssr);
  };

  const assetFile = (n: PreRenderedAsset, ssr: boolean) => {
    const firstName = n.names[0];
    const extIndex = firstName.lastIndexOf(".");
    const nameWithoutExtension = firstName.slice(0, extIndex);
    const extension = firstName.slice(extIndex);
    const assetName = normalizer(nameWithoutExtension)[0] + extension;
    return hash(getOutputPath(assetName), ssr);
  };
  const moduleID =
    typeof options.moduleID === "function"
      ? options.moduleID
      : (id: string) => {
          if (prodModuleBase && id.startsWith(prodModuleBase)) {
            id = id.slice(prodModuleBase.length);
          }
          if (!id.startsWith(moduleBasePath)) {
            id = join(moduleBasePath, id);
          }
          // in the case the moduleBase comes after the base path, remove it
          if (prodModuleBase && id.startsWith("/" + prodModuleBase)) {
            id = id.slice(prodModuleBase.length + 1);
          }
          // these paths will generally start with a /, simply ensure they always do
          if (!id.startsWith("/")) {
            id = "/" + id;
          }
          if (isProd) {
            // generally it will work if we just use the .js extension for modules
            return mapExtension(id);
          }
          // but for extra good development workflow, we keep the path intact
          // not even stripping the moduleBase or ts extensions
          return id;
        };

  const rscOutputPath =
    options.build?.rscOutputPath ?? DEFAULT_CONFIG.BUILD.rscOutputPath;
  const htmlOutputPath =
    options.build?.htmlOutputPath ?? DEFAULT_CONFIG.BUILD.htmlOutputPath;

  // Build configuration object
  const build = {
    pages,
    client,
    server,
    static: staticBuild,
    outDir,
    assetsDir,
    api,
    hash: hashOption,
    preserveModulesRoot,
    rscOutputPath,
    htmlOutputPath,
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
  };

  // Auto-discovery configuration
  const autoDiscover = {
    jsExtension: jsExtension,
    cssExtension: cssExtension,
    htmlExtension: htmlExtension,
    jsonExtension: jsonExtension,
    rscExtension: rscExtension,
    moduleExtension:
      options.autoDiscover?.moduleExtension ??
      DEFAULT_CONFIG.AUTO_DISCOVER.moduleExtension,
    serverDirective:
      options.autoDiscover?.serverDirective ??
      DEFAULT_CONFIG.AUTO_DISCOVER.serverDirective,
    clientDirective:
      options.autoDiscover?.clientDirective ??
      DEFAULT_CONFIG.AUTO_DISCOVER.clientDirective,
    modulePattern: modulePattern,
    cssPattern: cssPattern,
    jsonPattern: jsonPattern,
    clientComponents: clientComponents,
    serverFunctions: serverFunctions,
    nodeOnly: nodeOnly,
    propsPattern: propsPattern,
    pagePattern: pagePattern,
    cssModulePattern: cssModulePattern,
    vendorPattern: vendorPattern,
    dotFiles: dotFiles,
    virtualPattern: virtualPattern,
    htmlPattern: testHtml,
    rscPattern: testRsc,
    isServerFunctionCode: isServerFunctionCode,
    isClientComponentCode: isClientComponentCode,
  } as const;
  const mapExtension = extMap(autoDiscover);
  const pipeableStreamOptions = options.pipeableStreamOptions
    ? options.pipeableStreamOptions
    : {};

  // Return resolved options
  try {
    return {
      type: "success",
      userOptions: {
        projectRoot,
        moduleBase,
        moduleBasePath,
        moduleBaseURL,
        moduleRootPath,
        publicOrigin,
        build: build,
        verbose: options.verbose ?? DEFAULT_CONFIG.VERBOSE,
        onMetrics: options.onMetrics ?? DEFAULT_CONFIG.ON_METRICS,
        onEvent: options.onEvent,
        Page: options.Page ?? undefined,
        props: options.props ?? undefined,
        Html: options.Html ?? DEFAULT_CONFIG.HTML,
        CssCollector: options.CssCollector ?? CssCollector,
        normalizer: normalizer,
        moduleID: moduleID,
        pageExportName: pageExportName,
        propsExportName: propsExportName,
        css: {
          inlineCss: options.css?.inlineCss ?? DEFAULT_CONFIG.CSS.inlineCss,
          inlineThreshold:
            options.css?.inlineThreshold ?? DEFAULT_CONFIG.CSS.inlineThreshold,
          inlinePatterns:
            options.css?.inlinePatterns ?? DEFAULT_CONFIG.CSS.inlinePatterns,
          linkPatterns:
            options.css?.linkPatterns ?? DEFAULT_CONFIG.CSS.linkPatterns,
        },
        htmlWorkerPath: htmlWorkerPath,
        rscWorkerPath: rscWorkerPath,
        loaderPath: loaderPath,
        clientEntry: options.clientEntry ?? DEFAULT_CONFIG.CLIENT_ENTRY,
        serverEntry: options.serverEntry ?? DEFAULT_CONFIG.SERVER_ENTRY,
        autoDiscover: autoDiscover,
        pipeableStreamOptions,
        directiveHandling: options.directiveHandling ?? DEFAULT_CONFIG.DIRECTIVE_HANDLING,
      } as ResolvedUserOptions<T, InlineCSS>,
    };
  } catch (error) {
    return {
      type: "error",
      error:
        error instanceof Error ? error : new Error("Failed to resolve options"),
    };
  }
};

