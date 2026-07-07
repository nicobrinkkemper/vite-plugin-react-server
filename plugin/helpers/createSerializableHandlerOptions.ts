import type { CreateHandlerOptions, PanicThreshold } from "../types.js";
import type { RouteLayer } from "../router/scanRoutes.js";
import { cleanObject } from "./cleanObject.js";
import { processForSerialization } from "./serializeUserOptions.js";

/**
 * Serializable handler options that can be safely passed to workers
 * 
 * This extracts only the serializable parts of CreateHandlerOptions,
 * excluding functions, React components, and other non-serializable data.
 * 
 * WHAT'S INCLUDED:
 * - All primitive values (strings, numbers, booleans)
 * - Configuration objects (build, userOptions, etc.)
 * - File paths and URLs
 * - CSS data (cssFiles, globalCss)
 * 
 * WHAT'S EXCLUDED:
 * - React components (PageComponent, RootComponent, HtmlComponent)
 * - Functions (loader, normalizer, onEvent, onMetrics)
 * - Logger instances
 * - Module IDs and autoDiscover functions
 */
export interface SerializableHandlerOptions {
  // Core identification
  id?: string;
  route: string;
  url: string;
  
  // File paths
  pagePath: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  
  // Export names
  pageExportName: string;
  propsExportName: string;
  rootExportName: string;
  htmlExportName: string;
  layoutExportName?: string;

  // Nested layouts: matched route's root→leaf `route.tsx` layer paths (plain
  // strings — cloneable across the worker boundary).
  layouts?: RouteLayer[];
  
  // Module configuration
  projectRoot: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  moduleBasePath: string;
  moduleBase?: string;
  publicOrigin: string;
  
  // Build configuration
  build: CreateHandlerOptions["build"];
  dev: CreateHandlerOptions["dev"];
  
  // CSS configuration
  css: CreateHandlerOptions["css"];
  
  // Auto-discovery configuration
  autoDiscover?: CreateHandlerOptions["autoDiscover"]
  
  // CSS data
  cssFiles?: Map<string, any>;
  globalCss?: Map<string, any>;
  
  // Page props (must be serializable)
  pageProps: any;

  // Route patterns for request-time param resolution (plain strings, cloneable)
  routePatterns?: readonly string[];
  // Precomputed params (plain object, cloneable). `request` is intentionally
  // excluded — a Request can't cross the worker boundary.
  params?: Record<string, string>;

  // Panic threshold
  panicThreshold: PanicThreshold;
  
  // Timeouts
  htmlTimeout?: number;
  
  // Stream options
  clientPipeableStreamOptions?: Omit<NonNullable<CreateHandlerOptions["clientPipeableStreamOptions"]>, `on${string}` | 'filterStackFrame'>;
  serverPipeableStreamOptions?: Omit<NonNullable<CreateHandlerOptions["serverPipeableStreamOptions"]>, `on${string}`>;
}

/**
 * Creates serializable handler options from full CreateHandlerOptions
 * 
 * This function strips out non-serializable parts (React components, functions)
 * and returns only the data that can be safely passed to workers.
 * 
 * @param options - Full CreateHandlerOptions object
 * @returns Serializable options for worker communication
 */
export function createSerializableHandlerOptions(
  options: Partial<CreateHandlerOptions>
): SerializableHandlerOptions {
  const {
    // Extract serializable parts
    id,
    route,
    url,
    pagePath,
    propsPath,
    rootPath,
    htmlPath,
    pageExportName,
    propsExportName,
    rootExportName,
    htmlExportName,
    layoutExportName,
    layouts,
    projectRoot,
    moduleRootPath,
    moduleBaseURL,
    moduleBasePath,
    moduleBase,
    build,
    cssFiles,
    globalCss,
    pageProps,
    routePatterns,
    params,
    css,
    autoDiscover,
    clientPipeableStreamOptions,
    serverPipeableStreamOptions,
    ...rest
  } = options;


  const result: any = {
    route: route || "",
    url: url || "",
  };

  // Only include properties if they exist
  if (typeof id === 'string') result.id = id;
  if (typeof pagePath === 'string') result.pagePath = pagePath;
  if (typeof propsPath === 'string') result.propsPath = propsPath;
  if (typeof rootPath === 'string') result.rootPath = rootPath;
  if (typeof htmlPath === 'string') result.htmlPath = htmlPath;
  if (typeof pageExportName === 'string') result.pageExportName = pageExportName;
  if (typeof propsExportName === 'string') result.propsExportName = propsExportName;
  if (typeof rootExportName === 'string') result.rootExportName = rootExportName;
  if (typeof htmlExportName === 'string') result.htmlExportName = htmlExportName;
  if (typeof layoutExportName === 'string') result.layoutExportName = layoutExportName;
  if (Array.isArray(layouts) && layouts.length) {
    // RouteLayer entries are plain string paths — structured-clone safe.
    result.layouts = layouts.map((l) => ({
      component: l.component,
      ...(l.props ? { props: l.props } : {}),
    }));
  }
  if (typeof projectRoot === 'string') result.projectRoot = projectRoot;
  if (typeof moduleRootPath === 'string') result.moduleRootPath = moduleRootPath;
  if (typeof moduleBaseURL === 'string') result.moduleBaseURL = moduleBaseURL;
  if (typeof moduleBasePath === 'string') result.moduleBasePath = moduleBasePath;
  if (typeof moduleBase === 'string') result.moduleBase = moduleBase;
  if (build != null) {
    // Clean the build object to remove functions that can't be cloned
    const cleanedBuild = cleanObject(build, new Set([
      "entryFile",
      "chunkFile", 
      "assetFile"
    ]));
    result.build = processForSerialization(cleanedBuild);
  }

  // Clean the entire options object to remove other non-serializable functions
  const cleanedOptions = cleanObject(rest, new Set([
    "normalizer",
    "loader",
    "onEvent",
    "onMetrics"
  ]));
  const processedRest = processForSerialization(cleanedOptions);
  if (css != null) result.css = css;
  if (autoDiscover != null) {
    // Clean the autoDiscover object to remove functions that can't be cloned
    const cleanedAutoDiscover = cleanObject(autoDiscover);
    result.autoDiscover = processForSerialization(cleanedAutoDiscover);
  }
  if (cssFiles != null) result.cssFiles = cssFiles;
  if (globalCss != null) result.globalCss = globalCss;
  if (pageProps != null) result.pageProps = pageProps;
  if (routePatterns != null) result.routePatterns = [...routePatterns];
  if (params != null) result.params = params;
  if (clientPipeableStreamOptions != null) {
    // Use the existing helper to clean the object - this will handle all non-function properties
    const cleanedClientOptions = cleanObject(clientPipeableStreamOptions);
    result.clientPipeableStreamOptions = processForSerialization(cleanedClientOptions);
  }
  if (serverPipeableStreamOptions != null) {
    // Use the existing helper to clean the object - this will handle all non-function properties
    const cleanedServerOptions = cleanObject(serverPipeableStreamOptions);
    result.serverPipeableStreamOptions = processForSerialization(cleanedServerOptions);
    
      }

  // Include any other serializable properties using existing helper
  return {
    ...result,
    ...processedRest,
  };
}
