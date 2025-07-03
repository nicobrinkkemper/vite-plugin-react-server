import { type MessagePort } from "node:worker_threads";
import type {
  LoadHook,
  ResolveHook,
  ModuleFormat,
} from "node:module";
import type {
  ResolvedUserOptions,
  SerializedResolvedConfig,
  SerializedUserOptions,
} from "../types.js";
import { fileURLToPath } from "node:url";
import { preprocessCSS, resolveConfig } from "vite";
import { readFile } from "node:fs/promises";
import { env } from "../utils/env.js";
import type { InitializedCssLoaderMessage } from "../worker/rsc/types.js";
import { hydrateUserOptions } from "../helpers/hydrateUserOptions.js";
import { toError } from "../error/toError.js";

/**
 * Global port for communication between the main thread and the CSS loader.
 * This port is used to send CSS file requests and receive responses.
 */
export let loaderPort: MessagePort | undefined;

let resolvedConfig: SerializedResolvedConfig | null;
let userOptions: ResolvedUserOptions | undefined;

/**
 * Initializes the CSS loader with the necessary communication channels.
 * Sets up message handlers for CSS file requests and responses.
 *
 * @param data - Configuration data for the CSS loader
 * @param data.port - The message port for communication
 */
export async function initialize(data: {
  id: string;
  port: MessagePort;
  resolvedConfig: SerializedResolvedConfig;
  userOptions: SerializedUserOptions;
}) {
  loaderPort = data.port;
  resolvedConfig = data.resolvedConfig;
  const resolvedUserOptions = 
    hydrateUserOptions(data.userOptions)
  if (resolvedUserOptions.type === "error") {
    throw new Error(resolvedUserOptions.error.message);
  }
  
  // Use the hydrated user options directly (includes recreated functions)
  userOptions = resolvedUserOptions.userOptions;
  
  data.port.postMessage({
    type: "INITIALIZED_CSS_LOADER",
    id: data.id,
  } satisfies InitializedCssLoaderMessage);
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
  inline: boolean
): Promise<{ format: ModuleFormat; source: string; shortCircuit: boolean }> {
  try {
    // Convert file URL to path if needed
    const path = filePath.startsWith("file://")
      ? fileURLToPath(filePath)
      : filePath;

    // Process CSS using Vite's preprocessCSS
    const source = await readFile(path, "utf-8");
    let moduleID = path;
    if (userOptions?.normalizer) {
      const [, value] = userOptions.normalizer(path);
      moduleID = userOptions.moduleID?.(value || path) || path;
    }
    // Try to process CSS with preprocessCSS, fall back to raw CSS if config is incomplete  
    let processed: { code: string; modules?: any };
    try {
      // Create a minimal config with environments that preprocessCSS expects
      const viteConfig = await resolveConfig({
        ...resolvedConfig,
        env: env,
        // do-not re-resolve the config file as it would import the plugin again which we do not need.
        configFile: false,
      }, "serve");

      processed = await preprocessCSS(source, path, viteConfig);
    } catch (error) {
      // If preprocessCSS fails, fall back to raw CSS
      console.warn(`[css-loader] preprocessCSS failed, using raw CSS: ${error}`);
      processed = { code: source, modules: {} };
    }

    // If we're processing CSS for a specific page, notify the message handler
    if (loaderPort) {
      loaderPort.postMessage({
        type: "CSS_FILE",
        id: moduleID,
        content: processed.code,
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
    const err = toError(error);
    console.error(`[css-loader] Error processing CSS file: ${err.message}`);
    throw err;
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
export const load: LoadHook = async (url, context, defaultLoad) => {
  const [name, query] = url.split("?");
  if (name.endsWith(".css")) {
    return processCssFile(url, query === "inline");
  }

  return defaultLoad(url, context);
};

/**
 * Vite's resolve hook implementation.
 * Handles module resolution during development.
 *
 * @param specifier - The module specifier to resolve
 * @param context - The resolve hook context
 * @param defaultResolve - The default resolve function
 * @returns A promise that resolves to the resolved module
 */
export const resolve: ResolveHook = (specifier, context, defaultResolve) => {
  return defaultResolve(specifier, context);
};
