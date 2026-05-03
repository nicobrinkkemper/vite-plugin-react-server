import type { Plugin } from "vite";
import { createLogger } from "vite";
import { discoverClientPackages } from "./discover.js";

interface ClientPackagesUserOptions {
  clientPackages?: readonly string[];
  excludeClientPackages?: readonly string[];
  verbose?: boolean;
}

/**
 * Vite plugin that runs auto-detection in its async `config` hook, then
 * mutates `userOptions.clientPackages` so all downstream consumers (the
 * transformer's whitelist filter, `resolveUserConfig`'s noExternal merge)
 * see the merged list when their own hooks read it.
 *
 * Why mutation: the orchestrator passes the same `userOptions` reference
 * to every plugin it creates. As long as nobody copies the object on the
 * way through, mutating `clientPackages` here is visible in every other
 * plugin's hooks. See `createPluginOrchestrator.{server,client}.ts` for
 * the comment guarding against accidental spreads.
 *
 * `enforce: "pre"` puts this plugin's `config` hook ahead of
 * `createEnvironmentPlugin`'s, so by the time `resolveUserConfig` reads
 * `userOptions.clientPackages` for the noExternal merge, the auto-detected
 * packages are already in the list.
 */
export const clientPackagesDiscoveryPlugin = (
  userOptions: ClientPackagesUserOptions & Record<string, unknown>
): Plugin => {
  return {
    name: "vite-plugin-react-server:client-packages-discovery",
    enforce: "pre",
    async config(_config, env) {
      const merged = await discoverClientPackages({
        isBuild: env.command === "build",
        manual: userOptions.clientPackages,
        exclude: userOptions.excludeClientPackages,
        logger: userOptions.verbose ? createLogger("warn") : undefined,
      });
      userOptions.clientPackages = merged;
      return undefined;
    },
  };
};
