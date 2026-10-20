import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ConfigEnv } from "vite";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
 *
 * In a build the hosted id is the file the client build emitted for the
 * module, read from that build's manifest (dist/static/.vite/manifest.json).
 */
describe("createDefaultModuleID — dev-mode build ref/emit parity", () => {
  // Minimal-but-valid options. Pick only what the function consumes, and reuse
  // DEFAULT_CONFIG so the extension map / build dirs match real behavior.
  // preserveModulesRoot stays false (the default) so `src/`-stripping applies.
  const options = {
    moduleBase: DEFAULT_CONFIG.MODULE_BASE,
    moduleBasePath: DEFAULT_CONFIG.MODULE_BASE_PATH,
    moduleBaseURL: DEFAULT_CONFIG.MODULE_BASE_URL,
    projectRoot: "",
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

  // The client build's manifest: what it emitted for each source module.
  const EMITTED: Record<string, string> = {
    "src/components/Widget.client.tsx": "components/Widget.client-AbC123x_.js",
    "src/view/View.generated.tsx": "view/View-Dd4e5F6g.js",
  };
  beforeAll(() => {
    options.projectRoot = mkdtempSync(join(tmpdir(), "vprs-moduleid-"));
    const dir = join(options.projectRoot, "dist/static/.vite");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify(
        Object.fromEntries(
          Object.entries(EMITTED).map(([src, file]) => [src, { file, src, isEntry: true }])
        )
      )
    );
  });
  afterAll(() => rmSync(options.projectRoot, { recursive: true, force: true }));

  const CLIENT_ID = "src/components/Widget.client.tsx";
  // What makes it a client module is the DIRECTIVE, not the name. The `.client.`
  // suffix here is incidental — react-server-loader 19.2.15 stopped reading
  // filenames, because a name is not a signal any other React toolchain honours.
  // Production always has one of these two to hand: the module's source, or the
  // transformer's already-computed answer (`isClientByDirective`), which is why
  // `moduleID` takes both. Passing neither, as this test used to, is not a shape
  // the build ever produces.
  const CLIENT_SOURCE = `"use client";\nexport function Widget() { return null; }\n`;

  const buildDev: ConfigEnv = { command: "build", mode: "development" };
  const buildProd: ConfigEnv = { command: "build", mode: "production" };
  const serveDev: ConfigEnv = { command: "serve", mode: "development" };

  it("development-mode build names the emitted chunk", () => {
    const moduleID = createDefaultModuleID(options, buildDev, "development");
    // moduleBasePath defaults to "/", so the hosted ref is "/components/...".
    expect(moduleID(CLIENT_ID, CLIENT_SOURCE)).toBe("/components/Widget.client-AbC123x_.js");
  });

  it("the transformer's `isClientByDirective` answer alone is enough (no re-parse)", () => {
    const moduleID = createDefaultModuleID(options, buildDev, "development");
    expect(moduleID(CLIENT_ID, undefined, true)).toBe("/components/Widget.client-AbC123x_.js");
  });

  it("a directive-detected module takes the emitted name, whatever its source path", () => {
    const moduleID = createDefaultModuleID(options, buildProd, "production");
    expect(moduleID("src/view/View.generated.tsx", undefined, true)).toBe("/view/View-Dd4e5F6g.js");
  });

  it("a client build that rewrites its manifest is read again", () => {
    const moduleID = createDefaultModuleID(options, buildProd, "production");
    expect(moduleID(CLIENT_ID, CLIENT_SOURCE)).toBe("/components/Widget.client-AbC123x_.js");
    const path = join(options.projectRoot, "dist/static/.vite/manifest.json");
    const rewritten = { [CLIENT_ID]: { file: "components/Widget.client-Zz9.js", src: CLIENT_ID } };
    writeFileSync(path, JSON.stringify(rewritten));
    // A distinct mtime: the lookup re-reads when the file changes.
    const later = new Date(Date.now() + 5000);
    utimesSync(path, later, later);
    expect(moduleID(CLIENT_ID, CLIENT_SOURCE)).toBe("/components/Widget.client-Zz9.js");
    writeFileSync(
      path,
      JSON.stringify(Object.fromEntries(Object.entries(EMITTED).map(([src, file]) => [src, { file, src }])))
    );
  });

  it("development-mode build === production-mode build (core regression assertion)", () => {
    const devId = createDefaultModuleID(options, buildDev, "development")(CLIENT_ID, CLIENT_SOURCE);
    const prodId = createDefaultModuleID(options, buildProd, "production")(CLIENT_ID, CLIENT_SOURCE);
    expect(devId).toBe(prodId);
  });

  it("dev SERVER keeps `src/` and does not hash (dev-server path intact)", () => {
    const moduleID = createDefaultModuleID(options, serveDev, "development");
    const id = moduleID(CLIENT_ID, CLIENT_SOURCE);
    // No build → no hashing, no `src/` stripping, no extension mapping.
    expect(id).toContain("src/components/Widget.client");
    expect(id).not.toMatch(/-[A-Za-z0-9]+\.js$/);
  });

  describe("join contract — bare moduleBasePath still roots client ids", () => {
    // Read at call time: the project root is a temp dir made in beforeAll.
    const bare = () =>
      ({ ...options, moduleBasePath: "" }) satisfies Parameters<typeof createDefaultModuleID>[0];

    it("build: bare moduleBasePath emits rooted client refs (bidoof migration)", () => {
      const id = createDefaultModuleID(bare(), buildProd, "production")(
        CLIENT_ID,
        CLIENT_SOURCE
      );
      expect(id).toBe("/components/Widget.client-AbC123x_.js");
    });

    it("dev: bare moduleBasePath roots client refs without hashing", () => {
      const id = createDefaultModuleID(bare(), serveDev, "development")(
        CLIENT_ID,
        CLIENT_SOURCE
      );
      expect(id).toMatch(/^\/src\/components\/Widget\.client/);
    });

    it("non-client ids stay bare under moduleBasePath ''", () => {
      const id = createDefaultModuleID(bare(), serveDev, "development")(
        "src/routes/page.tsx"
      );
      expect(id.startsWith("/")).toBe(false);
    });
  });
});
