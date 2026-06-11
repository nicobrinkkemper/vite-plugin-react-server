import { describe, it, expect } from "vitest";
import type { ConfigEnv } from "vite";
// Import the SOURCE (not the built package entry) so this test guards the fix
// in `plugin/config/createModuleID.ts` directly — reverting the two lines there
// must make the regression assertion below fail without a rebuild.
import { createDefaultModuleID } from "../../plugin/config/createModuleID.js";
import { DEFAULT_CONFIG } from "../../plugin/config/defaults.js";

/**
 * Regression guard for dev-mode static builds.
 *
 * `createDefaultModuleID` computes the client-component reference path baked
 * into the RSC stream. The chunk-EMISSION side (Rollup entryFile/chunkFile
 * hashing + preserveModulesRoot) hashes and strips `src/` on EVERY build,
 * regardless of `mode`. The reference side must match it.
 *
 * The bug: hashing + `src/`-stripping used to be suppressed when
 * `mode === "development"`, so `vite build --mode development` baked UNHASHED,
 * `src/`-kept refs (`src/components/Widget.client.js`) while Rollup emitted
 * HASHED, src-stripped chunks (`components/Widget.client-<hash>.js`) — the
 * static prerender then failed with ERR_MODULE_NOT_FOUND.
 *
 * The fix keys both off `isBuild` (`command === "build"`) instead of `mode`,
 * so a development-mode build produces the SAME id as a production-mode build.
 * The dev SERVER (`command === "serve"`) stays unhashed + `src/`-kept.
 */
describe("createDefaultModuleID — dev-mode build ref/emit parity", () => {
  // Minimal-but-valid options. Pick only what the function consumes, and reuse
  // DEFAULT_CONFIG so the extension map / build dirs match real behavior.
  // preserveModulesRoot stays false (the default) so `src/`-stripping applies.
  const options = {
    moduleBase: DEFAULT_CONFIG.MODULE_BASE,
    moduleBasePath: DEFAULT_CONFIG.MODULE_BASE_PATH,
    moduleBaseURL: DEFAULT_CONFIG.MODULE_BASE_URL,
    projectRoot: "/nonexistent-project-root",
    autoDiscover: {
      virtualPattern: DEFAULT_CONFIG.AUTO_DISCOVER.virtualPattern,
    },
    dev: DEFAULT_CONFIG.DEV,
    build: {
      outDir: DEFAULT_CONFIG.BUILD.outDir,
      static: DEFAULT_CONFIG.BUILD.static,
      client: DEFAULT_CONFIG.BUILD.client,
      server: DEFAULT_CONFIG.BUILD.server,
      assetsDir: DEFAULT_CONFIG.BUILD.assetsDir,
      extensionMap: DEFAULT_CONFIG.BUILD.extensionMap,
      hash: DEFAULT_CONFIG.BUILD.hash,
      preserveModulesRoot: false,
    },
  } satisfies Parameters<typeof createDefaultModuleID>[0];

  const CLIENT_ID = "src/components/Widget.client.tsx";

  const buildDev: ConfigEnv = { command: "build", mode: "development" };
  const buildProd: ConfigEnv = { command: "build", mode: "production" };
  const serveDev: ConfigEnv = { command: "serve", mode: "development" };

  it("development-mode build hashes + strips `src/` (matches the emitted chunk)", () => {
    const moduleID = createDefaultModuleID(options, buildDev, "development");
    const id = moduleID(CLIENT_ID);
    // moduleBasePath defaults to "/", so the hosted ref is "/components/...".
    expect(id).toMatch(/^\/components\/Widget\.client-[A-Za-z0-9]+\.js$/);
    expect(id).not.toContain("src/");
  });

  it("development-mode build === production-mode build (core regression assertion)", () => {
    const devId = createDefaultModuleID(options, buildDev, "development")(CLIENT_ID);
    const prodId = createDefaultModuleID(options, buildProd, "production")(CLIENT_ID);
    expect(devId).toBe(prodId);
  });

  it("dev SERVER keeps `src/` and does not hash (dev-server path intact)", () => {
    const moduleID = createDefaultModuleID(options, serveDev, "development");
    const id = moduleID(CLIENT_ID);
    // No build → no hashing, no `src/` stripping, no extension mapping.
    expect(id).toContain("src/components/Widget.client");
    expect(id).not.toMatch(/-[A-Za-z0-9]+\.js$/);
  });

  /**
   * Trailing-segment normalization for DIRECTIVE-detected client modules
   * (Step 1b) must match the build's entryFile normalizer
   * (stripTrailingDotSegment) for every naming convention — the two used to
   * be independent copies that agreed only by inspection (the compound-
   * filename bug fixed in PR #55 was exactly such a drift).
   */
  describe("directive-detected client moduleID — trailing-segment parity", () => {
    const buildId = (id: string) =>
      createDefaultModuleID(options, buildProd, "production")(
        id,
        undefined,
        /* isClientByDirective */ true
      );

    it("compound filename collapses one trailing segment (bd-80r regression)", () => {
      expect(buildId("src/view/View.generated.tsx")).toMatch(
        /^\/view\/View-[A-Za-z0-9]+\.js$/
      );
    });

    it("multi-dot filename collapses exactly ONE trailing segment", () => {
      expect(buildId("src/components/A.B.C.tsx")).toMatch(
        /^\/components\/A\.B-[A-Za-z0-9]+\.js$/
      );
    });

    it("hyphenated-with-dots filename collapses the dot segment only", () => {
      expect(buildId("src/components/a-b.c.tsx")).toMatch(
        /^\/components\/a-b-[A-Za-z0-9]+\.js$/
      );
    });

    it("`.client.` suffix is preserved, not collapsed", () => {
      expect(buildId("src/components/Widget.client.tsx")).toMatch(
        /^\/components\/Widget\.client-[A-Za-z0-9]+\.js$/
      );
    });

    it("`.server.` suffix is preserved, not collapsed", () => {
      expect(buildId("src/components/Widget.server.tsx")).toMatch(
        /^\/components\/Widget\.server-[A-Za-z0-9]+\.js$/
      );
    });

    it("a dot in a DIRECTORY name is not a trailing segment", () => {
      expect(buildId("src/view.v2/Widget.tsx")).toMatch(
        /^\/view\.v2\/Widget-[A-Za-z0-9]+\.js$/
      );
    });

    it("single-segment filename has nothing to strip", () => {
      expect(buildId("src/components/Widget.tsx")).toMatch(
        /^\/components\/Widget-[A-Za-z0-9]+\.js$/
      );
    });
  });
});
