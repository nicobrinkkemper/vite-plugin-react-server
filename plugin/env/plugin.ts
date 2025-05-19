import type { Plugin } from "vite";
import { resolveConfigDefine, resolveEnv } from "../config/resolveEnv.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { userProjectRoot } from "../root.js";
const isBuild = process.argv[process.argv.length - 1] === "build";
const isPreview = process.argv.findIndex((arg) => arg === "preview") !== -1;


// Set up environment variables from .env files as early as possible
// This is to ensure that the env variables are available even in the config file,
// and you can use process.env to configure the plugin.
const cleanupInitialUserConfigEnv = resolveEnv(
  process.env["NODE_ENV"] || (isBuild || isPreview ? "production" : "development"),
  userProjectRoot,
  DEFAULT_CONFIG.ENV_PREFIX
);

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
 * it return any config, it just sets the process.env variables at a early momemt and deletes them after the build unless they were
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
 * @returns
 */
export function envPlugin(): Plugin {
  let cleanupEnv: (() => void) | undefined;
  return {
    name: "vite-plugin-react-server:env",
    enforce: "pre",
    config(config, { mode }) {
      const invalidEnv =
        (mode !== undefined && mode !== process.env.VITE_MODE) ||
        (config.root !== undefined && config.root !== userProjectRoot);
      if (invalidEnv) {
        cleanupInitialUserConfigEnv();
      }
      // Clean up any previous env setup
      const cleanupUserConfigEnv = invalidEnv
        ? resolveEnv(
            mode || process.env.VITE_MODE,
            config.root ?? userProjectRoot,
            config.envPrefix ?? DEFAULT_CONFIG.ENV_PREFIX
          )
        : cleanupInitialUserConfigEnv;
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
  };
}
