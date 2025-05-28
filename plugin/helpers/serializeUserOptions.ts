import type { ResolvedConfig, ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserOptions,
  PagePropOpt,
  InlineCssOpt,
} from "../types.js";
import { cleanObject } from "./cleanObject.js";

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
    __isRegExp: true
  };
}

// Helper function to deserialize RegExp objects
export function deserializeRegExp(obj: any): any {
  if (obj && obj.__isRegExp) {
    return new RegExp(obj.source, obj.flags);
  }
  if (Array.isArray(obj)) {
    return obj.map(deserializeRegExp);
  }
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deserializeRegExp(value);
    }
    return result;
  }
  return obj;
}

// Helper function to recursively process objects for serialization
export function processForSerialization(obj: any): any {
  if (obj instanceof RegExp) {
    return serializeRegExp(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(processForSerialization);
  }
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = processForSerialization(value);
    }
    return result;
  }
  return obj;
}

export function serializeResolvedConfig<T extends ResolvedConfig>(
  config: T,
  knownNonSerializableFunctions: Set<string> = VITE_NON_SERIALIZABLE_FUNCTIONS
) {
  const {
    getSortedPluginHooks,
    getSortedPlugins,
    assetsInclude,
    // extract known vite function properties
    ...handlerOptions
  } = config;

  // Clean the object to remove non-serializable properties and process RegExp objects
  return processForSerialization(cleanObject(handlerOptions, knownNonSerializableFunctions));
}

// For Vite's config
export const serializedDevServerConfig = <T extends ViteDevServer["config"]>(
  config: T,
  customNonSerializableFunctions: Set<string> = PLUGIN_NON_SERIALIZABLE_FUNCTIONS
) => {
  const {
    getSortedPluginHooks,
    getSortedPlugins,
    assetsInclude,
    build,
    ...handlerOptions
  } = config;
  return processForSerialization(cleanObject(
    handlerOptions,
    customNonSerializableFunctions
  ));
};

// For your own options (if you need custom non-serializable functions)
export const serializedOptions = <T extends PagePropOpt = PagePropOpt, InlineCSS extends InlineCssOpt = InlineCssOpt>(
  userOptions: ResolvedUserOptions<T, InlineCSS>,
  autoDiscoveredFiles: AutoDiscoveredFiles,
  customNonSerializableFunctions: Set<string> = PLUGIN_NON_SERIALIZABLE_FUNCTIONS
) => {
  const {
    Page,
    props,
    normalizer,
    CssCollector,
    Html,
    onEvent,
    onMetrics,
    build,
    autoDiscover,
    ...handlerOptions
  } = userOptions;
  const { entryFile, chunkFile, assetFile, pages, ...buildOptions } = build ?? {};
  const result = {
    ...handlerOptions,
    build: {
      ...buildOptions,
      pages: autoDiscoveredFiles
        ? Array.from(autoDiscoveredFiles.urlMap.keys())
        : [],
    },
  };

  // Clean the object to remove non-serializable properties and process RegExp objects
  return processForSerialization(cleanObject(
    result,
    customNonSerializableFunctions
  ));
};

export function hydrateUserOptions(userOptions: any) {
  if (!userOptions) return userOptions;
  
  // Restore RegExp objects
  if (userOptions.autoDiscover) {
    const { autoDiscover } = userOptions;
    for (const key in autoDiscover) {
      if (typeof autoDiscover[key] === 'string' && autoDiscover[key].startsWith('__REGEXP__')) {
        autoDiscover[key] = deserializeRegExp(autoDiscover[key]);
      }
    }
  }
  
  return userOptions;
}
