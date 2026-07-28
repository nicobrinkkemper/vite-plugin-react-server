import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { setupTestProject } from "../setup.js";

/**
 * Tests for CSS module handling in dev mode.
 *
 * Runs under both dev:rsc (test:server, with `--conditions react-server`)
 * and dev:ssr (test:client, without) — same source, two transports.
 *
 * Catches the class of regression that surfaced during the 1.6.0
 * ModuleRunner work: rendered HTML had the right hashed class name but
 * no stylesheet attached, because the rsc-worker's CSS collection path
 * was bypassed. None of the other test/dev specs *asserted* anything
 * about CSS, so the regression only showed up in the playwright e2e.
 */

let server: ViteDevServer | undefined;
const port = 3120;
const testDir = resolve(__dirname, "../fixtures/css-hmr.test");
const cssPath = join(testDir, "src/page/test.module.css");
let originalCss = "";

describe("CSS module handling in dev", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    // Reuse the standard fixture (it already imports a *.module.css from
    // src/page/page.tsx). Snapshot the CSS so the second test can mutate
    // it deterministically.
    await setupTestProject(testDir);
    originalCss = await readFile(cssPath, "utf-8");

    server = await createServer({
      mode: "test",
      root: testDir,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
        }),
      ],
      server: { port, strictPort: true },
      logLevel: "warn",
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
    });
    await server.listen();
  }, 30000);

  afterAll(async () => {
    if (originalCss) {
      try {
        await writeFile(cssPath, originalCss);
      } catch {
        // Fixture dir is removed below anyway.
      }
    }
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("references the imported CSS module in the rendered response", async () => {
    const res = await fetch(`http://localhost:${port}/`, {
      headers: { Accept: "text/x-component" },
    });
    expect(res.ok).toBe(true);
    const body = await res.text();
    // CSS-modules hashes the local class — exact hash varies, but the
    // prefix is deterministic. setupPageTSX defines `.test` and `.shared`.
    expect(body).toMatch(/_test_/);
    // vprs's CSS collection must produce a tag for the imported sheet,
    // either inlined as <style> or via a <link rel="stylesheet" href=…>.
    // Without the collection path populating cssFiles, the class name
    // renders but nothing carries the rule, leaving the page unstyled.
    expect(body).toMatch(/test\.module\.css/);
  }, 20000);

  it("serves the latest CSS bytes after the source file is edited", async () => {
    // Prime the module graph so Vite has transformed the page + the CSS
    // module at least once.
    await fetch(`http://localhost:${port}/`, {
      headers: { Accept: "text/x-component" },
    });

    const before = await fetch(
      `http://localhost:${port}/src/page/test.module.css?direct`
    );
    expect(before.ok).toBe(true);
    // setupPageTSX writes `.test {color: red}` initially.
    expect(await before.text()).toMatch(/color:\s*red/);

    await writeFile(
      cssPath,
      `.test {color: rgb(0, 0, 255)}\n.shared {background: white}\n.unused {display: none}`
    );
    // Allow Vite's file watcher to fire and the worker (in dev:ssr) to
    // invalidate its runner cache.
    await sleep(1500);

    const after = await fetch(
      `http://localhost:${port}/src/page/test.module.css?direct`
    );
    expect(after.ok).toBe(true);
    const afterBody = await after.text();
    expect(afterBody).toContain("rgb(0, 0, 255)");
    expect(afterBody).not.toMatch(/color:\s*red/);
  }, 20000);

  it("re-renders flight with class names matching the served CSS after an edit", async () => {
    // The browser fetches a server-rendered stylesheet as a plain <link>
    // request, which registers an importer-LESS node for the file in the
    // client module graph. That node must not be mistaken for client-owned
    // CSS: when it was, the css edit was handed to Vite (whose only move for
    // an importer-less sheet is a full reload) and the rsc worker never
    // dropped its css-module proxy — so the flight kept serving the OLD
    // class-name hashes against the NEW stylesheet until a server restart.
    await fetch(`http://localhost:${port}/src/page/test.module.css?direct`);
    const flightBefore = await (
      await fetch(`http://localhost:${port}/`, {
        headers: { Accept: "text/x-component" },
      })
    ).text();
    expect(flightBefore).toMatch(/_test_/);

    await writeFile(
      cssPath,
      `.test {color: rgb(7, 7, 7); padding: 9px}\n.shared {background: white}`
    );
    await sleep(1500);

    const flightAfter = await (
      await fetch(`http://localhost:${port}/`, {
        headers: { Accept: "text/x-component" },
      })
    ).text();
    const classAfter = flightAfter.match(/_test_[a-zA-Z0-9_-]+/)?.[0];
    const cssAfter = await (
      await fetch(`http://localhost:${port}/src/page/test.module.css?direct`)
    ).text();
    // Content edits move the css-modules hash; the flight must move with
    // it. A mismatch is the stale-until-restart symptom.
    expect(classAfter).toBeTruthy();
    expect(cssAfter).toContain(classAfter!);
  }, 20000);
});
