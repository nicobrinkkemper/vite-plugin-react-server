import type { ResolvedConfig, ResolvedDevEnvironmentOptions, ViteDevServer } from "vite";
import type { AutoDiscoveredFiles, ResolvedUserOptions } from "../types.js";
import { isMainThread } from "node:worker_threads";

type Primitive = string | number | boolean | null | undefined;

interface StringRecord {
  [key: string]: string | StringRecord;
}

// Common non-serializable functions in Vite's resolved config
const VITE_NON_SERIALIZABLE_FUNCTIONS = new Set([
  'renderChunk',
  'buildStart',
  'buildEnd',
  'watchChange',
  'resolveId',
  'config',
  'transform',
  'handler',
  'configureServer',
  'shouldTransformCachedModule',
  'generateBundle',
  'renderStart',
  'writeBundle',
  'hotUpdate',
  'configResolved',
  'configurePreviewServer',
  'handleHotUpdate',
  'load',
  'augmentChunkHash',
  'closeBundle',
  'entryFileNames',
  'assetFileNames',
  'chunkFileNames',
  'createEnvironment',
  'sourcemapIgnoreList',
  'assetsInclude',
  'info',
  'warn',
  'warnOnce',
  'error',
  'clearScreen',
  'hasErrorLogged',
  'set',
  'plugins',
  'getSortedPlugins',
  'getSortedPluginHooks',
  'createResolver',
  'fsDenyGlob',
  // Nested plugin functions
  'plugins[].renderChunk',
  'plugins[].buildStart',
  'plugins[].buildEnd',
  'plugins[].watchChange',
  'plugins[].resolveId',
  'plugins[].config',
  'plugins[].transform',
  'plugins[].handler',
  'plugins[].configureServer',
  'plugins[].shouldTransformCachedModule',
  'plugins[].generateBundle',
  'plugins[].renderStart',
  'plugins[].writeBundle',
  'plugins[].hotUpdate',
  'plugins[].configResolved',
  'plugins[].configurePreviewServer',
  'plugins[].handleHotUpdate',
  'plugins[].load',
  'plugins[].augmentChunkHash',
  'plugins[].closeBundle',
  'plugins[].entryFileNames',
  'plugins[].assetFileNames',
  'plugins[].chunkFileNames',
  'plugins[].createEnvironment',
  'plugins[].sourcemapIgnoreList',
  'plugins[].assetsInclude'
]);

// Common non-serializable functions in our plugin's options
const PLUGIN_NON_SERIALIZABLE_FUNCTIONS = new Set([
  'Page',
  'props',
  'normalizer',
  'CssCollector',
  'Html',
  'onEvent',
  'onMetrics',
  'build.entryFile',
  'build.chunkFile',
  'build.assetFile',
  'build.pages',
  'autoDiscover'
]);

function cleanObject(obj: any, knownNonSerializableFunctions: Set<string>, currentPath: string = ''): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((x, i) => cleanObject(x, knownNonSerializableFunctions, `${currentPath}[${i}]`)).filter(x => x !== undefined);
  }
  
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;
    // handle array [n] to [] 
    if (typeof value === 'function' || knownNonSerializableFunctions.has(fullPath.replace(/\[\d+\]/g, '[]'))) {
      // Skip functions and known non-serializable properties
      continue;
    } else if (typeof value === 'object' && value !== null) {
      const cleaned = cleanObject(value, knownNonSerializableFunctions, fullPath);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    } else {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function serializeUserOptions(
  userOptions: ResolvedUserOptions, 
  autoDiscoveredFiles?: AutoDiscoveredFiles | null | undefined,
  knownNonSerializableFunctions: Set<string> = PLUGIN_NON_SERIALIZABLE_FUNCTIONS
) {
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
      pages: autoDiscoveredFiles ? Array.from(autoDiscoveredFiles.urlMap.keys()) : []
    },
  };
  
  // Clean the object to remove non-serializable properties
  return cleanObject(result, knownNonSerializableFunctions);
}

export function serializeResolvedConfig(
  config: ResolvedConfig,
  knownNonSerializableFunctions: Set<string> = VITE_NON_SERIALIZABLE_FUNCTIONS
): StringRecord {
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
export const serializedConfig = (config: ResolvedConfig | ViteDevServer['config'], customNonSerializableFunctions: Set<string> = PLUGIN_NON_SERIALIZABLE_FUNCTIONS) => {
  const {
    getSortedPluginHooks,
    getSortedPlugins,
    ...handlerOptions
  } = config;
  return cleanObject(handlerOptions, customNonSerializableFunctions)
}

// For your own options (if you need custom non-serializable functions)
export const serializedOptions = (options: ResolvedUserOptions, autoDiscoveredFiles: AutoDiscoveredFiles, customNonSerializableFunctions: Set<string> = PLUGIN_NON_SERIALIZABLE_FUNCTIONS) => {
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
  } = options;
  const { entryFile, chunkFile, assetFile, pages, ...buildOptions } = build;
  return cleanObject({
    ...handlerOptions,
    build: {
      ...buildOptions,
      pages: Array.from(autoDiscoveredFiles.urlMap.keys())
    },
  }, customNonSerializableFunctions);
}
