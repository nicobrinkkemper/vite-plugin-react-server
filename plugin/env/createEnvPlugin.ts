import type { Plugin, UserConfig } from "vite";
import { resolveEnv } from "../config/resolveEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { getEnvValue, setEnvValue } from "./getEnvKey.js";
import { userProjectRoot } from "../root.js";

export const createEnvPlugin =
  (_maintThreadCondition: string) =>
  (_options?: any): Plugin => {
    let cleanupEnv: (() => void) | undefined;
    const vitePrefix = DEFAULT_CONFIG.ENV_PREFIX as string;

    // Set up environment variables immediately when plugin is created
    const mode = getEnvValue("MODE", vitePrefix) || "development";
    cleanupEnv = resolveEnv(mode, userProjectRoot, vitePrefix);

    return {
      name: "vite:plugin-react-server/env",
      enforce: "post",

      async config(config: UserConfig, configEnv) {
        // Debug logging removed for performance

        // Set environment variables for the build
        if (configEnv.isSsrBuild) {
          process.env["VITE_SSR"] = "true";
        }

        // The environment plugin should not directly configure outputs
        // Each environment should run through proper auto-discovery and resolveUserConfig
        // TODO: Properly integrate with Environment API to create separate build environments

        return config;
      },

      closeBundle() {
        // Clean up environment variables when the bundle is closed
        if (cleanupEnv) {
          cleanupEnv();
        }
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
  };
