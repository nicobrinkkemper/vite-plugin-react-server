import type { MessagePort } from "node:worker_threads";
import type { LoadHookContext } from "node:module";
import type { LoaderContext } from "../types.js";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

/**
 * Global port for communication between the main thread and the CSS loader.
 * This port is used to send CSS file requests and receive responses.
 */
export let loaderPort: MessagePort | undefined;

let stashedCssFiles = new Map();

/**
 * Initializes the CSS loader with the necessary communication channels.
 * Sets up message handlers for CSS file requests and responses.
 *
 * @param data - Configuration data for the CSS loader
 * @param data.port - The message port for communication
 * @param data.server - The Vite dev server instance
 */
export async function initialize(data: { port: MessagePort }) {
  loaderPort = data.port;
  data.port.postMessage({ type: "INITIALIZED_CSS_LOADER" });
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
  filePath: string
): Promise<{ format: string; source: string; shortCircuit: boolean }> {
  try {
    // Convert file URL to path if needed
    const path = filePath.startsWith("file://")
      ? fileURLToPath(filePath)
      : filePath;
    if (stashedCssFiles.has(filePath)) {
      return {
        format: "module",
        source: stashedCssFiles.get(filePath),
        shortCircuit: true,
      };
    }
    // Process CSS using Vite's preprocessCSS
    const source = await readFile(path, "utf-8");
    stashedCssFiles.set(path, source);
    return {
      format: "module",
      source: source,
      shortCircuit: true,
    };
  } catch (error) {
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
  context: LoadHookContext & LoaderContext,
  defaultLoad: any
) {
  // Handle CSS files
  const [name, query] = url.split("?");
  if (name.endsWith(".css")) {
    return processCssFile(url);
  }

  return defaultLoad(url, context, defaultLoad);
}
