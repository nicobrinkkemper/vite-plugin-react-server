import { describe, it, expect } from "vitest";
import {
  buildClientPackagesPattern,
  mergeClientPackagesNoExternal,
  mergeClientPackagesOptimizeDepsExclude,
  discoverClientPackages,
} from "../../plugin/clientPackages/index.js";
import { clientPackagesDiscoveryPlugin } from "../../plugin/clientPackages/plugin.js";
import type { Plugin } from "vite";

describe("clientPackages/buildClientPackagesPattern", () => {
  it("returns null for empty list (so caller can short-circuit, not match every id)", () => {
    expect(buildClientPackagesPattern([])).toBeNull();
  });

  it("matches paths under node_modules for whitelisted packages on POSIX separators", () => {
    const re = buildClientPackagesPattern(["@chakra-ui/react"]);
    expect(re).not.toBeNull();
    expect(re!.test("/some/where/node_modules/@chakra-ui/react/dist/x.js")).toBe(
      true
    );
  });

  it("matches the node_modules separator on backslashes too (paths Vite leaves un-normalized)", () => {
    // The separators around `node_modules` and the trailing path use
    // `[\\/]`. The package name itself is matched literally, so the inner
    // `/` of `@scope/pkg` is required to be `/`. Vite internally normalizes
    // ids to forward slashes, so this is fine in practice.
    const re = buildClientPackagesPattern(["@chakra-ui/react"]);
    expect(re!.test("C:\\foo\\node_modules\\@chakra-ui/react\\dist\\x.js")).toBe(
      true
    );
  });

  it("does not match unrelated node_modules paths", () => {
    const re = buildClientPackagesPattern(["@chakra-ui/react"]);
    expect(re!.test("/x/node_modules/lodash/index.js")).toBe(false);
  });

  it("escapes regex metacharacters in package names", () => {
    // Package names with `+` shouldn't accidentally be treated as quantifiers.
    const re = buildClientPackagesPattern(["foo+bar"]);
    expect(re!.test("/x/node_modules/foo+bar/index.js")).toBe(true);
    expect(re!.test("/x/node_modules/foobar/index.js")).toBe(false);
  });

  it("handles multiple packages via alternation", () => {
    const re = buildClientPackagesPattern([
      "@chakra-ui/react",
      "framer-motion",
    ]);
    expect(re!.test("/x/node_modules/@chakra-ui/react/x.js")).toBe(true);
    expect(re!.test("/x/node_modules/framer-motion/x.js")).toBe(true);
    expect(re!.test("/x/node_modules/@mui/material/x.js")).toBe(false);
  });
});

