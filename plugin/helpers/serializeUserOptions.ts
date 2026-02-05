import type { ResolvedConfig, ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  ResolvedUserOptions,
  PagePropOpt,
  InlineCssOpt,
} from "../types.js";
import { cleanObject } from "./cleanObject.js";

// Common non-serializable functions in Vite's resolved config
const VITE_NON_SERIALIZABLE = new Set([
  "renderChunk", "buildStart", "buildEnd", "watchChange", "resolveId",
  "config", "transform", "handler", "configureServer",
  "shouldTransformCachedModule", "generateBundle", "renderStart",
  "writeBundle", "hotUpdate", "configResolved", "configurePreviewServer",
  "handleHotUpdate", "load", "augmentChunkHash", "closeBundle",
  "entryFileNames", "assetFileNames", "chunkFileNames", "createEnvironment",
  "sourcemapIgnoreList", "assetsInclude", "info", "warn", "warnOnce",
  "error", "clearScreen", "hasErrorLogged", "set", "plugins",
  "getSortedPlugins", "getSortedPluginHooks", "createResolver", "fsDenyGlob",
  "output[].entryFileNames", "output[].chunkFileNames",
  "output[].assetFileNames",
  // Nested plugin versions
  ...["renderChunk", "buildStart", "buildEnd", "watchChange", "resolveId",
    "config", "transform", "handler", "configureServer",
    "shouldTransformCachedModule", "generateBundle", "renderStart",
    "writeBundle", "hotUpdate", "configResolved", "configurePreviewServer",
    "handleHotUpdate", "load", "augmentChunkHash", "closeBundle",
    "entryFileNames", "assetFileNames", "chunkFileNames", "createEnvironment",
    "sourcemapIgnoreList", "assetsInclude",
  ].map(k => `plugins[].${k}`),
]);

// Common non-serializable functions in plugin options
const PLUGIN_NON_SERIALIZABLE = new Set([
  "Page", "props", "normalizer", "CssCollector", "Html",
  "onEvent", "onMetrics", "build.entryFile", "build.chunkFile",
  "build.assetFile", "build.pages", "autoDiscover",
]);

/**
 * Recursively restores serialized RegExp objects ({ __isRegExp, source, flags }).
 */
export function deserializeRegExp(obj: any): any {
  if (obj && obj.__isRegExp) return new RegExp(obj.source, obj.flags);
  if (Array.isArray(obj)) return obj.map(deserializeRegExp);
  if (obj && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deserializeRegExp(value);
    }
    return result;
  }
  return obj;
}

/**
 * Recursively converts RegExp instances to a serializable form.
 */
function processForSerialization(obj: any): any {
  if (obj instanceof RegExp) {
    return { source: obj.source, flags: obj.flags, __isRegExp: true };
  }
  if (Array.isArray(obj)) return obj.map(processForSerialization);
  if (obj && typeof obj === "object") {
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
  nonSerializable: Set<string> = VITE_NON_SERIALIZABLE
) {
  const {
    getSortedPluginHooks: _a,
    getSortedPlugins: _b,
    assetsInclude: _c,
    ...rest
  } = config;
  return processForSerialization(cleanObject(rest, nonSerializable));
}

export const serializedDevServerConfig = <T extends ViteDevServer["config"]>(
  config: T,
  nonSerializable: Set<string> = PLUGIN_NON_SERIALIZABLE
) => {
  const {
    getSortedPluginHooks: _a,
    getSortedPlugins: _b,
    assetsInclude: _c,
    build: _d,
    ...rest
  } = config;
  return processForSerialization(cleanObject(rest, nonSerializable));
};

export const serializedOptions = <
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(
  userOptions: ResolvedUserOptions<T, InlineCSS>,
  autoDiscoveredFiles: AutoDiscoveredFiles,
  nonSerializable: Set<string> = PLUGIN_NON_SERIALIZABLE
) => {
  const {
    Page: _a,
    props: _b,
    normalizer: _c,
    CssCollector: _d,
    Html: _e,
    onEvent: _f,
    onMetrics: _g,
    build,
    autoDiscover: _h,
    ...rest
  } = userOptions;
  const { entryFile: _i, chunkFile: _j, assetFile: _k, pages: _l, ...buildRest } =
    build ?? {};
  const result = {
    ...rest,
    build: {
      ...buildRest,
      pages: autoDiscoveredFiles
        ? Array.from(autoDiscoveredFiles.urlMap.keys())
        : [],
    },
  };
  return processForSerialization(cleanObject(result, nonSerializable));
};

export function hydrateUserOptions(userOptions: any) {
  return userOptions ? deserializeRegExp(userOptions) : userOptions;
}
