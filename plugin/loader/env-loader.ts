import type { LoadHook } from "node:module";
import type { MessagePort } from "node:worker_threads";
import type { ResolvedConfig } from "vite";
import type { RscWorkerInputMessage } from "../worker/rsc/types.js";

export let loaderPort: MessagePort | undefined;
let resolvedConfig: ResolvedConfig | undefined;

// Initialize hook
export async function initialize(data: {
  id: string;
  port: MessagePort;
  resolvedConfig: ResolvedConfig;
}) {
  loaderPort = data.port;
  resolvedConfig = data.resolvedConfig;
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
    sourceStr = result.source.toString("utf-8");
  } else {
    console.warn(
      `[env-loader] Unexpected source type: ${typeof result.source}`
    );
    return result;
  }

  // Get define object from resolved config
  const define = resolvedConfig?.define || {};

  // Create the env object with Vite's default environment variables
  const envObject = {
    MODE: resolvedConfig?.mode || "development",
    BASE_URL: resolvedConfig?.base || "/",
    PROD: resolvedConfig?.isProduction ? true : false,
    DEV: resolvedConfig?.isProduction ? false : true,
    SSR: true,
    PUBLIC_ORIGIN: "",
    ...Object.fromEntries(
      Object.entries(define)
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
