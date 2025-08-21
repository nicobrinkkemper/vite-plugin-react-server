import type { CreateHandlerOptions, PanicThreshold } from "../types.js";
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
  
  // Module configuration
  projectRoot: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  moduleBasePath: string;
  moduleBase?: string;
  publicOrigin: string;
  
  // Build configuration
  build: CreateHandlerOptions["build"];
  
  // CSS configuration
  css: CreateHandlerOptions["css"];
  
  // CSS data
  cssFiles?: Map<string, any>;
  globalCss?: Map<string, any>;
  
  // Page props (must be serializable)
  pageProps: any;
  
  // Panic threshold
  panicThreshold: PanicThreshold;
  
  // Timeouts
  htmlTimeout?: number;
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
  options: CreateHandlerOptions
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
    projectRoot,
    moduleRootPath,
    moduleBaseURL,
    moduleBasePath,
    moduleBase,
    build,
    cssFiles,
    globalCss,
    pageProps,
    css,
    ...rest
  } = options;



  return {
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
    projectRoot,
    moduleRootPath,
    moduleBaseURL,
    moduleBasePath,
    moduleBase,
    build,
    css,
    cssFiles,
    globalCss,
    pageProps,
    // Include any other serializable properties using existing helper
    ...processForSerialization(rest),
  };
}
