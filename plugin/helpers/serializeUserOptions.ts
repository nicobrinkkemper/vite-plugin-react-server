import type { ResolvedConfig, ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserOptions,
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

  // Clean the object to remove non-serializable properties
  return cleanObject(handlerOptions, knownNonSerializableFunctions);
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
  return cleanObject(
    handlerOptions,
    customNonSerializableFunctions
  )
};

// For your own options (if you need custom non-serializable functions)
export const serializedOptions = <T extends ResolvedUserOptions>(
  userOptions: T,
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
  const { entryFile, chunkFile, assetFile, pages, ...buildOptions } = build;
  const result = {
    ...handlerOptions,
    build: {
      ...buildOptions,
      pages: autoDiscoveredFiles
        ? Array.from(autoDiscoveredFiles.urlMap.keys())
        : [],
    },
  };

  // Clean the object to remove non-serializable properties
  return cleanObject(
    result,
    customNonSerializableFunctions
  );
};
