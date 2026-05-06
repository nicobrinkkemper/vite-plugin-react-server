import { crawlFrameworkPkgs } from "vitefu";
import type { Logger } from "vite";

const SELF_PACKAGES = new Set([
  "react",
  "react-dom",
  "react-server-dom-esm",
  "vite-plugin-react-server",
]);

export interface DiscoverOptions {
  /** Project root for the crawl. Defaults to process.cwd() */
  root?: string;
  /** Whether this is a `vite build` (vs `vite serve`). */
  isBuild: boolean;
  /** Manually-specified packages to merge with auto-detected ones. */
  manual?: readonly string[];
  /** Packages to exclude from the merged list (manual or auto). */
  exclude?: readonly string[];
  /** Optional logger for warnings. */
  logger?: Pick<Logger, "warn">;
}

/**
 * Discovers npm packages that ship per-file `"use client"` directives by
 * crawling the project's dependency tree and selecting any package whose
 * `package.json` lists `react` in `peerDependencies`. Mirrors the helper
 * pattern used by `@vitejs/plugin-rsc`.
 *
 * Returns the merged set of `manual ∪ auto-detected` minus `exclude`.
 * On crawl failure (missing lockfile, monorepo edge cases) falls back to
 * `manual` and emits a warning if a logger was provided — the caller's
 * build is never blocked by discovery alone.
 */
export const discoverClientPackages = async (
  options: DiscoverOptions
): Promise<readonly string[]> => {
  const manual = options.manual ?? [];
  const exclude = new Set(options.exclude ?? []);
  try {
    const result = await crawlFrameworkPkgs({
      root: options.root ?? process.cwd(),
      isBuild: options.isBuild,
      isFrameworkPkgByJson(pkgJson) {
        const name = pkgJson?.["name"] as string | undefined;
        if (!name || SELF_PACKAGES.has(name)) return false;
        const peer = pkgJson?.["peerDependencies"] as
          | Record<string, string>
          | undefined;
        return Boolean(peer && "react" in peer);
      },
    });
    const auto = (result?.ssr?.noExternal ?? []) as ReadonlyArray<
      string | RegExp
    >;
    const autoStrings = auto.filter((x): x is string => typeof x === "string");
    return Array.from(new Set([...manual, ...autoStrings])).filter(
      (p) => !exclude.has(p)
    );
  } catch (err) {
    options.logger?.warn(
      `[vite-plugin-react-server:client-packages-discovery] crawl failed: ${
        err instanceof Error ? err.message : String(err)
      } — falling back to manual clientPackages list`
    );
    return manual.filter((p) => !exclude.has(p));
  }
};
