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
 *
 * Returns a partial Vite config that adds the merged list to the **root**
 * `optimizeDeps.exclude`. The per-environment SSR-side exclude in
 * `resolveUserConfig` covers `srrConfig.optimizeDeps.exclude` only — that
 * never reaches Vite's dev pre-bundler, which reads from the root config.
 * Without this, esbuild concatenates every `"use client"` directive out of
 * each clientPackage submodule into `node_modules/.vite/deps/<pkg>.js`, the
 * server-env module runner consults the same cache when resolving the
 * package, and vprs's transformer never sees the directives to convert
 * them into `registerClientReference` — a server component importing
 * `@chakra-ui/react` (or any other auto-detected client package) then
 * crashes the dev server with `react does not provide an export named
 * createContext` under the `react-server` condition.
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
      if (merged.length === 0) return undefined;
      // Exclude client packages from optimizeDeps ONLY in the server
      // (react-server) environment: there, pre-bundling would concatenate the
      // package into one chunk and strip its per-file `"use client"` directives
      // before vprs's transform can convert them to client references.
      //
      // We deliberately do NOT exclude them from the client (browser)
      // environment — there, letting esbuild pre-bundle them normally is what we
      // want: it resolves their transitive CJS deps (hoist-non-react-statics,
      // the React runtime, …) and synthesizes the named/default exports the
      // browser bundle needs. A blanket root-level exclude is what used to break
      // the client (those deps served raw → "does not provide an export named…"
      // errors); scoping the exclude per-environment fixes both sides without
      // hand-collecting transitive deps.
      const exclude = [...merged];
      return {
        environments: {
          server: { optimizeDeps: { exclude } },
        },
      };
    },
  };
};
