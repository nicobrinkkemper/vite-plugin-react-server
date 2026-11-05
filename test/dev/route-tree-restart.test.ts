import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
let restartsLogged = 0;

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

// A fresh server per test: on the react-server leg a server restarted a
// third time runs the process out of memory (with or without `routes`), so
// no test here restarts one server more than twice.
describe("dev server restart on a new route", () => {
  beforeEach(async () => {
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

    const log = console.log.bind(console);
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      if (args.some((a) => String(a).includes("server restarted."))) restartsLogged++;
      log(...args);
    });
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

  afterEach(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      server?.close(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 15_000);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    vi.restoreAllMocks();
    await rm(testDir, { recursive: true, force: true });
  }, 30_000);

  /**
   * Resolve once Vite logs `count` more "server restarted." than now. The server
   * object a restart runs on is not always the one this test holds, so the
   * log is the observable.
   */
  function nextRestart(count = 1): Promise<void> {
    const target = restartsLogged + count;
    return vi.waitFor(
      () => {
        if (restartsLogged < target) throw new Error("not restarted yet");
      },
      { timeout: 30_000, interval: 50 },
    );
  }

  async function served(route: string, marker: string): Promise<string | null> {
    let body: string | null = null;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      body = await flight(route);
      if (body?.includes(marker)) break;
      await pause(500);
    }
    return body;
  }

  const NL = `\\"lang\\":\\"nl\\"`;

  it("serves a page added while the server runs", async () => {
    const restart = nextRestart();
    await mkdir(join(routesDir, "fresh"), { recursive: true });
    await writeFile(
      join(routesDir, "fresh/page.tsx"),
      `export const Page = () => <div>fresh-page</div>;`,
    );
    await restart;
    expect(await served("/fresh", "fresh-page")).toContain("fresh-page");
    // The routes that were there still serve.
    expect(await flight("/about")).toContain("about-page");
  }, 60_000);

  it("keeps route files that land while a restart is pending", async () => {
    // A burst: a page, then (inside the restart's coalescing window) its
    // head.ts and another page. All three must be there after the restart.
    const restart = nextRestart();
    await mkdir(join(routesDir, "burst"), { recursive: true });
    await mkdir(join(routesDir, "burst2"), { recursive: true });
    await writeFile(
      join(routesDir, "burst/page.tsx"),
      `export const Page = () => <div>burst-page</div>;`,
    );
    await pause(10);
    await writeFile(join(routesDir, "burst/head.ts"), `export const head = { lang: "nl" };`);
    await writeFile(
      join(routesDir, "burst2/page.tsx"),
      `export const Page = () => <div>burst2-page</div>;`,
    );
    await restart;
    const burst = await served("/burst", NL);
    expect(burst).toContain("burst-page");
    expect(burst).toContain(NL);
    expect(await served("/burst2", "burst2-page")).toContain("burst2-page");
  }, 60_000);

  it("keeps route files that land while a restart runs", async () => {
    // Written while the restart swaps servers: after the new server (and its
    // watcher) exists, just before the old one closes. The old watcher closes
    // before it reports them and the new one's initial scan swallows them.
    const close = server.close.bind(server);
    server.close = (async () => {
      await mkdir(join(routesDir, "during"), { recursive: true });
      await writeFile(
        join(routesDir, "during/page.tsx"),
        `export const Page = () => <div>during-page</div>;`,
      );
      await writeFile(join(routesDir, "during/head.ts"), `export const head = { lang: "nl" };`);
      return close();
    }) as typeof server.close;
    // Two restarts: the one the trigger page starts, then the one the rescan
    // after it starts for the page written meanwhile.
    const restart = nextRestart(2);
    await mkdir(join(routesDir, "trigger"), { recursive: true });
    await writeFile(
      join(routesDir, "trigger/page.tsx"),
      `export const Page = () => <div>trigger-page</div>;`,
    );
    await restart;
    const during = await served("/during", NL);
    expect(during).toContain("during-page");
    expect(during).toContain(NL);
  }, 60_000);
  it("a tree the scan rejects keeps the last good table, without restarting", async () => {
    // Two pages on one url make the scan throw. The error is reported and the
    // routes that were there keep serving; a restart would not scan any
    // differently, so none happens (and none loops).
    const lines: string[] = [];
    const logged = console.log;
    const log = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      lines.push(a.join(" "));
      (logged as (...x: unknown[]) => void)(...a);
    });
    const error = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      lines.push(a.join(" "));
    });
    const clash = join(routesDir, "(group)/page.tsx");
    try {
      await mkdir(join(clash, ".."), { recursive: true });
      await writeFile(clash, `export const Page = () => <div>clash</div>;`);
      await vi.waitFor(
        () => expect(lines.join("\n")).toContain("both resolve to"),
        { timeout: 10_000, interval: 50 },
      );
      await pause(1_500);
      expect(lines.join("\n")).not.toContain("restarting to rescan routes");
      expect(await flight("/about")).toContain("about-page");
    } finally {
      log.mockRestore();
      error.mockRestore();
      await rm(join(clash, ".."), { recursive: true, force: true });
    }
  }, 60_000);
});
