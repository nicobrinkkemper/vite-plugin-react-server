import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { setupIndexHTML } from "../setup.js";
import { mkdir, rm, writeFile, symlink, rename } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * A page added while the dev server runs adds a route, and the route set is
 * part of the resolved config, so the server restarts: real restarts here,
 * not stubs. Every case runs in both setups a restart treats differently:
 *
 * - plugins passed inline to createServer, which a restart reuses (with the
 *   route table they hold);
 * - a vite.config.ts, which a restart re-imports, building new plugins and a
 *   new route table for the new server.
 */

type Setup = "inline plugins" | "vite.config.ts";
let server: ViteDevServer;
let port = 3151;
let testDir = "";
let routesDir = "";
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

describe.each<[Setup, number]>([
  ["inline plugins", 3151],
  ["vite.config.ts", 3155],
])("dev server restart on a new route (%s)", (setup, setupPort) => {
  beforeEach(async () => {
    port = setupPort;
    testDir = resolve(
      __dirname,
      `../fixtures/route-tree-restart-${setup === "inline plugins" ? "inline" : "config"}.test`,
    );
    routesDir = join(testDir, "src/routes");
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
    const pluginOptions = {
      ...testUserOptions,
      Page: undefined,
      props: undefined,
      projectRoot: testDir,
      moduleBase: "src",
      routes: { dir: "routes" },
    };
    if (setup === "vite.config.ts") {
      await writeFile(
        join(testDir, "vite.config.ts"),
        `import { vitePluginReactServer } from "vite-plugin-react-server";\n` +
          `export default { plugins: vitePluginReactServer(${JSON.stringify(pluginOptions)}) };\n`,
      );
    }
    server = await createServer({
      mode: "test",
      root: testDir,
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
      ...(setup === "vite.config.ts"
        ? { configFile: join(testDir, "vite.config.ts") }
        : { configFile: false, plugins: [vitePluginReactServer(pluginOptions)] }),
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

  it("keeps route files the old watcher reports while a restart runs", async () => {
    // The old watcher sees the page and its restart request fires before the
    // swap, when restart() only hands back the run in flight.
    const close = server.close.bind(server);
    const { watcher } = server;
    server.close = (async () => {
      const page = join(routesDir, "seen/page.tsx");
      const seen = new Promise<void>((resolve) => {
        watcher.on("add", (file) => {
          if (file === page) resolve();
        });
      });
      await mkdir(join(routesDir, "seen"), { recursive: true });
      await writeFile(page, `export const Page = () => <div>seen-page</div>;`);
      await seen;
      await pause(200);
      return close();
    }) as typeof server.close;
    const restart = nextRestart(2);
    await mkdir(join(routesDir, "trigger"), { recursive: true });
    await writeFile(
      join(routesDir, "trigger/page.tsx"),
      `export const Page = () => <div>trigger-page</div>;`,
    );
    await restart;
    expect(await served("/seen", "seen-page")).toContain("seen-page");
  }, 60_000);

  it("a restart keeps one copy of each plugin", async () => {
    const copies = () =>
      server.config.plugins.filter((p) => p.name === "vite:plugin-react-server/environments")
        .length;
    expect(copies()).toBe(1);
    const restart = nextRestart();
    await mkdir(join(routesDir, "trigger"), { recursive: true });
    await writeFile(
      join(routesDir, "trigger/page.tsx"),
      `export const Page = () => <div>trigger-page</div>;`,
    );
    await restart;
    expect(copies()).toBe(1);
  }, 60_000);

  it("keeps a head.ts that lands while a restart runs", async () => {
    // Only the head of an existing route changes during the swap, so the
    // route set stays put: the new server's own table must pick it up.
    const close = server.close.bind(server);
    server.close = (async () => {
      await writeFile(join(routesDir, "about/head.ts"), `export const head = { lang: "nl" };`);
      return close();
    }) as typeof server.close;
    const restart = nextRestart();
    await mkdir(join(routesDir, "trigger"), { recursive: true });
    await writeFile(
      join(routesDir, "trigger/page.tsx"),
      `export const Page = () => <div>trigger-page</div>;`,
    );
    await restart;
    expect(await served("/about", NL)).toContain(NL);
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
  it("a routes dir moved away empties the route set, and moving it back restores it", async () => {
    const moved = `${routesDir}-moved`;
    const away = nextRestart();
    await rename(routesDir, moved);
    await away;
    let body: string | null = "unset";
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      body = await flight("/about");
      if (!body?.includes("about-page")) break;
      await pause(500);
    }
    expect(body ?? "").not.toContain("about-page");
    const back = nextRestart();
    await rename(moved, routesDir);
    await back;
    expect(await served("/about", "about-page")).toContain("about-page");
  }, 60_000);
});
