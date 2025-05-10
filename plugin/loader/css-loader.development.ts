import { type MessagePort } from "node:worker_threads";
import type { LoadHookContext } from "node:module";
import type { LoaderContext, SerializedUserConfig } from "../types.js";
import { fileURLToPath } from "node:url";
import { preprocessCSS } from "vite";
import type { ResolvedConfig } from "vite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Global port for communication between the main thread and the CSS loader.
 * This port is used to send CSS file requests and receive responses.
 */
export let loaderPort: MessagePort | undefined;

/**
 * Tracks CSS files used by each page.
 * Maps page URLs to sets of CSS file paths that are used by that page.
 */
const cssFilesByPage = new Map<string, Set<string>>();

let currentPage: string | null = null;
let resolvedConfig: ResolvedConfig | undefined;
// Get environment variables
const env = import.meta?.env || {
  BASE_URL: '/',
  DEV: true,
  MODE: 'development',
  PROD: false,
  SSR: true
};

/**
 * Initializes the CSS loader with the necessary communication channels.
 * Sets up message handlers for CSS file requests and responses.
 *
 * @param data - Configuration data for the CSS loader
 * @param data.port - The message port for communication
 */
export async function initialize(data: { port: MessagePort, resolvedConfig: SerializedUserConfig }) {
  loaderPort = data.port;
  resolvedConfig = data.resolvedConfig;
  data.port.postMessage({ type: "INITIALIZED_CSS_LOADER" });
}

/**
 * Sets the current page being processed.
 * Used to track which CSS files are associated with which pages.
 *
 * @param page - The URL of the current page, or null if no page is active
 */
export function setCurrentPage(page: string | null) {
  currentPage = page;
}

/**
 * Retrieves all CSS files associated with a specific page.
 *
 * @param page - The URL of the page
 * @returns An array of CSS file paths used by the page
 */
export function getCssFilesForPage(page: string): string[] {
  return Array.from(cssFilesByPage.get(page) || []);
}

/**
 * Processes a CSS file request.
 * Sends a request to the main thread and waits for the processed CSS.
 *
 * @param filePath - The file system path of the CSS file
 * @param config - The Vite config
 * @returns A promise that resolves to the processed CSS content
 */
async function processCssFile(
  filePath: string,
  config: ResolvedConfig,
  inline: boolean
): Promise<{ format: string; source: string; shortCircuit: boolean }> {
  try {
    // Convert file URL to path if needed
    const path = filePath.startsWith("file://")
      ? fileURLToPath(filePath)
      : filePath;

    // Process CSS using Vite's preprocessCSS
    const source = await readFile(path, "utf-8");
    const processed = await preprocessCSS(source, path, {
      ...config,
      env: env
    });

    // If we're processing CSS for a specific page, notify the message handler
    if (loaderPort) {
      loaderPort.postMessage({
        type: "CSS_FILE",
        id: currentPage ? join(path, "?page=" + currentPage) : path,
        path: path,
        content: processed.code,
        modules: processed.modules || {},
        inline,
      });
    }

    // Return a module that can be used by React components
    if (inline) {
      return {
        format: "module",
        source: processed.code,
        shortCircuit: true,
      };
    }
    return {
      format: "module",
      source: `export default ${JSON.stringify(processed.modules || {})};`,
      shortCircuit: true,
    };
  } catch (error) {
    console.error(`[css-loader] Error processing CSS file: ${error}`);
    throw error;
  }
}

/**
 * Vite's load hook implementation for CSS files.
 * Handles CSS file loading requests and returns a placeholder module.
 * The actual CSS content is processed in the main thread.
 *
 * @param url - The URL of the module to load
 * @param context - The load hook context
 * @param defaultLoad - The default load function
 * @returns A promise that resolves to the module content
 */
export async function load(
  url: string,
  context: LoadHookContext & LoaderContext & { resolvedConfig: SerializedUserConfig },
  defaultLoad: any
) {
  const [name, query] = url.split("?");
  if (name.endsWith(".css")) {
    return processCssFile(url, resolvedConfig as ResolvedConfig, query === "inline");
  }

  return defaultLoad(url, context, defaultLoad);
}

/**
 * Vite's resolve hook implementation.
 * Handles module resolution during development.
 *
 * @param specifier - The module specifier to resolve
 * @param context - The resolve hook context
 * @param defaultResolve - The default resolve function
 * @returns A promise that resolves to the resolved module
 */
export function resolve(specifier: string, context: any, defaultResolve: any) {
  return defaultResolve(specifier, context, defaultResolve);
}
