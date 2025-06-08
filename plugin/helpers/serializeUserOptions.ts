import type { ResolvedConfig, ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserOptions,
  PagePropOpt,
  InlineCssOpt,
  SerializableRecord,
  ResolvedUserConfig,
  SerializedUserOptions,
} from "../types.js";
import { cleanObject } from "./cleanObject.js";
import { resolveOptions } from "../config/resolveOptions.js";

// Common non-serializable functions in Vite's resolved config
const VITE_NON_SERIALIZABLE_FUNCTIONS = new Set([
  "renderChunk",
  "buildStart",
  "buildEnd",
  "watchChange",
  "resolveId",
  "config",
  "output[].entryFileNames",
  "output[].chunkFileNames",
  "output[].assetFileNames",
  "transform",
  "handler",
  "configureServer",
  "shouldTransformCachedModule",
  "generateBundle",
  "renderStart",
  "writeBundle",
  "hotUpdate",
  "configResolved",
  "configurePreviewServer",
  "handleHotUpdate",
  "load",
  "augmentChunkHash",
  "closeBundle",
  "entryFileNames",
  "assetFileNames",
  "chunkFileNames",
  "createEnvironment",
  "sourcemapIgnoreList",
  "assetsInclude",
  "info",
  "warn",
  "warnOnce",
  "error",
  "clearScreen",
  "hasErrorLogged",
  "set",
  "plugins",
  "getSortedPlugins",
  "getSortedPluginHooks",
  "createResolver",
  "fsDenyGlob",
  // Nested plugin functions
  "plugins[].renderChunk",
  "plugins[].buildStart",
  "plugins[].buildEnd",
  "plugins[].watchChange",
  "plugins[].resolveId",
  "plugins[].config",
  "plugins[].transform",
  "plugins[].handler",
  "plugins[].configureServer",
  "plugins[].shouldTransformCachedModule",
  "plugins[].generateBundle",
  "plugins[].renderStart",
  "plugins[].writeBundle",
  "plugins[].hotUpdate",
  "plugins[].configResolved",
  "plugins[].configurePreviewServer",
  "plugins[].handleHotUpdate",
  "plugins[].load",
  "plugins[].augmentChunkHash",
  "plugins[].closeBundle",
  "plugins[].entryFileNames",
  "plugins[].assetFileNames",
  "plugins[].chunkFileNames",
  "plugins[].createEnvironment",
  "plugins[].sourcemapIgnoreList",
  "plugins[].assetsInclude",
]);

// Common non-serializable functions in our plugin's options
const PLUGIN_NON_SERIALIZABLE_FUNCTIONS = new Set([
  "Page",
  "props",
  "normalizer",
  "CssCollector",
  "Html",
  "onEvent",
  "onMetrics",
  "build.entryFile",
  "build.chunkFile",
  "build.assetFile",
  "build.pages",
  "autoDiscover",
]);

// Helper function to serialize RegExp objects
function serializeRegExp(regex: RegExp) {
  return {
    source: regex.source,
    flags: regex.flags,
    __isRegExp: true,
  };
}

// Helper function to deserialize RegExp objects
export function deserializeRegExp<T>(obj: T): Extract<T, SerializableRecord> {
  if (
    obj &&
    typeof obj === "object" &&
    obj != null &&
    "__isRegExp" in obj &&
    typeof obj["__isRegExp"] === "boolean" &&
    "source" in obj &&
    typeof obj["source"] === "string" &&
    "flags" in obj &&
    typeof obj["flags"] === "string"
  ) {
    return new RegExp(obj["source"], obj["flags"]) as unknown as Extract<
      T,
      SerializableRecord
    >;
  }
  if (Array.isArray(obj)) {
    return obj.map(deserializeRegExp) as unknown as Extract<
      T,
      SerializableRecord
    >;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deserializeRegExp(value) as unknown as Extract<
        T,
        SerializableRecord
      >[keyof T];
    }
    return result as unknown as Extract<T, SerializableRecord>;
  }
  return obj as unknown as Extract<T, SerializableRecord>;
}

// Helper function to recursively process objects for serialization
export function processForSerialization<T>(
  obj: T
): Extract<T, SerializableRecord> {
  if (obj instanceof RegExp) {
    return serializeRegExp(obj) as unknown as Extract<T, SerializableRecord>;
  }
  if (Array.isArray(obj)) {
    return obj.map(processForSerialization) as unknown as Extract<
      T,
      SerializableRecord
    >;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = processForSerialization(value) as unknown as Extract<
        T,
        SerializableRecord
      >[keyof T];
    }
    return result as unknown as Extract<T, SerializableRecord>;
  }
  return obj as unknown as Extract<T, SerializableRecord>;
}

