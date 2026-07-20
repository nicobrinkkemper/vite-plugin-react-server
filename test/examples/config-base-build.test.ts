import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createBuilder } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { setupTestProject } from "../setup.js";
import { ensureFixture, hashSetupFn } from "./fixture-cache.js";
import { testUserOptions } from "../test-config.js";
import { readFile as readFileFs, readFile, rm } from "node:fs/promises";
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

    // The fixture project is cached but the build output must not be: a stale
    // dist from a previous (passing) run would satisfy the SSG-page assertion
    // even when the code under test regressed.
    await rm(resolve(testDir, OUT_DIR), { recursive: true, force: true });

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

  const waitForModuleHtml = async (htmlPath: string) => {
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        const html = await readFile(htmlPath, "utf-8");
        if (/<script[^>]*type="module"/.test(html)) return html;
      } catch {
        // not written yet
      }
      if (Date.now() > deadline)
        throw new Error(`timed out waiting for ${htmlPath}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const expectPrefixedModuleSrcs = (html: string) => {
    const moduleSrcs = [
      ...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(moduleSrcs.length).toBeGreaterThan(0);
    for (const src of moduleSrcs) {
      expect(src.startsWith(BASE)).toBe(true);
    }
  };

  it("mirrors config.base into the env channel", () => {
    // The mirror seam: env.node.ts (and through it every #env reader) reads
    // process.env.VITE_BASE_URL — "the values vprs's config mirrors into
    // process.env". Before the precedence fix the mirror wrote "/"
    // (config.base was dead code behind the never-nullish option default).
    expect(process.env.VITE_BASE_URL).toBe(BASE);
  });

  it("prefixes the module src on the root page", async () => {
    // Weak on its own: Vite's own pipeline emits/prefixes the root
    // index.html, so this passes even when the SSG path is broken. Kept as a
    // guard for the Vite-piped half; the SSG half is the page2 test below.
    const html = await waitForModuleHtml(
      resolve(testDir, OUT_DIR, "static", "index.html")
    );
    expectPrefixedModuleSrcs(html);
  });

  it("prefixes the module src on a worker-emitted SSG page", async () => {
    // The emission seam. page2's HTML is written by the html worker, never by
    // Vite's pipeline, so this asserts the full chain: the winner reaching the
    // worker's userOptions snapshot AND the live (not import-frozen) #env read
    // behind baseURL(). It also pins the fileWriter path fix: before it, this
    // file was written relative to the process CWD (the repo root under
    // vitest), not the project root, and no assertion could ever see it.
    const html = await waitForModuleHtml(
      resolve(testDir, OUT_DIR, "static", "page2", "index.html")
    );
    expectPrefixedModuleSrcs(html);
  });

  it("bakes the prefixed base into the edge bundle", async () => {
    // The edge bake reads the static plugin's own userOptions copy at
    // generateBundle time — the copy that goes stale when only another
    // instance's config hook computed the winner.
    const render = await readFile(
      resolve(testDir, OUT_DIR, "server-edge", "render.js"),
      "utf-8"
    );
    expect(render).toContain(BASE);
  });
});
