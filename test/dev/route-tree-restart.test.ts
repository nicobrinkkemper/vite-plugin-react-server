import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { setupIndexHTML } from "../setup.js";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * A page added while the dev server runs adds a route, and the route set is
 * part of the resolved config, so the server restarts. A restart reuses the
 * plugin instances passed inline to createServer (no config file is
 * re-imported), so the route table those instances hold must already carry
 * the new route: the real restart here, not a stub, is the point.
 */

let server: ViteDevServer;
const port = 3151;
const testDir = resolve(__dirname, "../fixtures/route-tree-restart.test");
const routesDir = join(testDir, "src/routes");
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The route's flight, or null while it is not served (unmatched requests can hang). */
async function flight(route: string): Promise<string | null> {
  try {
    const res = await fetch(`http://localhost:${port}${route}/index.rsc`, {
      headers: { Accept: "text/x-component" },
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

describe("dev server restart on a new route", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupIndexHTML(testDir);
    await mkdir(join(routesDir, "about"), { recursive: true });
    await writeFile(
      join(routesDir, "page.tsx"),
      `export const Page = () => <div>Home</div>;`,
    );
    await writeFile(
      join(routesDir, "about/page.tsx"),
      `export const Page = () => <div>about-page</div>;`,
    );
    try {
      await symlink(
        resolve(__dirname, "../../node_modules"),
        join(testDir, "node_modules"),
        "dir",
      );
    } catch {}

    server = await createServer({
      mode: "test",
      root: testDir,
      configFile: false,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          Page: undefined,
          props: undefined,
          projectRoot: testDir,
          moduleBase: "src",
          routes: { dir: "routes" },
        }),
      ],
      server: { port, strictPort: true },
    });
    await server.listen();
    // Wait until the watcher reports changes (its initial scan can trail listen()).
    const probe = join(routesDir, "watcher-probe.txt");
    const seen = new Promise<void>((resolve) => {
      const onAdd = (f: string) => {
        if (f !== probe) return;
        server.watcher.off("add", onAdd);
        resolve();
      };
      server.watcher.on("add", onAdd);
    });
    for (let i = 0; ; i++) {
      await writeFile(probe, String(i));
      if (await Promise.race([seen.then(() => true), pause(500).then(() => false)])) break;
      await rm(probe, { force: true });
      await pause(100);
    }
    await rm(probe, { force: true });
    expect(await flight("/about")).toContain("about-page");
  }, 60_000);

  afterAll(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      server?.close(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 15_000);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    await rm(testDir, { recursive: true, force: true });
  }, 30_000);

  it("serves a page added while the server runs", async () => {
    await mkdir(join(routesDir, "fresh"), { recursive: true });
    await writeFile(
      join(routesDir, "fresh/page.tsx"),
      `export const Page = () => <div>fresh-page</div>;`,
    );
    let body: string | null = null;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      body = await flight("/fresh");
      if (body?.includes("fresh-page")) break;
      await pause(500);
    }
    expect(body).toContain("fresh-page");
    // The routes that were there still serve.
    expect(await flight("/about")).toContain("about-page");
  }, 60_000);
});
