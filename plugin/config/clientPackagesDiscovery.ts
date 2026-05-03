import type { Plugin } from "vite";
import { crawlFrameworkPkgs } from "vitefu";
import { resolveOptions } from "./resolveOptions.js";

/**
 * Auto-discovers npm packages that ship per-file `"use client"` directives
 * (Chakra, MUI, Mantine, react-aria, framer-motion, etc.) by crawling the
 * project's dependency tree and selecting any package whose `package.json`
 * lists `react` in `peerDependencies`. Mirrors the pattern used by
 * `@vitejs/plugin-rsc`, so consumers don't have to enumerate clientPackages
 * manually for libraries that already opted into the convention.
 *
 * Mutates `userOptions.clientPackages` in-place so downstream plugins (the
 * transformer's `configResolved`, `resolveUserConfig`'s noExternal merge)
 * see the combined manual + auto-detected list.
 */
export const clientPackagesDiscoveryPlugin = (
  userOptions: { clientPackages?: readonly string[] } & Record<string, unknown>
): Plugin => {
  return {
    name: "vite-plugin-react-server:client-packages-discovery",
    enforce: "pre",
    async config(_config, env) {
      const manual = (userOptions.clientPackages ?? []) as readonly string[];
      try {
        const result = await crawlFrameworkPkgs({
          root: process.cwd(),
          isBuild: env.command === "build",
          isFrameworkPkgByJson(pkgJson) {
            const name = pkgJson?.["name"] as string | undefined;
            // Skip react itself and well-known internals.
            if (
              name === "react" ||
              name === "react-dom" ||
              name === "react-server-dom-esm" ||
              name === "vite-plugin-react-server"
            ) {
              return false;
            }
            const peer = pkgJson?.["peerDependencies"] as
              | Record<string, string>
              | undefined;
            return Boolean(peer && "react" in peer);
          },
        });
        // crawlFrameworkPkgs returns SSR-oriented hints; the noExternal
        // list is the relevant set of "react-using" deps.
        const auto = (result?.ssr?.noExternal ?? []) as ReadonlyArray<
          string | RegExp
        >;
        const autoStrings = auto.filter(
          (x): x is string => typeof x === "string"
        );
        const merged = Array.from(new Set([...manual, ...autoStrings]));
        userOptions.clientPackages = merged;
      } catch {
        // If the crawl fails (lockfile missing, monorepo edge), fall back
        // to whatever the user supplied manually — never block the build.
        userOptions.clientPackages = manual;
      }
      // resolveOptions caches the resolved userOptions per envId on first
      // call (which happens at plugin construction, before this hook runs).
      // Force-refresh that cache so consumers reading the stashed copy
      // (resolveUserConfig, the transformer's runtimeResolvedUserOptions)
      // see the merged clientPackages list.
      resolveOptions(userOptions as never, true);
      return undefined;
    },
  };
};
