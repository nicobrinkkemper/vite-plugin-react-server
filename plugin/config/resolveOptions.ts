import type { PreRenderedAsset } from "rollup";
import type { PreRenderedChunk } from "rollup";
import type { StreamPluginOptions, ResolvedUserOptions } from "../types.js";
import {
  BASE_PATTERNS,
  DEFAULT_CONFIG,
  DEFAULT_LOADER_CONFIG,
} from "./defaults.js";
import { join } from "node:path";
import { pluginRoot } from "../root.js";
import { CssCollector } from "../components/css-collector.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { getNodeEnv } from "../getNodeEnv.js";
import { resolveDirectiveMatcher } from "./resolveDirectiveMatcher.js";
import { resolveAllowedDirectives } from "./resolveAllowedDirectives.js";
import { resolveRegExp } from "./resolveRegExp.js";
import { createDefaultModuleID } from "./createModuleID.js";

export type ResolveOptionsReturn<R extends StreamPluginOptions> =
  | {
      type: "success";
      userOptions: ResolvedUserOptions<R>;
      error?: never;
    }
  | { type: "error"; error: Error; userOptions?: never };

export type ResolveOptionsFn = <R extends StreamPluginOptions>(
  options: R
) => ResolveOptionsReturn<R>;

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
  const fileNameExtIndex = filename?.lastIndexOf(".");
  const fileNameWithoutExt = filename?.slice(0, fileNameExtIndex);
  const extension = filename?.slice(fileNameExtIndex);
  return `${folder}/${fileNameWithoutExt}.${searchQuery}.${extension}`;
};

/**
 * Registers a path with an optional pattern matcher and extension.
 * If a pattern matches and the path doesn't end with the extension, the extension is appended.
 *
 * @param path - The path to register
 * @param pattern - Optional pattern matcher function that returns true if the path matches
 * @param ext - Optional extension to append if pattern matches and path doesn't already end with it
 */
const registerPath = (path: string, pattern?: RegExp, ext?: string) => {
  // If we have a pattern and it doesn't match, or we have an extension and the path doesn't end with it, append the extension
  if ((pattern && !pattern.test(path)) || (ext && !path.endsWith(ext))) {
    return path + ext;
  }
  return path;
};

// ============================================================================
// Main Options Resolver
// ============================================================================

const stashedUserOptions: Record<string, ResolvedUserOptions | null> = {};

/**
 * Resolves the user options for the plugin.
 *
 * @param options - The user options to resolve.
 * @returns The resolved options.
 */