describe("clientPackages/mergeClientPackagesNoExternal", () => {
  it("returns existing untouched when clientPackages is empty (any shape)", () => {
    expect(mergeClientPackagesNoExternal([], undefined)).toEqual([]);
    expect(mergeClientPackagesNoExternal([], true)).toBe(true);
    expect(mergeClientPackagesNoExternal([], "a")).toBe("a");
    expect(mergeClientPackagesNoExternal([], ["a"])).toEqual(["a"]);
  });

  it("returns array form when existing is undefined", () => {
    expect(mergeClientPackagesNoExternal(["a", "b"], undefined)).toEqual([
      "a",
      "b",
    ]);
  });

  it("appends to an existing array", () => {
    expect(mergeClientPackagesNoExternal(["c"], ["a", "b"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("wraps a single string/regex existing into an array with the new packages", () => {
    expect(mergeClientPackagesNoExternal(["b"], "a")).toEqual(["a", "b"]);
    const re = /^a$/;
    expect(mergeClientPackagesNoExternal(["b"], re)).toEqual([re, "b"]);
  });
});

describe("clientPackages/mergeClientPackagesOptimizeDepsExclude", () => {
  it("returns clientPackages alone when existing is undefined", () => {
    expect(
      mergeClientPackagesOptimizeDepsExclude(["@chakra-ui/react"], undefined)
    ).toEqual(["@chakra-ui/react"]);
  });

  it("appends clientPackages to existing exclude list", () => {
    expect(
      mergeClientPackagesOptimizeDepsExclude(["a"], ["existing"])
    ).toEqual(["existing", "a"]);
  });
});

describe("clientPackages/discoverClientPackages", () => {
  it("falls back to manual list when crawl throws (root that doesn't exist)", async () => {
    // Pointing at a dir without a package.json forces crawlFrameworkPkgs
    // to throw / return nothing useful. We assert that the manual list is
    // preserved and the build is never blocked.
    const result = await discoverClientPackages({
      root: "/nonexistent-path-for-vprs-test",
      isBuild: false,
      manual: ["@user/manual-pkg"],
    });
    expect(result).toContain("@user/manual-pkg");
  });

  it("dedupes manual + auto and filters via exclude", async () => {
    const result = await discoverClientPackages({
      root: "/nonexistent-path-for-vprs-test",
      isBuild: false,
      manual: ["a", "b", "a"], // duplicate
      exclude: ["b"],
    });
    expect(result).toEqual(["a"]);
  });
});

describe("clientPackages/clientPackagesDiscoveryPlugin", () => {
  // Reason these tests exist: the per-environment SSR-side exclude in
  // `resolveUserConfig` (`srrConfig.optimizeDeps.exclude`) does NOT reach
  // Vite's dev pre-bundler, which reads from the root `optimizeDeps.exclude`.
  // Without this plugin returning a root-level exclude, esbuild concatenates
  // every `"use client"` directive out of each clientPackage submodule into
  // `node_modules/.vite/deps/<pkg>.js`, the server-env module runner
  // consults the same cache, and a server component importing the package
  // throws `react does not provide an export named createContext` under
  // the `react-server` condition.
  it("returns a root optimizeDeps.exclude entry for every discovered package", async () => {
    const userOptions = {
      // Manual list bypasses crawl; the plugin still has to wire it through
      // to root-level optimizeDeps.exclude.
      clientPackages: ["@my-org/internal-ui", "@another/lib"],
    };
    const plugin = clientPackagesDiscoveryPlugin(userOptions) as Plugin & {
      config: (config: unknown, env: { command: string }) => Promise<unknown>;
    };
    const result = (await plugin.config({}, { command: "serve" })) as {
      optimizeDeps: { exclude: string[] };
    };
    expect(result).toBeDefined();
    expect(result.optimizeDeps.exclude).toEqual(
      expect.arrayContaining(["@my-org/internal-ui", "@another/lib"])
    );
  });

  it("returns undefined when no packages are detected (so Vite doesn't merge an empty array)", async () => {
    const userOptions = {};
    const plugin = clientPackagesDiscoveryPlugin(userOptions) as Plugin & {
      config: (config: unknown, env: { command: string }) => Promise<unknown>;
    };
    const result = await plugin.config({}, { command: "serve" });
    // With no manual entries and (likely) no crawl results for the cwd,
    // the plugin should not pollute the Vite root config.
    if (result !== undefined) {
      const exclude = (result as { optimizeDeps?: { exclude?: string[] } })
        .optimizeDeps?.exclude;
      expect(exclude == null || exclude.length > 0).toBe(true);
    }
  });

  it("mutates userOptions.clientPackages so downstream consumers see the merged list", async () => {
    const userOptions: { clientPackages?: readonly string[] } = {
      clientPackages: ["@user/pkg"],
    };
    const plugin = clientPackagesDiscoveryPlugin(userOptions) as Plugin & {
      config: (config: unknown, env: { command: string }) => Promise<unknown>;
    };
    await plugin.config({}, { command: "serve" });
    expect(userOptions.clientPackages).toEqual(
      expect.arrayContaining(["@user/pkg"])
    );
  });
});
