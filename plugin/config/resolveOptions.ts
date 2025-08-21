import type { PreRenderedAsset } from "rollup";
import type { PreRenderedChunk } from "rollup";
import type {
  StreamPluginOptions,
  ResolvedUserOptions,
  PageName,
  PropsName,
  HtmlName,
  RootName,
} from "../types.js";
import {
  BASE_PATTERNS,
  DEFAULT_CONFIG,
  DEFAULT_LOADER_CONFIG,
} from "./defaults.js";
import { join, resolve } from "node:path";
import { pluginRoot } from "../root.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";
import { resolveDirectiveMatcher } from "./resolveDirectiveMatcher.js";
import { resolveAllowedDirectives } from "./resolveAllowedDirectives.js";
import { resolveRegExp } from "./resolveRegExp.js";
import type { LoaderConfig } from "../loader/types.js";
import { handleError } from "../error/handleError.js";
import { createLogger, type Logger } from "vite";
import { getCondition } from "./getCondition.js";
import { stashUserOptions, getStashedUserOptions } from "./stashedOptionsState.js";

export type ResolveOptionsReturn =
  | {
      type: "success";
      userOptions: ResolvedUserOptions;
      error?: never;
    }
  | { type: "error"; error: unknown; userOptions?: never };

export type ResolveOptionsFn = (
  options: StreamPluginOptions,
  forceResolve?: boolean,
  logger?: Logger
) => ResolveOptionsReturn;

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

let originalOptions: any | null = null;
/**
 * Resolves the user options for the plugin.
 *
 * @param options - The user options to resolve.
 * @returns The resolved options.
 */