export const resolveOptions: ResolveOptionsFn = function _resolveOptions(
  options
) {
  const envId = process.env.NODE_ENV ?? "development";

  // Return stashed options if available
  if (stashedUserOptions[envId]) {
    return {
      type: "success",
      userOptions: stashedUserOptions[envId] as never,
    };
  }

  const loaderMode = options.loader?.mode ?? getNodeEnv();
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

  const client =
    typeof options.build?.client === "string"
      ? options.build.client
      : DEFAULT_CONFIG.BUILD.client;

  const outDir =
    typeof options.build?.outDir === "string"
      ? options.build.outDir
      : DEFAULT_CONFIG.BUILD.outDir;

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

  const preserveDirectives =
    typeof options.build?.preserveDirectives === "boolean"
      ? options.build.preserveDirectives
      : DEFAULT_CONFIG.BUILD.preserveDirectives;

  const jsExtension =
    typeof options.build?.jsExtension === "string"
      ? options.build.jsExtension
      : DEFAULT_CONFIG.BUILD.jsExtension;
  const cssExtension =
    typeof options.build?.cssExtension === "string"
      ? options.build.cssExtension
      : DEFAULT_CONFIG.BUILD.cssExtension;
  const cssModuleExtension =
    typeof options.build?.cssModuleExtension === "string"
      ? options.build.cssModuleExtension
      : DEFAULT_CONFIG.BUILD.cssModuleExtension;
  const htmlExtension =
    typeof options.build?.htmlExtension === "string"
      ? options.build.htmlExtension
      : DEFAULT_CONFIG.BUILD.htmlExtension;
  const jsonExtension =
    typeof options.build?.jsonExtension === "string"
      ? options.build.jsonExtension
      : DEFAULT_CONFIG.BUILD.jsonExtension;
  const rscExtension =
    typeof options.build?.rscExtension === "string"
      ? options.build.rscExtension
      : DEFAULT_CONFIG.BUILD.rscExtension;

  const rscOutputPath =
    typeof options.build?.rscOutputPath === "string"
      ? options.build.rscOutputPath
      : DEFAULT_CONFIG.BUILD.rscOutputPath;
  const htmlOutputPath =
    typeof options.build?.htmlOutputPath === "string"
      ? options.build.htmlOutputPath
      : DEFAULT_CONFIG.BUILD.htmlOutputPath;

  // these will never be cleaned up, because, we are resolving the user options
  // and it's assumed they are relevant until the process stops
  if (process.env.VITE_BASE_URL !== moduleBaseURL) {
    process.env.VITE_BASE_URL = moduleBaseURL;
  }
  if (process.env.VITE_PUBLIC_ORIGIN !== publicOrigin) {
    process.env.VITE_PUBLIC_ORIGIN = publicOrigin;
  }

  const modulePattern = resolveRegExp(
    options.autoDiscover?.modulePattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.modulePattern
  );

  const jsonPattern = resolveRegExp(
    options.autoDiscover?.jsonPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.jsonPattern
  );

  const cssPattern = resolveRegExp(
    options.autoDiscover?.cssPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.cssPattern
  );

  const htmlPattern = resolveRegExp(
    options.autoDiscover?.htmlPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.htmlPattern
  );

  const rscPattern = resolveRegExp(
    options.autoDiscover?.rscPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.rscPattern
  );

  const clientPattern = resolveRegExp(
    options.autoDiscover?.clientPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.clientPattern
  );

  const serverPattern = resolveRegExp(
    options.autoDiscover?.serverPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.serverPattern
  );

  const nodePattern = resolveRegExp(
    options.autoDiscover?.nodePattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.nodeOnly
  );

  const propsPattern = resolveRegExp(
    options.autoDiscover?.propsPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.propsPattern
  );

  const pagePattern = resolveRegExp(
    options.autoDiscover?.pagePattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.pagePattern
  );

  const cssModulePattern = resolveRegExp(
    options.autoDiscover?.cssModulePattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.cssModulePattern
  );

  const vendorPattern = resolveRegExp(
    options.autoDiscover?.vendorPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.vendorPattern
  );

  const virtualPattern = resolveRegExp(
    options.autoDiscover?.virtualPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.virtualPattern
  );

  const dotPattern = resolveRegExp(
    options.autoDiscover?.dotPattern,
    BASE_PATTERNS.DOT_FILES
  );

  /** Loader options */
  const isServerFunctionCode = resolveDirectiveMatcher(
    options.loader?.serverDirective,
    (code: string, moduleId?: string) =>
      code.match(resolveRegExp(options.loader!.serverDirective!)) != null ||
      (typeof moduleId === "string" && serverPattern.test(moduleId)) ||
      false
  );

  const isClientComponentCode = resolveDirectiveMatcher(
    options.loader?.clientDirective,
    (code: string, moduleId?: string) =>
      code.match(resolveRegExp(options.loader!.clientDirective!)) != null ||
      (typeof moduleId === "string" && clientPattern.test(moduleId)) ||
      false
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
    if (hashString === "" || new RegExp(BASE_PATTERNS.EXT.NODE).test(n)) {
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

  // Output path resolution
  const getOutputPath = (n: string | null) => {
    if (!n) return "";
    let path = handleSearchQuery(n);
    path = path.startsWith(moduleBase + moduleBasePath)
      ? path.slice(moduleBase.length + moduleBasePath.length)
      : path;

    if (vendorPattern.test(path))
      return registerPath(path, vendorPattern, jsExtension);
    if (cssModulePattern.test(path))
      return registerPath(path, cssModulePattern, cssModuleExtension);
    if (cssPattern.test(path))
      return registerPath(path, cssPattern, cssExtension);
    if (clientPattern.test(path))
      return registerPath(path, clientPattern, jsExtension);
    if (htmlPattern.test(path))
      return registerPath(path, htmlPattern, htmlExtension);
    if (jsonPattern.test(path))
      return registerPath(path, jsonPattern, jsonExtension);
    if (propsPattern.test(path))
      return registerPath(path, propsPattern, jsExtension);
    if (pagePattern.test(path))
      return registerPath(path, pagePattern, jsExtension);
    if (serverPattern.test(path))
      return registerPath(path, serverPattern, jsExtension);
    if (modulePattern.test(path))
      return registerPath(path, modulePattern, jsExtension);
    return registerPath(path, modulePattern, jsExtension);
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
    return hash(getOutputPath(normalizer(n.name)[0]), ssr);
  };

  const chunkFile = (n: PreRenderedChunk, ssr: boolean) => {
    return hash(getOutputPath(normalizer(n.name)[0]), ssr);
  };

  const assetFile = (n: PreRenderedAsset, ssr: boolean) => {
    if (n.names.length > 1) {
      return n.names.map((name) => hash(getOutputPath(name), ssr)).join(",");
    }
    const firstName = n.names[0];
    return hash(getOutputPath(firstName), ssr);
  };

  /**
   * pages
   * assetsDir
   * client
   * server
   * static
   * api
   * outDir
   * hash
   * preserveDirectives
   * preserveModulesRoot
   * rscOutputPath
   * htmlOutputPath
   * entryFile
   * chunkFile
   * assetFile
   * extensionMap
   * moduleExtension
   * jsExtension
   * cssExtension
   * htmlExtension
   * jsonExtension
   * rscExtension
   * cssModuleExtension
   * nodeExtension
   */
  const build = {
    pages: options.build?.pages ?? DEFAULT_CONFIG.BUILD.pages,
    assetsDir: options.build?.assetsDir ?? DEFAULT_CONFIG.BUILD.assetsDir,
    client: options.build?.client ?? DEFAULT_CONFIG.BUILD.client,
    server: options.build?.server ?? DEFAULT_CONFIG.BUILD.server,
    static: options.build?.static ?? DEFAULT_CONFIG.BUILD.static,
    api: options.build?.api ?? DEFAULT_CONFIG.BUILD.api,
    preserveModulesRoot:
      options.build?.preserveModulesRoot ??
      DEFAULT_CONFIG.BUILD.preserveModulesRoot,
    outDir: options.build?.outDir ?? DEFAULT_CONFIG.BUILD.outDir,
    hash: options.build?.hash ?? DEFAULT_CONFIG.BUILD.hash,
    extensionMap: {
      // Extension mappings
      [BASE_PATTERNS.MODULE]: jsExtension,
      [BASE_PATTERNS.EXT.CSS]: cssExtension,
      [BASE_PATTERNS.EXT.JSON]: jsonExtension,
      [BASE_PATTERNS.EXT.HTML]: htmlExtension,
      [BASE_PATTERNS.EXT.RSC]: rscExtension,
      // Special case for .node files
      [BASE_PATTERNS.EXT.NODE]:
        BASE_PATTERNS.EXT.NODE +
        (options.build?.jsExtension ?? DEFAULT_CONFIG.BUILD.jsExtension),
      ...options.build?.extensionMap,
    },
    entryFile,
    chunkFile,
    assetFile,
    preserveDirectives: preserveDirectives,
    rscOutputPath: rscOutputPath,
    htmlOutputPath: htmlOutputPath,
    moduleExtension: jsExtension,
    jsExtension: jsExtension,
    cssExtension: cssExtension,
    htmlExtension: htmlExtension,
    jsonExtension: jsonExtension,
    rscExtension: rscExtension,
    cssModuleExtension: cssModuleExtension,
    nodeExtension: DEFAULT_CONFIG.BUILD.nodeExtension,
  } satisfies ResolvedUserOptions<typeof options>["build"];

  // Auto-discovery configuration
  const autoDiscover = {
    modulePattern,
    jsonPattern,
    cssPattern,
    htmlPattern,
    rscPattern,
    clientPattern,
    serverPattern,
    nodePattern,
    propsPattern,
    pagePattern,
    cssModulePattern,
    vendorPattern,
    virtualPattern,
    dotPattern,
  } satisfies ResolvedUserOptions<typeof options>["autoDiscover"];

  const allowedDirectives = resolveAllowedDirectives(
    options.loader?.allowedDirectives ?? DEFAULT_LOADER_CONFIG.allowedDirectives
  );

  const moduleID =
    typeof options.moduleID === "function"
      ? options.moduleID
      : createDefaultModuleID({
          moduleBase,
          moduleBasePath,
          build: build,
          autoDiscover: autoDiscover,
        });

  // Create loader configuration
  const loader = {
    serverDirective: resolveRegExp(
      options.loader?.serverDirective,
      DEFAULT_LOADER_CONFIG.serverDirective
    ),
    clientDirective: resolveRegExp(
      options.loader?.clientDirective,
      DEFAULT_LOADER_CONFIG.clientDirective
    ),
    allowedDirectives: allowedDirectives,
    getDirectiveType:
      options.loader?.getDirectiveType ??
      DEFAULT_LOADER_CONFIG.getDirectiveType,
    mode: loaderMode,
    importServerPath:
      options.loader?.importServerPath ??
      DEFAULT_CONFIG.RSC_LOADER[loaderMode].importServerPath,
    importClientPath:
      options.loader?.importClientPath ??
      DEFAULT_CONFIG.RSC_LOADER[loaderMode].importClientPath,
    registerClientReferenceName:
      options.loader?.registerClientReferenceName ??
      DEFAULT_CONFIG.RSC_LOADER[loaderMode].registerClientReferenceName,
    registerServerReferenceName:
      options.loader?.registerServerReferenceName ??
      DEFAULT_CONFIG.RSC_LOADER[loaderMode].registerServerReferenceName,
    isServerFunctionCode,
    isClientComponentCode,
  } satisfies ResolvedUserOptions["loader"];

  const pipeableStreamOptions = options.pipeableStreamOptions
    ? options.pipeableStreamOptions
    : {};

  // Return resolved options
  try {
    const userOptions = {
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
      loader: loader,
      pipeableStreamOptions,
      rscTimeout: typeof options.rscTimeout === "number" ? options.rscTimeout : DEFAULT_CONFIG.RSC_TIMEOUT,
      htmlWorkerStartupTimeout: typeof options.htmlWorkerStartupTimeout === "number" ? options.htmlWorkerStartupTimeout : DEFAULT_CONFIG.HTML_WORKER_STARTUP_TIMEOUT,
      rscWorkerStartupTimeout: typeof options.rscWorkerStartupTimeout === "number" ? options.rscWorkerStartupTimeout : DEFAULT_CONFIG.RSC_WORKER_STARTUP_TIMEOUT,
    } as ResolvedUserOptions<typeof options>;

    // Stash the resolved options
    stashedUserOptions[envId] = userOptions;

    return {
      type: "success",
      userOptions,
    };
  } catch (error) {
    return {
      type: "error",
      error:
        error instanceof Error ? error : new Error("Failed to resolve options"),
    };
  }
};
