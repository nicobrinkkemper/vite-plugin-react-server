// Vite 8 swaps Rollup→Rolldown; source bundle types from Vite's version-agnostic Rollup namespace.
import type { Rollup } from "vite";
type PreRenderedAsset = Rollup.PreRenderedAsset;
type PreRenderedChunk = Rollup.PreRenderedChunk;
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
import { resolveRoutesOption } from "../router/fileRouter.js";
import { resolveDirectiveMatcher } from "./resolveDirectiveMatcher.js";
import { resolveAllowedDirectives } from "./resolveAllowedDirectives.js";
import { resolveRegExp } from "./resolveRegExp.js";
import type { LoaderConfig } from "../loader/types.js";
import { handleError } from "../error/handleError.js";
import { createLogger, type Logger } from "vite";
import { getCondition } from "./getCondition.js";
import { getNodeEnv } from "./getNodeEnv.js";
import { stashUserOptions, getStashedUserOptions, getEnvironmentId } from "./stashedOptionsState.js";
import { readFileSync, existsSync } from "node:fs";
import { createRollupLikeHash } from "./createRollupLikeHash.js";

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
 * The page list a transform receives when no `routes:` router is configured.
 * A routerless app has exactly one route: the index its `Page` serves.
 */
const ROUTERLESS_PAGES: readonly string[] = ["/"];

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
  
  // Force re-resolve if projectRoot changed
  if (originalOptions != null && originalOptions.projectRoot !== options.projectRoot) {
    if (options.verbose) {
      logger.info(`projectRoot changed from ${originalOptions.projectRoot} to ${options.projectRoot}, forcing re-resolve`);
    }
    forceResolve = true;
  }
  
  const panicThreshold =
    typeof options.panicThreshold === "string"
      ? options.panicThreshold
      : DEFAULT_CONFIG.PANIC_THRESHOLD;
  // since panicThreshold affects the behavior of the plugin, we need to re-resolve the options if it changes
  const envId = getEnvironmentId(getCondition(), process.env.NODE_ENV ?? "production");

  // Return stashed options if available
  const stashedOptions = getStashedUserOptions(envId);
  if (stashedOptions && !forceResolve) {
    // The stash is written at plugin-creation time, BEFORE
    // clientPackagesDiscoveryPlugin's async `config` hook merges auto-detected
    // packages into the shared raw options object. Re-sync the field on the
    // stashed object in place (preserving the shared reference) so the
    // noExternal / optimizeDeps merges in resolveUserConfig see the discovered
    // list. Without this, a server component importing a "use client" package
    // (vprs's own router/client barrel included) is externalized in dev and
    // evaluated under react-server: React.createContext is not a function.
    if (
      options.clientPackages !== undefined &&
      stashedOptions.clientPackages !== options.clientPackages
    ) {
      stashedOptions.clientPackages = options.clientPackages;
    }
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

  // Basic configuration - use the first projectRoot that was provided, or fall back to current options
  const projectRoot = options.projectRoot ?? originalOptions?.projectRoot ?? process.cwd();
  
  if (options.verbose && options.projectRoot != originalOptions?.projectRoot) {
    logger.info(`[resolveOptions] new projectRoot: ${projectRoot}`);
  }

  // File-based routing: if `routes` is set, scan the route tree once and derive
  // Page / props / routePatterns / build.pages from it. An explicit option
  // still wins over the router-derived value, so `routes` composes with manual
  // overrides and stays backward-compatible with the loose Page/props form.
  // Page/props matchers, resolved up here so the router's scanner shares the
  // SAME patterns as autoDiscover (a custom pagePattern/propsPattern is honored;
  // no hardcoded divergence in scanRoutes). Reused for autoDiscover below.
  const propsPattern = resolveRegExp(
    options.autoDiscover?.propsPattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.propsPattern
  );
  const pagePattern = resolveRegExp(
    options.autoDiscover?.pagePattern,
    DEFAULT_CONFIG.AUTO_DISCOVER.pagePattern
  );

  const routerTable = options.routes
    ? resolveRoutesOption(options.routes, {
        moduleBase,
        projectRoot,
        patterns: { pagePattern, propsPattern },
      })
    : undefined;
  const effectivePage = options.Page ?? routerTable?.Page;
  const effectiveProps = options.props ?? routerTable?.props;
  const effectiveRoutePatterns =
    options.routePatterns ?? routerTable?.routePatterns;
  // `build.pages` is the prerender worklist (an output concern). Its function
  // form now receives the ROUTER-derived list, so a user can filter / extend /
  // replace it without restating routes:
  //   build: { pages: (routerPages) => [...routerPages, "/extra"] }
  // A nullary function (the pre-existing form) simply ignores the argument =
  // replace. An array or absent value behaves as before. The router list is
  // resolved lazily (it may itself be async when `staticPaths` is set), so the
  // transform stays a nullary async thunk downstream (resolvePages awaits it).
  const routerBuildPages = routerTable?.build?.pages;
  const userBuildPages = options.build?.pages;
  const effectiveBuildPages =
    typeof userBuildPages === "function"
      ? async () => {
          const routerPages = Array.isArray(routerBuildPages)
            ? routerBuildPages
            : typeof routerBuildPages === "function"
              ? await routerBuildPages()
              : // `[]` here would make `(routerPages) => [...routerPages, "/x"]`
                // silently drop the index, and a filter silently prerender
                // nothing at all. Copied because it is handed to user code.
                [...ROUTERLESS_PAGES];
          const out = (userBuildPages as (p: string[]) => unknown)(routerPages);
          return (out instanceof Promise ? await out : out) as string[];
        }
      : // Absent `build.pages` keeps DEFAULT_CONFIG's empty worklist — only the
        // TRANSFORM's input defaults to the index. Defaulting the worklist too
        // would start prerendering an index for client-only builds that never
        // asked for one.
        (userBuildPages ?? routerBuildPages);
  // Nested layouts: the router table's per-url `route.tsx` chain resolver.
  // Threaded like Page/props so the renderer folds the nested tree.
  const effectiveLayouts = options.layouts ?? routerTable?.layouts;

  // Build options
  const preserveModulesRoot =
    options.build?.preserveModulesRoot ??
    DEFAULT_CONFIG.BUILD.preserveModulesRoot;

  // Get current mode to check if we're in development
  const currentMode = getNodeEnv(process.env.NODE_ENV);
  const isDevelopment = currentMode === "development";

  // Rollup's preserveModulesRoot works in reverse of what you'd expect:
  // - When user wants preservation (true): pass undefined to Rollup (don't strip anything)
  // - When user wants stripping (false): pass moduleBase to Rollup (strip this path)
  // CRITICAL: In development mode, NEVER strip moduleBase (src/) because Vite serves from source locations
  const preserveModulesRootString =
    !isDevelopment && preserveModulesRoot === false
      ? moduleBase // Strip src/ from output paths (production only)
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
  // Whether the USER set moduleBaseURL, as opposed to the default filling in.
  // resolveUserConfig needs the distinction: an explicit option outranks
  // Vite's config.base, but the default must NOT — otherwise config.base is
  // dead code in the precedence chain and a consumer who configures base the
  // normal Vite way builds against "/" (the un-prefixed-bootstrap 404).
  const moduleBaseURLExplicit = typeof options.moduleBaseURL === "string";

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
  const isServerFunctionCode = resolveDirectiveMatcher(
    serverDirective,
    (code: string, moduleId?: string) =>
      code.match(serverDirective) != null ||
      (typeof moduleId === "string" && serverPattern.test(moduleId)) ||
      false
  );

  // Resolution order for the client-module detectors: an explicit user hook
  // wins; otherwise a user-supplied `loader.clientDirective` /
  // `autoDiscover.clientPattern` drives the matching; otherwise the single
  // detector (`detectClientModule` behind DEFAULT_LOADER_CONFIG) decides.
  // The pattern argument must be the RAW user option — passing the
  // pre-resolved `clientDirective` (never undefined) made the anchored
  // default regex shadow the detector: `.client.tsx` modules without a
  // directive resolved to false here while the worker loader (which
  // re-resolves defaults after serialization strips function hooks) said
  // true, and user-supplied `loader.isClientComponent*` hooks were ignored
  // entirely.
  const isClientComponentCode =
    options.loader?.isClientComponentCode ??
    resolveDirectiveMatcher(
      options.loader?.clientDirective,
      DEFAULT_LOADER_CONFIG.isClientComponentCode
    );

  const isClientComponentByCode =
    options.loader?.isClientComponentByCode ??
    resolveDirectiveMatcher(
      options.loader?.clientDirective,
      DEFAULT_LOADER_CONFIG.isClientComponentByCode
    );

  const isClientComponentByName =
    options.loader?.isClientComponentByName ??
    (options.autoDiscover?.clientPattern
      ? (moduleId: string, _transformedModuleId?: string) =>
          (typeof moduleId === "string" && clientPattern.test(moduleId)) ||
          false
      : DEFAULT_LOADER_CONFIG.isClientComponentByName);

  const hashOption = options.build?.hash ?? DEFAULT_CONFIG.BUILD.hash;

  // User-facing hash function that can take source content or filename
  const hash = (input: string | null, ssr: boolean, sourceContent?: string) => {
    if (!input) return "";
    if (new RegExp(BASE_PATTERNS.EXT.NODE).test(input)) {
      return input;
    }
    
    // CRITICAL: Never hash node_modules files - Vite/Rollup handles those
    if (input.includes("node_modules")) {
      return input;
    }
    
    // CRITICAL: Never hash virtual modules (_virtual or matching virtualPattern) - Vite handles those
    const virtualPattern = resolveRegExp(
      options.autoDiscover?.virtualPattern,
      DEFAULT_CONFIG.AUTO_DISCOVER.virtualPattern
    );
    if (input.includes("_virtual") || (virtualPattern && virtualPattern.test(input))) {
      return input;
    }
    
    // Check if hashing is disabled
    if (hashOption === "false") {
      return input;
    }
    
    // Skip outputs that are addressed by canonical path rather than via the
    // build manifest, so renaming them would break their callers:
    //   - htmlPattern / rscPattern: SSG outputs at fixed route URLs
    //   - pagePattern / propsPattern / serverPattern: SSR entry modules the
    //     runtime imports by literal path (see resolvePageAndProps), not
    //     browser-served assets so caching isn't a concern either
    // Everything else falls through to content-based hashing: in a browser/
    // static build for cache-busting, and in an SSR build only for
    // client-reference modules (see the ssr guard below). Cross-environment hash
    // consistency is provided by handleSsrEntryName / handleSsrAssetName in
    // resolveUserConfig.ts (which feed sourceContent through to this function)
    // and the augmentChunkHash plugin.
    if (
      htmlPattern.test(input) ||
      rscPattern.test(input) ||
      pagePattern.test(input) ||
      propsPattern.test(input) ||
      serverPattern.test(input)
    ) {
      return input;
    }

    // Determine what to hash based on available input
    let contentToHash: string;
    
    if (sourceContent) {
      // Use provided source content (preferred)
      contentToHash = sourceContent;
    } else {
           // Try to read source file content
     try {
       const sourcePath = resolve(projectRoot, input);
       if (existsSync(sourcePath)) {
         contentToHash = readFileSync(sourcePath, 'utf-8');
         // Debug logging
         if (options.verbose) {
           logger.info(`[hash] Reading source: ${sourcePath} (${contentToHash.length} chars)`);
         }
       } else {
         // Fallback to filename
         contentToHash = input;
         if (options.verbose) {
           logger.warn(`[hash] File not found: ${sourcePath}, using filename: ${input}`);
         }
       }
     } catch (error) {
       // Fallback to filename
       contentToHash = input;
       if (options.verbose) {
         logger.warn(`[hash] Error reading ${input}: ${error}`);
       }
     }
    }
    
    // In an SSR build (server / ssr-client), only CLIENT-REFERENCE modules need
    // a content-addressed name: they're loaded by the browser via the flight, so
    // their hashed id must stay consistent with the client build. Pure
    // server-only modules are loaded by Node from disk by literal path — hashing
    // them busts no browser/CDN cache and only churns filenames (and can emit
    // duplicate chunks), so keep their names stable. The browser/static build
    // (ssr=false) still hashes everything for real cache-busting.
    if (
      ssr &&
      !isClientComponentByName(input) &&
      !isClientComponentByCode(contentToHash)
    ) {
      return input;
    }

    // Generate hash using Rollup-like algorithm
    const hashCharacters = typeof hashOption === 'object' && hashOption?.format === 'hex' ? 'hex' : 'base36';
    const contentHash = createRollupLikeHash(contentToHash, hashCharacters);
    
    // Apply naming logic
    const extensionIndex = input.lastIndexOf(".");
    if (extensionIndex !== -1) {
      const extension = input.slice(extensionIndex);
      const filename = input.slice(0, extensionIndex);
      return filename + "-" + contentHash + extension;
    } else {
      return input + "-" + contentHash;
    }
  };

  // Output path resolution
  const getOutputPath = (n: string | null, isAsset: boolean = false) => {
    if (!n) return "";
    let path = handleSearchQuery(n);
    path = path.startsWith(moduleBase + moduleBasePath)
      ? path.slice(moduleBase.length + moduleBasePath.length)
      : path;

    // For assets that are not modules, preserve the original extension
    // Only apply module transformations if the file actually matches module patterns
    if (isAsset) {
      // Check if this is a module file (JS/TS/JSX/TSX) - if so, apply module transformations
      const isModuleFile = modulePattern.test(path) || 
                          clientPattern.test(path) || 
                          serverPattern.test(path) ||
                          propsPattern.test(path) ||
                          pagePattern.test(path);
      
      // If it's not a module file, preserve the original extension
      if (!isModuleFile) {
        return path;
      }
    }

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
    
    // Fallback: only apply module pattern if we're sure it's a module
    // For assets, we've already returned above, so this is safe
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
  function entryFile(n: PreRenderedChunk, ssr: boolean, sourceContent?: string): string {
    const normalizedName = normalizer(n.name)[0];
    let outputPath = getOutputPath(normalizedName);
    
    // When preserveModulesRoot is true, preserve the src/ prefix in output paths
    if (preserveModulesRoot && n.name.startsWith("src/")) {
      // If the normalized name doesn't have src/, add it back
      if (!outputPath.startsWith("src/")) {
        // Handle the case where outputPath starts with a slash
        if (outputPath.startsWith("/")) {
          outputPath = "src" + outputPath;
        } else {
          outputPath = "src/" + outputPath;
        }
      }
    }
    
    return hash(outputPath, ssr, sourceContent);
  }

  function chunkFile(n: PreRenderedChunk, ssr: boolean, sourceContent?: string): string {
    const normalizedName = normalizer(n.name)[0];
    let outputPath = getOutputPath(normalizedName);
    
    // When preserveModulesRoot is true, preserve the src/ prefix in output paths
    if (preserveModulesRoot && n.name.startsWith("src/")) {
      // If the normalized name doesn't have src/, add it back
      if (!outputPath.startsWith("src/")) {
        // Handle the case where outputPath starts with a slash
        if (outputPath.startsWith("/")) {
          outputPath = "src" + outputPath;
        } else {
          outputPath = "src/" + outputPath;
        }
      }
    }
    
    return hash(outputPath, ssr, sourceContent);
  }

  function assetFile(n: PreRenderedAsset, _ssr: boolean = false): string {
    // Rollup may report the same asset under several `names`; dedupe so we
    // don't emit invalid comma-joined filenames like `Foo.eot,Foo.eot`. When
    // multiple distinct names survive they all reference the same emitted
    // file, so use the first as the canonical output path.
    const uniqueNames = Array.from(new Set(n.names));
    let firstName = uniqueNames[0];

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

    // For CSS files, ensure they go into the assets directory
    if (firstName.endsWith(".css")) {
      // Add assets directory prefix if not already present
      if (!firstName.startsWith(assetsDir + "/")) {
        firstName = assetsDir + "/" + firstName;
      }
      return hash(firstName, false);
    }

    // For other assets, apply the extension mapping if needed
    // Pass isAsset=true to preserve extensions for non-module assets
    return hash(getOutputPath(firstName, true), false);
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
    pages: effectiveBuildPages ?? DEFAULT_CONFIG.BUILD.pages,
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
    useHtmlWorker: options.build?.useHtmlWorker ??
      // Force useHtmlWorker to true when pages are configured (directly or via
      // the router), regardless of default logic
      (effectiveBuildPages && (Array.isArray(effectiveBuildPages) || typeof effectiveBuildPages === 'function')) ? true : DEFAULT_CONFIG.BUILD.useHtmlWorker,
    renderMode: options.build?.renderMode ?? "parallel",
    batchSize: options.build?.batchSize ?? 8,
    inlineFlight: options.build?.inlineFlight ?? false,
    edge: (() => {
      // `build.edge`: boolean | EdgeBuildConfig, default ON. `false` disables;
      // `true`/omitted enables with defaults; an object enables + overrides.
      const edge = options.build?.edge;
      const obj = edge && typeof edge === "object" ? edge : {};
      return {
        enabled: edge === false ? false : true,
        outDir: obj.outDir ?? DEFAULT_CONFIG.BUILD.edge.outDir,
        minify: obj.minify ?? DEFAULT_CONFIG.BUILD.edge.minify,
        // The global transport defaults the bake's flavor: transport:"webpack"
        // needs a webpack pair to freeze snapshots through. An explicit
        // edge.transport still wins.
        transport:
          obj.transport ??
          (options.transport === "webpack"
            ? "webpack"
            : DEFAULT_CONFIG.BUILD.edge.transport),
      };
    })(),
  } satisfies ResolvedUserOptions["build"];

  // Development configuration
  const dev = {
    useHtmlWorker: options.dev?.useHtmlWorker ?? DEFAULT_CONFIG.DEV.useHtmlWorker,
    useRscWorker: options.dev?.useRscWorker ?? DEFAULT_CONFIG.DEV.useRscWorker,
  } satisfies ResolvedUserOptions["dev"];

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
        isClientComponentByCode,
        isClientComponentByName,
        parse: options?.loader?.parse ?? DEFAULT_LOADER_CONFIG.parse,
        moduleID: options?.loader?.moduleID ?? options?.moduleID,
      } as Required<LoaderConfig>)
    : undefined;

  const pipeableStreamOptions = options.pipeableStreamOptions
    ? options.pipeableStreamOptions
    : {};

  // Return resolved options
  try {
    // transport:"webpack" contracts the whole build around the baked pair:
    // the esm SSG pass is skipped and the freeze IS the SSG backend. A config
    // that disables the bake (or pins it to esm) would silently produce no
    // snapshots at all — refuse it at config time instead.
    if (options.transport === "webpack" && !build.edge.enabled) {
      throw new Error(
        '[vite-plugin-react-server] transport:"webpack" requires the edge ' +
          "bake (build.edge) — the static snapshots render through the baked " +
          'pair. Remove `build.edge: false` or use transport:"esm".'
      );
    }
    if (options.transport === "webpack" && build.edge.transport !== "webpack") {
      throw new Error(
        '[vite-plugin-react-server] transport:"webpack" conflicts with ' +
          `build.edge.transport:"${build.edge.transport}" — one deploy ` +
          "carries one flight flavor. Drop the edge override (the global " +
          "transport already defaults it) or align the two."
      );
    }

    const userOptions: ResolvedUserOptions = {
      projectRoot,
      transport: options.transport ?? "esm",
      moduleBase,
      moduleBasePath,
      moduleBaseURL,
      moduleBaseURLExplicit,
      moduleRootPath,
      publicOrigin,
      build: build,
      dev: dev,
      verbose: options.verbose ?? DEFAULT_CONFIG.VERBOSE,
      availableEnvironments: (options as any).availableEnvironments,
      strategy: (options as any).strategy,
      onMetrics:
        typeof options.onMetrics === "function"
          ? options.onMetrics
          : DEFAULT_CONFIG.ON_METRICS,
      onEvent:
        typeof options.onEvent === "function"
          ? options.onEvent
          : DEFAULT_CONFIG.ON_EVENT,
      Page: effectivePage,
      props: effectiveProps,
      layoutsResolver: effectiveLayouts,
      layoutExportName:
        options.layoutExportName ?? DEFAULT_CONFIG.LAYOUT_EXPORT_NAME,
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
      clientPackages: options.clientPackages,
      routePatterns: effectiveRoutePatterns,
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


