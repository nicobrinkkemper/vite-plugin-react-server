import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ConfigEnv, UserConfig } from "vite";
import { loadEnv } from "vite";
import { DEFAULT_CONFIG } from "./options.js";

/**
 * Get environment variables for Vite, sets defaults to ensure the server can start with BASE_URL and PUBLIC_URL
 *
 * @param config - Vite configuration object
 * @param { isPreview: boolean } - Object containing a boolean indicating if the environment is for preview
 * @returns An object containing the environment variables
 */
export function getEnv(config: UserConfig, configEnv: ConfigEnv) {
  const isLocal =
    config.mode === "development"

  const envName = isLocal
    ? `${config.mode}.local`
    : config.mode
    ? config.mode
    : "production";
  const environmentName = config.mode ?? envName ?? "production";

  const env = loadEnv(
    environmentName,
    config.envDir ?? config.root ?? process.cwd(),
    config.envPrefix ?? DEFAULT_CONFIG.ENV_PREFIX ?? "VITE_"
  );

  // Get server config
  const serverConfig = config.server || {};
  const previewConfig = config.preview || {};
  const host = configEnv.isPreview
    ? previewConfig.host ?? DEFAULT_CONFIG.PREVIEW_HOST
    : serverConfig.host ?? DEFAULT_CONFIG.DEV_HOST;
  let previewPort = previewConfig.port ?? DEFAULT_CONFIG.PREVIEW_PORT;
  let devPort = serverConfig.port ?? DEFAULT_CONFIG.DEV_PORT;

  let homepage = env["VITE_BASE_URL"]
  if (configEnv.command === "build" && (!homepage || homepage === "")) {
    try {
      const packageJson = JSON.parse(
        readFileSync(resolve(config.root ?? "", "package.json"), "utf-8")
      );
      homepage = packageJson.homepage ?? "";
      if (!homepage || homepage === "") {
        console.warn(
          "[RSC] 🔧 For production builds, please set 'homepage' in package.json, or set VITE_BASE_URL in your environment"
        );
      }
    } catch (e) {
      console.error(e);
    }
  }

  let baseUrl =
    env["VITE_BASE_URL"] && env["VITE_PUBLIC_URL"] !== ""
      ? env["VITE_BASE_URL"]
      : configEnv.isPreview
      ? `http://${host}:${previewPort}`
      : configEnv.command === "serve"
      ? `http://${host}:${devPort}`
      : homepage;

  let publicUrl =
    env["VITE_PUBLIC_URL"] && env["VITE_PUBLIC_URL"] !== ""
      ? env["VITE_PUBLIC_URL"]
      : "";

  // Determine port and host based on mode
  const port = configEnv.isPreview
    ? previewConfig.port || DEFAULT_CONFIG.PREVIEW_PORT // Preview server
    : serverConfig.port || DEFAULT_CONFIG.DEV_PORT; // Dev server

  // Build base URL
  if (configEnv.isPreview && `http://${host}:${port}` !== baseUrl) {
    console.log(
      `VITE_BASE_URL: \"${baseUrl}\" wasn't configured correctly for this server, overriding to: \"http://${host}:${port}\"`
    );
    baseUrl = `http://${host}:${port}`;
  }

  const envPrefix =
    typeof config.envPrefix === "string"
      ? config.envPrefix
      : Array.isArray(config.envPrefix)
      ? config.envPrefix[0]
      : DEFAULT_CONFIG.ENV_PREFIX;

  const nodeProcessEnv = {
    NODE_ENV: configEnv.command === "build" ? "production" : "development",
  };
  const defineProcess = Object.entries(nodeProcessEnv)
    .map(([key, value]) => {
      switch (key) {
        case "NODE_ENV":
          const isDev =
            value === ""
              ? configEnv.command === "build"
                ? false
                : true
              : value === "development";
          return [`import.meta.env.DEV`, JSON.stringify(isDev)];
        default:
          return null;
      }
    })
    .filter(Array.isArray);

  const defineImportMeta = Object.entries(env).map(([key, value]) => [
    `import.meta.env.${key}`,
    key === "VITE_BASE_URL"
      ? value
        ? JSON.stringify(value)
        : JSON.stringify(baseUrl)
      : key === "VITE_PUBLIC_URL"
      ? value
        ? JSON.stringify(value)
        : JSON.stringify(publicUrl)
      : JSON.stringify(value),
  ]);
  const define = Object.fromEntries([...defineProcess, ...defineImportMeta]);

  return {
    baseUrl,
    publicUrl,
    port,
    host,
    envPrefix,
    environmentName,
    env,
    define,
  };
}
