import type { Plugin } from "vite";
import { resolveConfigDefine, resolveEnv } from "../config/resolveEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { getEnvValue, setEnvValue } from "./getEnvKey.js";
import { userProjectRoot } from "../root.js";
import { userConfigEnv } from "./userConfigEnv.js";
import { createConfigEnv } from "./createConfigEnv.js";



/**
 * This plugin can be used to set up the environment defined in the env file
 * and the `define` clause in the vite config to be directly assigned to the process.env,
 * making it available in workers, server components and plugin hooks like config, configureServer, etc.
 *
 * You can also set these variable in the package.json script like `VITE_PUBLIC_ORIGIN=https://example.com npm run build`
 * The default ones like `VITE_DEV` etc, are set to the default values if not defined in the env file or the `define` clause.
 *
 * If they do end up in the build, the define clause replaces process.env.VITE_BASE_URL etc, same like it
 * replaces `import.meta.env.BASE_URL`.
 *
 * While using node.process.env is dangerous as it may expose valuable information to the client, the define clause
 * replaces them in the build so it's safe as long as you stick to simple stuff like const baseUrl = process.env.VITE_BASE_URL
 * would be the same as writing const baseUrl = import.meta.env.BASE_URL. But this plugin doesn't enable that feature nor does
 * it return any config, it just sets the process.env variables at a early momemt and deletes them after the bundle closes unless they were
 * already set in the environment.
 *
 * This plugin will not override process.env variable that were previously set, and will remove any values that it did set after the bundle closes.
 * ```example
 * const config = {
 *    moduleBase: 'src',
 *    // loaded from either .env file or existing process.env, based on the NODE_ENV
 *    publicOrigin: process.env.VITE_PUBLIC_ORIGIN,
 * }
 * ```
 * Example of env file would be like:
 * ```txt
 * VITE_BASE_URL=$BASE_URL
 * VITE_PUBLIC_ORIGIN=$PUBLIC_ORIGIN
 * ```
 * This way, you can set BASE_URL (without the prefix) and the .env file will prefix them to work with your prefix which defaults to `VITE_`
 * @returns
 */
export function envPlugin(): Plugin {
  let cleanupEnv: (() => void) | undefined;
  let vitePrefix = DEFAULT_CONFIG.ENV_PREFIX as string;

  
  return {
    name: "vite-plugin-react-server:env",
    enforce: "pre",
    async config(config, { mode }) {
      
      // Create extended config env to detect --app mode
      const configEnv = createConfigEnv(mode, "build");
      const isAppMode = configEnv.isAppMode;

      if (config.envPrefix) {
        if (typeof config.envPrefix === "string") {
          vitePrefix = config.envPrefix;
        } else if (Array.isArray(config.envPrefix)) {
          vitePrefix = config.envPrefix[0];
        }
      }

      // Only configure Environment API when --app flag is explicitly used
      if (isAppMode && !config.environments) {
        console.log(
          "🚀 Detected --app mode, configuring Environment API for three builds..."
        );


        // Configure builder to orchestrate the builds
        config.builder = {
          buildApp: async (builder) => {
            console.log("🏗️  Building all environments...");
            console.log(
              "🔍 Available environments:",
              Object.keys(builder.environments)
            );

            // Build client and ssr in parallel (they don't depend on each other)
            console.log("🔄 Building client and ssr environments in parallel...");
            await builder.build(builder.environments["client"])

            await builder.build(builder.environments["ssr"])

            // Build server separately (needed for static generation)
            console.log("🖥️  Building server environment...");
            await builder.build(builder.environments["server"]);

            console.log("✅ All environments built successfully!");
          },
        };
      }

      const invalidEnv =
        (mode !== undefined && mode !== getEnvValue("MODE", vitePrefix)) ||
        (config.root !== undefined && config.root !== userProjectRoot);
      if (invalidEnv) {
        userConfigEnv();
      }
      // Clean up any previous env setup
      const cleanupUserConfigEnv = invalidEnv
        ? resolveEnv(
            mode || getEnvValue("MODE", vitePrefix) || "production",
            config.root ?? userProjectRoot,
            vitePrefix
          )
        : userConfigEnv;
      const cleanupUserConfig = resolveConfigDefine(config);

      // Combine cleanup functions
      cleanupEnv = () => {
        cleanupUserConfig();
        cleanupUserConfigEnv();
      };
    },
    closeBundle() {
      // Clean up environment variables when the bundle is closed
      cleanupEnv?.();
    },
    configureServer(server) {
      const envPrefix = Array.isArray(server.config.envPrefix)
        ? server.config.envPrefix[0]
        : server.config.envPrefix ?? DEFAULT_CONFIG.ENV_PREFIX;
      const publicOrigin = getEnvValue("PUBLIC_ORIGIN", envPrefix) ?? "";

      const desiredPort = server.config.server.port;
      let shouldUpdatePublicOrigin = false;
      if (publicOrigin && publicOrigin.includes(`:${desiredPort}`)) {
        shouldUpdatePublicOrigin = true;
      }
      // Listen for when the server actually starts
      if (shouldUpdatePublicOrigin) {
        server.httpServer?.once("listening", () => {
          const address = server.httpServer?.address();
          if (address && typeof address !== "string") {
            const port = address.port;
            if (port !== desiredPort) {
              const envPrefix = Array.isArray(server.config.envPrefix)
                ? server.config.envPrefix[0]
                : server.config.envPrefix ?? DEFAULT_CONFIG.ENV_PREFIX;
              const newOrigin = publicOrigin.replace(
                `:${desiredPort}`,
                `:${port}`
              );
              setEnvValue("PUBLIC_ORIGIN", newOrigin, envPrefix);
              console.warn("PUBLIC_ORIGIN did not match the port: " + port);
            }
          }
        });
      }
    },
  };
}
