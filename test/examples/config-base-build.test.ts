import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createBuilder } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { setupTestProject } from "../setup.js";
import { ensureFixture, hashSetupFn } from "./fixture-cache.js";
import { testUserOptions } from "../test-config.js";
import { readFile as readFileFs, readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Regression: Vite's own `base` must reach the build (bead: config.base was
 * dead code in the precedence chain).
 *
 * A consumer configuring `base` the normal Vite way — no VITE_BASE_URL env
 * var, no explicit moduleBaseURL plugin option — used to build against "/":
 * the SSG emitted the bootstrap module URL un-prefixed while every other
 * asset in the same HTML carried the base (they go through Vite), which is
 * exactly why it hid so well. bidoof's GitHub-Pages deploy shipped broken
 * this way, and both known consumers papered over it by exporting
 * VITE_BASE_URL in their npm scripts.
 *
 * Precedence under test: with neither the env var nor the option set, the
 * emitted module script src must carry `config.base`.
 */
const BASE = "/base-via-vite/";

const testDir = resolve(__dirname, "../fixtures/config-base/shared");
const OUT_DIR = "dist-config-base";

describe("vite config.base reaches the emitted bootstrap URL", () => {
  let savedEnvBase: string | undefined;
  let savedEnvOrigin: string | undefined;

  beforeAll(async () => {
    // The whole point is the NO-env-var spelling; other tests in this worker
    // may have exported it.
    savedEnvBase = process.env.VITE_BASE_URL;
    savedEnvOrigin = process.env.VITE_PUBLIC_ORIGIN;
    delete process.env.VITE_BASE_URL;
    delete process.env.VITE_PUBLIC_ORIGIN;

    const setupSource = await readFileFs(resolve(__dirname, "../setup.ts"), "utf-8");
    await ensureFixture(testDir, setupTestProject, hashSetupFn(setupTestProject, [setupSource]));

    // testUserOptions minus everything that would make the base explicit —
    // moduleBaseURL must be ABSENT (an explicit option legitimately outranks
    // config.base; the default must not).
    const {
      moduleBaseURL: _explicitBase,
      onMetrics: _metrics,
      ...pluginOptions
    } = testUserOptions;

    const builder = await createBuilder({
      base: BASE,
      mode: "test",
      root: testDir,
      plugins: vitePluginReactServer({
        ...pluginOptions,
        projectRoot: testDir,
        build: {
          ...testUserOptions.build,
          pages: ["/", "/page2"],
          outDir: OUT_DIR,
        },
      }),
    });
    await builder.buildApp();
  }, 120_000);

  afterAll(() => {
    if (savedEnvBase !== undefined) process.env.VITE_BASE_URL = savedEnvBase;
    if (savedEnvOrigin !== undefined) process.env.VITE_PUBLIC_ORIGIN = savedEnvOrigin;
  });

  it("mirrors config.base into the env channel and prefixes the emitted module src", async () => {
    // The seam under test is the MIRROR: env.node.ts (and through it the
    // workers, the SSG document path and the edge bake) reads
    // process.env.VITE_BASE_URL — "the values vprs's config mirrors into
    // process.env". Before the fix the mirror wrote "/" (config.base was dead
    // code behind the never-nullish option default), so every runtime reader
    // built un-prefixed URLs while Vite's own HTML pipeline prefixed the rest.
    // (Direct SSG-page HTML can't be asserted here: this fixture only emits
    // the root page, which Vite's pipeline handles natively.)
    expect(process.env.VITE_BASE_URL).toBe(BASE);

    const htmlPath = resolve(testDir, OUT_DIR, "static", "index.html");
    const deadline = Date.now() + 15_000;
    let html = "";
    for (;;) {
      try {
        html = await readFile(htmlPath, "utf-8");
        if (/<script[^>]*type="module"/.test(html)) break;
      } catch {
        // not written yet
      }
      if (Date.now() > deadline) throw new Error("timed out waiting for index.html");
      await new Promise((r) => setTimeout(r, 250));
    }
    const moduleSrcs = [
      ...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(moduleSrcs.length).toBeGreaterThan(0);
    for (const src of moduleSrcs) {
      expect(src.startsWith(BASE)).toBe(true);
    }
  });
});
