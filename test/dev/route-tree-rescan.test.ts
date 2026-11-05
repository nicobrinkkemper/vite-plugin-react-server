import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { setupIndexHTML } from "../setup.js";
import { mkdir, rm, writeFile, symlink, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * The `routes` table is scanned once when the config resolves. A route file
 * added or removed while the dev server runs (a new `head.ts` for a segment, a
 * new page) changes what the scan returns, so the dev server must restart to
 * rescan; before, a new `about/head.ts` stayed invisible (the About flight
 * kept the root language) until Vite was restarted by hand. Every file kind
 * the scan recognizes counts, and only those, and only inside the route tree.
 */

let server: ViteDevServer;
const port = 3149;
const testDir = resolve(__dirname, "../fixtures/route-tree-rescan.test");
const routesDir = join(testDir, "src/routes");
const restart = vi.fn(async () => {});

const settle = () => new Promise((r) => setTimeout(r, 400));

async function expectRestartAfter(change: () => Promise<void>) {
  const before = restart.mock.calls.length;
  await change();
  await vi.waitFor(
    () => expect(restart.mock.calls.length).toBeGreaterThan(before),
    { timeout: 10_000, interval: 50 },
  );
  // Let the coalescing window close before the next change.
  await settle();
}

async function expectNoRestartAfter(change: () => Promise<void>) {
  const before = restart.mock.calls.length;
  await change();
  await new Promise((r) => setTimeout(r, 1_500));
  expect(restart.mock.calls.length).toBe(before);
}

describe("dev server rescans the route tree", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupIndexHTML(testDir);
    await mkdir(join(routesDir, "about"), { recursive: true });
    await mkdir(join(testDir, "src/other"), { recursive: true });
    await writeFile(
      join(routesDir, "page.tsx"),
      `export const Page = () => <div>Home</div>;`,
    );
    await writeFile(
      join(routesDir, "head.ts"),
      `export const head = { lang: "en" };`,
    );
    await writeFile(
      join(routesDir, "about/page.tsx"),
      `export const Page = () => <div>About</div>;`,
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
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          moduleBase: "src",
          Page: undefined,
          props: undefined,
          routes: { dir: "routes" },
        }),
      ],
      server: { port },
    });
    // Observe the restart instead of performing it.
    server.restart = restart;
    await server.listen();
    await settle();
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

  it("on adding and removing a segment's head.ts", async () => {
    const file = join(routesDir, "about/head.ts");
    await expectRestartAfter(() =>
      writeFile(file, `export const head = { lang: "nl" };`),
    );
    await expectRestartAfter(() => unlink(file));
  }, 30_000);

  it.each([
    "page.tsx",
    "index.tsx",
    "props.ts",
    "route.tsx",
    "error.tsx",
    "loading.tsx",
  ])("on adding and removing %s", async (name) => {
    const dir = join(routesDir, "kinds");
    await mkdir(dir, { recursive: true });
    const file = join(dir, name);
    await expectRestartAfter(() => writeFile(file, `export {};`));
    await expectRestartAfter(() => unlink(file));
  }, 30_000);

  it("not on editing an existing route file", async () => {
    await expectNoRestartAfter(() =>
      writeFile(join(routesDir, "head.ts"), `export const head = { lang: "de" };`),
    );
  }, 30_000);

  it("not for files the scan ignores or outside the route tree", async () => {
    await expectNoRestartAfter(async () => {
      await writeFile(join(routesDir, "about/Widget.tsx"), `export {};`);
      await writeFile(join(testDir, "src/other/page.tsx"), `export {};`);
    });
  }, 30_000);
});
