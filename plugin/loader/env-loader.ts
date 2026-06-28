import type { LoadHook } from "node:module";
import type { MessagePort } from "node:worker_threads";
import type {
  ResolvedUserOptions,
  SerializedResolvedConfig,
  SerializedUserOptions,
} from "../types.js";
import type { RscWorkerInputMessage } from "../worker/rsc/types.js";
import { getEnvValue } from "../env/getEnvKey.js";
import { hydrateUserOptions } from "../helpers/hydrateUserOptions.js";
import { sendMessage } from "../worker/sendMessage.js";
import type { ErrorMessage } from "../worker/types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";

export let loaderPort: MessagePort | undefined;
let resolvedConfig: SerializedResolvedConfig | undefined;
let userOptions: ResolvedUserOptions | undefined;
let envPrefix: string = DEFAULT_CONFIG.ENV_PREFIX;

// Initialize hook
export async function initialize(data: {
  id: string;
  port: MessagePort;
  resolvedConfig: SerializedResolvedConfig;
  userOptions: SerializedUserOptions;
}) {
  loaderPort = data.port;
  resolvedConfig = data.resolvedConfig;
  
  // Extract envPrefix from resolved config
  envPrefix = Array.isArray(resolvedConfig?.envPrefix)
    ? resolvedConfig?.envPrefix[0]
    : resolvedConfig?.envPrefix || DEFAULT_CONFIG.ENV_PREFIX;

  // Hydrate user options
  const resolvedUserOptions = hydrateUserOptions(data.userOptions);
  if (resolvedUserOptions.type === "error") {
    if (loaderPort) {
      sendMessage(
        {
          type: "ERROR",
          id: "env-loader",
          error: resolvedUserOptions.error,
        } satisfies ErrorMessage,
        loaderPort
      );
    }
    throw resolvedUserOptions.error;
  }

  userOptions = resolvedUserOptions.userOptions;

  data.port.postMessage({
    type: "INITIALIZED_ENV_LOADER",
    id: data.id,
    env: {},
  } satisfies RscWorkerInputMessage);
}

// Load hook
export const load: LoadHook = async (
  url,
  context,
  nextLoad
) => {
  const result = await nextLoad(url, context);

  // Skip if not a module
  if (result.format !== "module") {
    return result;
  }

  // Skip node internals and hidden files
  if (url.startsWith("node:") || url.includes("/.")) {
    return result;
  }

  // Convert source to string if it's a Buffer or Uint8Array
  let sourceStr: string;
  if (typeof result.source === "string") {
    sourceStr = result.source;
  } else if (
    result.source instanceof Uint8Array ||
    Buffer.isBuffer(result.source)
  ) {
    // Buffer.from handles both Uint8Array and Buffer; narrowing collapses to
    // Uint8Array, whose toString() takes no encoding arg.
    sourceStr = Buffer.from(result.source).toString("utf-8");
  } else {
    console.warn(
      `[env-loader] Unexpected source type: ${typeof result.source}`
    );
    return result;
  }

  // Create the env object using our dynamic prefix system
  const envObject = {
    MODE: getEnvValue("MODE", envPrefix) || resolvedConfig?.mode || "development",
    BASE_URL: getEnvValue("BASE_URL", envPrefix) || resolvedConfig?.base || "/",
    PROD: getEnvValue("PROD", envPrefix) === "true" || 
          getEnvValue("PROD", envPrefix) === "1" || 
          resolvedConfig?.isProduction || false,
    DEV: getEnvValue("DEV", envPrefix) === "true" || 
         getEnvValue("DEV", envPrefix) === "1" || 
         !(resolvedConfig?.isProduction) || true,
    SSR: getEnvValue("SSR", envPrefix) === "true" || 
         getEnvValue("SSR", envPrefix) === "1" || 
         true,
    PUBLIC_ORIGIN: getEnvValue("PUBLIC_ORIGIN", envPrefix) || 
                   userOptions?.publicOrigin || "",
    
    // Include additional environment variables from Vite's define
    ...Object.fromEntries(
      Object.entries(resolvedConfig?.define || {})
        .filter(([key]) => key.startsWith("import.meta.env."))
        .map(([key, value]) => [
          key.replace("import.meta.env.", ""),
          JSON.parse(value as string),
        ])
    ),
  };

  // Replace environment variable references in the source
  let newSource = sourceStr;

  // Check if we need to handle import.meta.env
  if (newSource.includes("import.meta.env")) {
    newSource = `Object.defineProperty(import.meta, "env", { value: ${JSON.stringify(
      envObject
    )}, writable: false, configurable: false });\n${newSource}`;
  }

  return {
    ...result,
    source: newSource,
  };
}