export function serializeResolvedConfig<T extends ResolvedConfig>(
  config: T,
  knownNonSerializableFunctions: Set<string> = VITE_NON_SERIALIZABLE_FUNCTIONS
) {
  const {
    getSortedPluginHooks: _getSortedPluginHooks,
    getSortedPlugins: _getSortedPlugins,
    assetsInclude: _assetsInclude,
    // extract known vite function properties
    ...handlerOptions
  } = config;

  // Clean the object to remove non-serializable properties and process RegExp objects
  return processForSerialization(
    cleanObject(handlerOptions, knownNonSerializableFunctions)
  );
}

export function serializeResolvedUserConfig<T extends ResolvedUserConfig>(
  config: T,
  knownNonSerializableFunctions: Set<string> = VITE_NON_SERIALIZABLE_FUNCTIONS
) {
  const {
    assetsInclude: _assetsInclude,
    // extract known vite function properties
    ...handlerOptions
  } = config;

  // Clean the object to remove non-serializable properties and process RegExp objects
  return processForSerialization(
    cleanObject(handlerOptions, knownNonSerializableFunctions)
  );
}

// For Vite's config
export const serializedDevServerConfig = <T extends ViteDevServer["config"]>(
  config: T,
  customNonSerializableFunctions: Set<string> = PLUGIN_NON_SERIALIZABLE_FUNCTIONS
) => {
  const {
    getSortedPluginHooks: _getSortedPluginHooks,
    getSortedPlugins: _getSortedPlugins,
    assetsInclude: _assetsInclude,
    build: _build,
    ...handlerOptions
  } = config;
  return processForSerialization(
    cleanObject(handlerOptions, customNonSerializableFunctions)
  );
};

// For your own options (if you need custom non-serializable functions)
export const serializedOptions = <
  T extends PagePropOpt = PagePropOpt,
  N1 extends string = "Page",
  N2 extends string = "props",
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(
  userOptions: ResolvedUserOptions<T, InlineCSS, N1, N2>,
  autoDiscoveredFiles: AutoDiscoveredFiles,
  customNonSerializableFunctions: Set<string> = PLUGIN_NON_SERIALIZABLE_FUNCTIONS
) => {
  const {
    Page: _Page,
    props: _props,
    normalizer: _normalizer,
    CssCollector: _CssCollector,
    Html: _Html,
    onEvent: _onEvent,
    onMetrics: _onMetrics,
    build: _build,
    autoDiscover: autoDiscover,
    propsExportName: propsExportName,
    pageExportName: pageExportName,
    ...handlerOptions
  } = userOptions;
  const {
    entryFile: _entryFile,
    chunkFile: _chunkFile,
    assetFile: _assetFile,
    pages: _pages,
    ...buildOptions
  } = _build ?? {};
  const {
    modulePattern: _modulePattern,
    cssPattern: _cssPattern,
    jsonPattern: _jsonPattern,
    clientComponents: _clientComponents,
    propsPattern: _propsPattern,
    pagePattern: _pagePattern,
    htmlPattern: _htmlPattern,
    rscPattern: _rscPattern,
    serverFunctions: _serverFunctions,
    cssModulePattern: _cssModulePattern,
    vendorPattern: _vendorPattern,
    nodeOnly: _nodeOnly,
    dotFiles: _dotFiles,
    virtualPattern: _virtualPattern,
    isServerFunctionCode: _isServerFunctionCode,
    isClientComponentCode: _isClientComponentCode,
    // known regexp
    moduleExtension: moduleExtension,
    serverDirective: serverDirective,
    clientDirective: clientDirective,
    ...serializedAutoDiscover
  } = autoDiscover;
  const result = {
    ...handlerOptions,
    propsExportName: propsExportName,
    pageExportName: pageExportName,
    build: {
      ...buildOptions,
      pages: autoDiscoveredFiles
        ? Array.from(autoDiscoveredFiles.urlMap.keys())
        : [],
    },
    autoDiscover: {
      moduleDirective: serializeRegExp(moduleExtension),
      serverDirective: serializeRegExp(serverDirective),
      clientDirective: serializeRegExp(clientDirective),
      ...serializedAutoDiscover,
    },
  };

  // Clean the object to remove non-serializable properties and process RegExp objects
  return processForSerialization(
    cleanObject(result, customNonSerializableFunctions)
  );
};

export function hydrateUserOptions<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt,
  N1 extends string = "Page",
  N2 extends string = "props"
>(
  userOptions: SerializedUserOptions<T, InlineCSS, N1, N2>
) {
  if (!userOptions) {
    return userOptions;
  }

  // Restore RegExp objects
  if (typeof userOptions === "object" && "autoDiscover" in userOptions) {
    const { autoDiscover } = userOptions;
    const { moduleDirective, serverDirective, clientDirective } = autoDiscover;
    if (moduleDirective) {
      userOptions.autoDiscover.moduleDirective = deserializeRegExp(moduleDirective);
    }
    if (serverDirective) {
      userOptions.autoDiscover.serverDirective = deserializeRegExp(serverDirective);
    }
    if (clientDirective) {
      userOptions.autoDiscover.clientDirective = deserializeRegExp(clientDirective);
    }
  }

  return resolveOptions(deserializeRegExp(userOptions) as never)
}
