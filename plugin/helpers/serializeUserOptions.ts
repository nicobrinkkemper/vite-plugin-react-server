import type { ResolvedConfig, ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserOptions,
  SerializableRecord,
  ResolvedUserConfig,
  SerializedUserOptions,
  Serializable,
} from "../types.js";
import { cleanObject } from "./cleanObject.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

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
  "Root",
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
    // Check if this is a serialized Map (array of [key, value] pairs)
    if (obj.length > 0 && Array.isArray(obj[0]) && obj[0].length === 2) {
      return new Map(obj) as unknown as Extract<T, SerializableRecord>;
    }
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
): Extract<T, Serializable> {
  if (obj instanceof RegExp) {
    return serializeRegExp(obj) as unknown as Extract<T, Serializable>;
  }
  if (obj instanceof Map) {
    // Convert Map to array of [key, value] pairs for serialization
    return Array.from(obj.entries()) as unknown as Extract<T, Serializable>;
  }
  if (Array.isArray(obj)) {
    return obj.map(processForSerialization) as unknown as Extract<
      T,
      Serializable
    >;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = processForSerialization(value) as unknown as Extract<
        T,
        Serializable
      >[keyof T];
    }
    return result as unknown as Extract<T, Serializable>;
  }
  return obj as unknown as Extract<T, Serializable>;
}

export function serializeResolvedConfig<T extends ResolvedConfig = ResolvedConfig>(
  config: T,
  knownNonSerializableFunctions: Set<string> = VITE_NON_SERIALIZABLE_FUNCTIONS
) {
  const {
    getSortedPluginHooks: _getSortedPluginHooks,
    getSortedPlugins: _getSortedPlugins,
    assetsInclude: _assetsInclude,
    environments: _environments,
    // extract known vite function properties
    ...handlerOptions
  } = config;

  // Preserve a minimal environments structure for CSS processing
  const minimalEnvironments = _environments ? {
    client: {
      resolve: { conditions: ['browser', 'module', 'import'] },
      consumer: 'client',
      optimizeDeps: { include: [] },
      dev: { optimizeDeps: { include: [] } },
      build: { outDir: 'dist' },
    },
    ssr: {
      resolve: { conditions: ['node', 'import'] },
      consumer: 'server', 
      optimizeDeps: { include: [] },
      dev: { optimizeDeps: { include: [] } },
      build: { outDir: 'dist' },
    },
  } : undefined;

  // Clean the object to remove non-serializable properties and process RegExp objects
  const cleaned = cleanObject(handlerOptions, knownNonSerializableFunctions) as any;
  
  // Add back the minimal environments if they existed
  if (minimalEnvironments) {
    cleaned.environments = minimalEnvironments;
  }
  
  return processForSerialization(cleaned);
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
export const serializedOptions = <T extends ResolvedUserOptions>(
  userOptions: T,
  autoDiscoveredFiles: AutoDiscoveredFiles,
  customNonSerializableFunctions: Set<string> = PLUGIN_NON_SERIALIZABLE_FUNCTIONS
): SerializedUserOptions => {
  const {
    Page: _Page,
    props: _props,
    normalizer: _normalizer,
    Root: _Root,
    Html: _Html,
    onEvent: _onEvent,
    onMetrics: _onMetrics,
    build: _build,
    loader: _loader,
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
  // Preserve the build properties that should be serialized
  // Respect user options first, then fall back to defaults
  const serializedBuild = {
    ...DEFAULT_CONFIG.BUILD,  // Start with defaults
    ...buildOptions,          // Override with user options
    pages: autoDiscoveredFiles
      ? Array.from(autoDiscoveredFiles.urlMap.keys())
      : [],
  };
  const {
    isServerFunctionCode: _isServerFunctionCode,
    isClientComponentCode: _isClientComponentCode,
    isClientComponentByCode: _isClientComponentByCode,
    isClientComponentByName: _isClientComponentByName,
    getDirectiveType: _getDirectiveType,
    allowedDirectives: allowedDirectives,
    ...loaderOptions
  } = _loader ?? {};
  const {
    modulePattern: _modulePattern,
    cssPattern: _cssPattern,
    jsonPattern: _jsonPattern,
    clientPattern: _clientPattern,
    propsPattern: _propsPattern,
    pagePattern: _pagePattern,
    htmlPattern: _htmlPattern,
    rscPattern: _rscPattern,
    serverPattern: _serverPattern,
    cssModulePattern: _cssModulePattern,
    vendorPattern: _vendorPattern,
    nodePattern: _nodePattern,
    dotPattern: _dotPattern,
    virtualPattern: _virtualPattern,
    ...serializedAutoDiscover
  } = autoDiscover;
  const result = {
    ...handlerOptions,
    Page: typeof _Page === 'string' ? _Page : undefined,
    Html: typeof _Html === 'string' ? _Html : undefined,
    Root: typeof _Root === 'string' ? _Root : undefined,
    normalizer: undefined,
    onEvent: undefined,
    onMetrics: undefined,
    propsExportName: propsExportName,
    pageExportName: pageExportName,
    build: serializedBuild,
    loader: {
      directivePattern: {
        config: {
          validate: undefined,
          ...allowedDirectives,
        },
      },
      ...loaderOptions,
    },
    autoDiscover: {
      modulePattern: serializeRegExp(_modulePattern),
      serverPattern: serializeRegExp(_serverPattern),
      clientPattern: serializeRegExp(_clientPattern),
      pagePattern: serializeRegExp(_pagePattern),
      propsPattern: serializeRegExp(_propsPattern),
      cssPattern: serializeRegExp(_cssPattern),
      jsonPattern: serializeRegExp(_jsonPattern),
      htmlPattern: serializeRegExp(_htmlPattern),
      cssModulePattern: serializeRegExp(_cssModulePattern),
      vendorPattern: serializeRegExp(_vendorPattern),
      nodePattern: serializeRegExp(_nodePattern),
      dotPattern: serializeRegExp(_dotPattern),
      virtualPattern: serializeRegExp(_virtualPattern),
      rscPattern: serializeRegExp(_rscPattern),
      ...serializedAutoDiscover,
    },
  } as const

  // Clean the object to remove non-serializable properties and process RegExp objects
  const finalResult = processForSerialization(
    cleanObject(result, customNonSerializableFunctions)
  );
  return finalResult as never
};