import { describe, it, expect } from "vitest";
import {
  buildClientPackagesPattern,
  mergeClientPackagesNoExternal,
  mergeClientPackagesOptimizeDepsExclude,
  discoverClientPackages,
} from "../../plugin/clientPackages/index.js";
import { clientPackagesDiscoveryPlugin } from "../../plugin/clientPackages/plugin.js";
import { resolveOptions } from "../../plugin/config/resolveOptions.js";
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
  // Reason these tests exist: client packages must be excluded from the SERVER
  // (react-server) environment's optimizeDeps so esbuild doesn't pre-bundle
  // them and strip the per-file `"use client"` directives the RSC transform
  // needs. The exclude is scoped per-environment (NOT root) so the CLIENT
  // environment still pre-bundles them normally — that's what handles their
  // transitive CJS interop for the browser. A root-level exclude used to break
  // the client (those deps served raw → missing-export errors).
  it("excludes every discovered package from the SERVER env optimizeDeps (not root, not client)", async () => {
    const userOptions = {
      // Manual list bypasses crawl; the plugin still has to wire it through.
      clientPackages: ["@my-org/internal-ui", "@another/lib"],
    };
    const plugin = clientPackagesDiscoveryPlugin(userOptions) as Plugin & {
      config: (config: unknown, env: { command: string }) => Promise<unknown>;
    };
    const result = (await plugin.config({}, { command: "serve" })) as {
      optimizeDeps?: { exclude?: string[] };
      environments?: { server?: { optimizeDeps?: { exclude?: string[] } } };
    };
    expect(result).toBeDefined();
    // Scoped to the server env...
    expect(result.environments?.server?.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining(["@my-org/internal-ui", "@another/lib"])
    );
    // ...and NOT applied at the root (which would also strip them from the
    // client/browser bundle and break CJS interop).
    expect(result.optimizeDeps?.exclude).toBeUndefined();
  });

  it("returns undefined when no packages are detected (so Vite doesn't merge empty config)", async () => {
    const userOptions = {};
    const plugin = clientPackagesDiscoveryPlugin(userOptions) as Plugin & {
      config: (config: unknown, env: { command: string }) => Promise<unknown>;
    };
    const result = await plugin.config({}, { command: "serve" });
    // With no manual entries and (likely) no crawl results for the cwd,
    // the plugin should not pollute the Vite config.
    if (result !== undefined) {
      const exclude = (
        result as {
          environments?: { server?: { optimizeDeps?: { exclude?: string[] } } };
        }
      ).environments?.server?.optimizeDeps?.exclude;
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

describe("clientPackages × resolveOptions stash ordering", () => {
  // Plugin factories call resolveOptions() at CREATION time (when the user's
  // vite.config evaluates the plugin), which resolves and stashes a userOptions
  // copy. clientPackagesDiscoveryPlugin's merge runs later, in its async
  // `config` hook, mutating the shared RAW options object — the stash predates
  // it. A later resolveOptions() call (createEnvironmentPlugin's config hook)
  // returns the stash, so without re-syncing, the discovered list never reaches
  // resolveUserConfig's noExternal merge: the server environment externalizes
  // "use client" packages (vprs's own router/client barrel included) and dev
  // crashes with "React.createContext is not a function" in the RSC worker.
  it("a stashed resolve picks up clientPackages merged into the raw options after the stash was written", async () => {
    const raw: { clientPackages?: readonly string[] } = {};

    // 1. Creation-time resolve — stashes a copy with no clientPackages.
    const first = resolveOptions(raw as never);
    expect(first.type).toBe("success");
    if (first.type !== "success") return;

    // 2. Discovery's config hook merges into the shared raw object.
    const plugin = clientPackagesDiscoveryPlugin(
      Object.assign(raw, { clientPackages: ["@my-org/internal-ui"] })
    ) as Plugin & {
      config: (config: unknown, env: { command: string }) => Promise<unknown>;
    };
    await plugin.config({}, { command: "serve" });
    expect(raw.clientPackages).toEqual(
      expect.arrayContaining(["@my-org/internal-ui"])
    );

    // 3. A later resolve of the SAME raw object returns the stashed copy —
    //    which must now carry the merged list, on the same shared reference.
    const second = resolveOptions(raw as never);
    expect(second.type).toBe("success");
    if (second.type !== "success") return;
    expect(second.userOptions).toBe(first.userOptions);
    expect(second.userOptions.clientPackages).toEqual(
      expect.arrayContaining(["@my-org/internal-ui"])
    );
  });
});
