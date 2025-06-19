import { type MessagePort } from "node:worker_threads";
import type {
  LoadHook,
  ResolveHook,
  ModuleFormat,
} from "node:module";
import type {
  ResolvedUserConfig,
  ResolvedUserOptions,
  SerializedResolvedConfig,
  SerializedUserOptions,
} from "../types.js";
import { fileURLToPath } from "node:url";
import { preprocessCSS, type ResolvedConfig } from "vite";
import { readFile } from "node:fs/promises";
import { env } from "../utils/env.js";
import type { InitializedCssLoaderMessage } from "../worker/rsc/types.js";
import { hydrateUserOptions } from "../helpers/index.js";

/**
 * Global port for communication between the main thread and the CSS loader.
 * This port is used to send CSS file requests and receive responses.
 */
export let loaderPort: MessagePort | undefined;

let resolvedConfig: ResolvedUserConfig | undefined;
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
  config: ResolvedUserConfig,
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
      moduleID = userOptions.moduleID(value || path);
    }
    const processed = await preprocessCSS(source, path, {
      ...(config as unknown as ResolvedConfig),
      env: env,
    });

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
export const load: LoadHook = async (url, context, defaultLoad) => {
  const [name, query] = url.split("?");
  if (name.endsWith(".css")) {
    return processCssFile(url, resolvedConfig!, query === "inline");
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