export const resolveOptions: ResolveOptionsFn = function _resolveOptions(
  options = {} as StreamPluginOptions,
  forceResolve = false,
  logger = createLogger(!options.verbose ? "error" : "info", {
    prefix: "vite:plugin-react-server/config#resolveOptions",
  })
) {
  if (!forceResolve && originalOptions == null) {
    originalOptions = options;
  } else if (originalOptions != null && options !== originalOptions) {
    if (options.verbose) {
      logger.info("options changed, forcing re-resolve");
    }
    forceResolve = true;
  }
  const panicThreshold =
    typeof options.panicThreshold === "string"
      ? options.panicThreshold
      : DEFAULT_CONFIG.PANIC_THRESHOLD;
  // since panicThreshold affects the behavior of the plugin, we need to re-resolve the options if it changes
  const envId = getCondition() + "." + (process.env.NODE_ENV ?? "production");

  // Return stashed options if available
  const stashedOptions = getStashedUserOptions(envId);
  if (stashedOptions && !forceResolve) {
    return {
      type: "success",
      userOptions: stashedOptions as never,
    };
  }

  const loaderMode = options.loader?.mode ?? undefined;
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

  // Rollup's preserveModulesRoot works in reverse of what you'd expect:
  // - When user wants preservation (true): pass undefined to Rollup (don't strip anything)
  // - When user wants stripping (false): pass moduleBase to Rollup (strip this path)
  const preserveModulesRootString =
    preserveModulesRoot === false
      ? moduleBase // Strip src/ from output paths
      : undefined; // Keep src/ in output paths

  const client =
    typeof options.build?.client === "string"
      ? options.build.client
      : DEFAULT_CONFIG.BUILD.client;

  const outDir =
    typeof options.build?.outDir === "string"
      ? options.build.outDir
      : DEFAULT_CONFIG.BUILD.outDir;

  // Use defaults for now - these will be updated later when we have the config with proper prefix
  const moduleBasePath =
    typeof options.moduleBasePath === "string"
      ? options.moduleBasePath
      : DEFAULT_CONFIG.MODULE_BASE_PATH;

  const moduleBaseURL =
    typeof options.moduleBaseURL === "string"
      ? options.moduleBaseURL
      : DEFAULT_CONFIG.MODULE_BASE_URL;

  const moduleRootPath =
    typeof options.moduleRootPath === "string"
      ? options.moduleRootPath
      : join(projectRoot, outDir, client);

  const publicOrigin =
    typeof options.publicOrigin === "string"
      ? options.publicOrigin
      : DEFAULT_CONFIG.PUBLIC_ORIGIN;


  const rscWorkerPath =
    typeof options.rscWorkerPath === "string"
      ? resolve(projectRoot, options.rscWorkerPath)
      : resolve(pluginRoot, DEFAULT_CONFIG.RSC_WORKER_PATH);

  const htmlWorkerPath =
    typeof options.htmlWorkerPath === "string"
      ? resolve(projectRoot, options.htmlWorkerPath)
      : resolve(pluginRoot, DEFAULT_CONFIG.HTML_WORKER_PATH);

  const loaderPath =
    typeof options.loaderPath === "string"
      ? resolve(projectRoot, options.loaderPath)
      : resolve(pluginRoot, DEFAULT_CONFIG.LOADER_PATH);

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
  const serverDirective = resolveRegExp(
    options.loader?.serverDirective,
    DEFAULT_LOADER_CONFIG.serverDirective
  );
  const clientDirective = resolveRegExp(
    options.loader?.clientDirective,
    DEFAULT_LOADER_CONFIG.clientDirective
  );
  const isServerFunctionCode = resolveDirectiveMatcher(
    serverDirective,
    (code: string, moduleId?: string) =>
      code.match(serverDirective) != null ||
      (typeof moduleId === "string" && serverPattern.test(moduleId)) ||
      false
  );

  const isClientComponentCode = resolveDirectiveMatcher(
    clientDirective,
    (code: string, moduleId?: string) =>
      code.match(clientDirective) != null ||
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
      return registerPath(path, cssModulePattern, cssExtension);
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
      preserveModulesRoot: preserveModulesRootString,
      removeExtension: true,
      moduleBasePath,
      moduleBaseURL,
    });
  // File naming functions - defined as regular functions to avoid closure issues
  function entryFile(n: PreRenderedChunk, ssr: boolean): string {
    const normalizedName = normalizer(n.name)[0];
    const outputPath = getOutputPath(normalizedName);
    return hash(outputPath, ssr);
  }

  function chunkFile(n: PreRenderedChunk, ssr: boolean): string {
    const normalizedName = normalizer(n.name)[0];
    const outputPath = getOutputPath(normalizedName);
    return hash(outputPath, ssr);
  }

  function assetFile(n: PreRenderedAsset, ssr: boolean = false): string {
    if (n.names.length > 1) {
      return n.names.map((name) => hash(name, ssr)).join(",");
    }
    let firstName = n.names[0];

    // Clean up asset paths by removing the moduleBase from within assets directory
    // Transform: assets/src/page/file.css -> assets/page/file.css
    const assetsDir = build.assetsDir || "assets";
    if (firstName.startsWith(assetsDir + "/" + moduleBase + "/")) {
      firstName =
        assetsDir +
        "/" +
        firstName.slice((assetsDir + "/" + moduleBase + "/").length);
    }
    // Handle moduleBasePath removal
    else if (moduleBasePath && firstName.startsWith(moduleBasePath)) {
      firstName = firstName.slice(moduleBasePath.length);
    } else if (
      moduleBaseURL &&
      moduleBaseURL !== "/" &&
      moduleBaseURL !== "" &&
      firstName.startsWith(moduleBaseURL)
    ) {
      firstName = firstName.slice(moduleBaseURL.length);
    }
    // Handle direct moduleBase removal
    else if (firstName.startsWith(moduleBase + "/")) {
      firstName = firstName.slice(moduleBase.length + 1);
    }

    // For CSS files, make sure we preserve the .css extension and don't apply JS extension mapping
    if (firstName.endsWith(".css")) {
      return hash(firstName, false);
    }

    // For other assets, apply the extension mapping if needed
    return hash(getOutputPath(firstName), false);
  }

  /**
   * pages
   * assetsDir
   * client
   * server
   * static
   * api
   * outDir
   * hash

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
      // File extensions first (more specific patterns should come first)
      [BASE_PATTERNS.EXT.CSS]: cssExtension,
      [BASE_PATTERNS.EXT.JSON]: jsonExtension,
      [BASE_PATTERNS.EXT.HTML]: htmlExtension,
      [BASE_PATTERNS.EXT.RSC]: rscExtension,
      // Special case for .node files
      [BASE_PATTERNS.EXT.NODE]:
        BASE_PATTERNS.EXT.NODE +
        (options.build?.jsExtension ?? DEFAULT_CONFIG.BUILD.jsExtension),
      // General module pattern last (less specific)
      [BASE_PATTERNS.MODULE]: jsExtension,
      ...options.build?.extensionMap,
    },
    entryFile,
    chunkFile,
    assetFile,

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
    useRscWorker: options.build?.useRscWorker ?? DEFAULT_CONFIG.BUILD.useRscWorker,
    useHtmlWorker: options.build?.useHtmlWorker ?? DEFAULT_CONFIG.BUILD.useHtmlWorker,  
  } satisfies ResolvedUserOptions["build"];

  // Auto-discovery configuration
  const autoDiscover = {
    clientEntry: options.autoDiscover?.clientEntry ?? DEFAULT_CONFIG.AUTO_DISCOVER.clientEntry,
    serverEntry: options.autoDiscover?.serverEntry ?? DEFAULT_CONFIG.AUTO_DISCOVER.serverEntry,
    cssEntry: options.autoDiscover?.cssEntry ?? DEFAULT_CONFIG.AUTO_DISCOVER.cssEntry,
    jsonEntry: options.autoDiscover?.jsonEntry ?? DEFAULT_CONFIG.AUTO_DISCOVER.jsonEntry,
    htmlEntry: options.autoDiscover?.htmlEntry ?? DEFAULT_CONFIG.AUTO_DISCOVER.htmlEntry,
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
  } satisfies ResolvedUserOptions["autoDiscover"];

  const allowedDirectives = resolveAllowedDirectives(
    options.loader?.allowedDirectives ?? DEFAULT_LOADER_CONFIG.allowedDirectives
  );

  // Create loader configuration
  const loader = loaderMode
    ? ({
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
          options.loader?.getDirectiveType ?? options.loader?.allowedDirectives
            ? (directive: string) => {
                if (options.loader?.allowedDirectives) {
                  if (Array.isArray(options.loader?.allowedDirectives)) {
                    return options.loader?.allowedDirectives.includes(directive)
                      ? directive === "use server"
                        ? "server"
                        : "client"
                      : undefined;
                  } else {
                    const config = options.loader?.allowedDirectives[directive];
                    return config
                      ? directive === "use server"
                        ? "server"
                        : "client"
                      : undefined;
                  }
                }
                return undefined;
              }
            : DEFAULT_LOADER_CONFIG.getDirectiveType,
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
        parse: DEFAULT_LOADER_CONFIG.parse,
      } as Required<LoaderConfig>)
    : undefined;

  const pipeableStreamOptions = options.pipeableStreamOptions
    ? options.pipeableStreamOptions
    : {};

  // Return resolved options
  try {
    const userOptions: ResolvedUserOptions = {
      projectRoot,
      moduleBase,
      moduleBasePath,
      moduleBaseURL,
      moduleRootPath,
      publicOrigin,
      build: build,
      verbose: options.verbose ?? DEFAULT_CONFIG.VERBOSE,
      onMetrics:
        typeof options.onMetrics === "function"
          ? options.onMetrics
          : DEFAULT_CONFIG.ON_METRICS,
      onEvent:
        typeof options.onEvent === "function"
          ? options.onEvent
          : DEFAULT_CONFIG.ON_EVENT,
      Page: options.Page,
      props: options.props,
      Html: options.Html ?? DEFAULT_CONFIG.HTML,
      Root: options.Root ?? DEFAULT_CONFIG.ROOT,
      components: options.components,
      normalizer: normalizer,
      moduleID: options.moduleID, // if not provided, will be created when config hook is called
      pageExportName:
        options.pageExportName ?? (DEFAULT_CONFIG.PAGE_EXPORT_NAME as PageName),
      propsExportName:
        options.propsExportName ??
        (DEFAULT_CONFIG.PROPS_EXPORT_NAME as PropsName),
      htmlExportName:
        options.htmlExportName ?? (DEFAULT_CONFIG.HTML_EXPORT_NAME as HtmlName),
      rootExportName:
        options.rootExportName ?? (DEFAULT_CONFIG.ROOT_EXPORT_NAME as RootName),
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
      reactLoaderPath:
        options.reactLoaderPath ?? DEFAULT_CONFIG.REACT_LOADER_PATH,
      cssLoaderPath: options.cssLoaderPath ?? DEFAULT_CONFIG.CSS_LOADER_PATH,
      envLoaderPath: options.envLoaderPath ?? DEFAULT_CONFIG.ENV_LOADER_PATH,
      clientEntry: options.clientEntry ?? DEFAULT_CONFIG.CLIENT_ENTRY,
      serverEntry: options.serverEntry ?? DEFAULT_CONFIG.SERVER_ENTRY,
      autoDiscover: autoDiscover,
      loader: loader,
      pipeableStreamOptions,
      rscTimeout:
        typeof options.rscTimeout === "number"
          ? options.rscTimeout
          : DEFAULT_CONFIG.RSC_TIMEOUT,
      htmlTimeout:
        typeof options.htmlTimeout === "number"
          ? options.htmlTimeout
          : DEFAULT_CONFIG.HTML_TIMEOUT,
      htmlWorkerStartupTimeout:
        typeof options.htmlWorkerStartupTimeout === "number"
          ? options.htmlWorkerStartupTimeout
          : DEFAULT_CONFIG.HTML_WORKER_STARTUP_TIMEOUT,
      rscWorkerStartupTimeout:
        typeof options.rscWorkerStartupTimeout === "number"
          ? options.rscWorkerStartupTimeout
          : DEFAULT_CONFIG.RSC_WORKER_STARTUP_TIMEOUT,
      fileWriteTimeout:
        typeof options.fileWriteTimeout === "number"
          ? options.fileWriteTimeout
          : DEFAULT_CONFIG.FILE_WRITE_TIMEOUT,
      workerShutdownTimeout:
        typeof options.workerShutdownTimeout === "number"
          ? options.workerShutdownTimeout
          : DEFAULT_CONFIG.WORKER_SHUTDOWN_TIMEOUT,
      panicThreshold: panicThreshold,
    };

    // Stash the resolved options
    stashUserOptions(envId, userOptions);

    return {
      type: "success",
      userOptions,
    };
  } catch (error) {
    return {
      type: "error",
      error: handleError({
        error,
        logger: logger,
        panicThreshold,
        context: "config(resolveOptions)",
      }),
    };
  }
};


