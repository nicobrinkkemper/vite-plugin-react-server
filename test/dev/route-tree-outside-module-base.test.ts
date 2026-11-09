import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { fileRouter } from "../../plugin/router/fileRouter.js";
import { testUserOptions } from "../test-config";
import { setupIndexHTML } from "../setup.js";
import { handleRSCStream } from "../rsc-stream.js";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * A route tree outside `moduleBase` (`routes: fileRouter("app", ...)` with
 * `moduleBase: "src"`): adding a `head.ts` there must still refetch the open
 * page, though the file is neither under the module base nor yet in the
 * server graph.
 */

let server: ViteDevServer;
const port = 3157;
const testDir = resolve(__dirname, "../fixtures/route-tree-outside-module-base.test");
const appDir = join(testDir, "app");
const refetches: string[] = [];

const aboutFlight = async () => {
  const response = await handleRSCStream(`http://localhost:${port}/about/index.rsc`);
  expect(response.ok).toBe(true);
  return response.result as string;
};

describe("route tree outside the module base", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupIndexHTML(testDir);
    await mkdir(join(appDir, "about"), { recursive: true });
    await mkdir(join(testDir, "src"), { recursive: true });
    await writeFile(join(appDir, "page.tsx"), `export const Page = () => <div>Home</div>;`);
    await writeFile(join(appDir, "about/page.tsx"), `export const Page = () => <div>about-page</div>;`);
    try {
      await symlink(resolve(__dirname, "../../node_modules"), join(testDir, "node_modules"), "dir");
    } catch {}
    server = await createServer({
      mode: "test",
      root: testDir,
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
      configFile: false,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          Page: undefined,
          props: undefined,
          projectRoot: testDir,
          moduleBase: "src",
          routes: fileRouter(appDir, { root: testDir }),
        }),
      ],
      server: { port, strictPort: true },
    });
    const send = server.ws.send.bind(server.ws) as (...a: unknown[]) => void;
    server.ws.send = ((...args: unknown[]) => {
      const payload = args[0] as { event?: string; data?: { path?: string } };
      if (payload?.event === "vite-plugin-react-server:server-component-update" && payload.data?.path) {
        refetches.push(payload.data.path);
      }
      return send(...args);
    }) as typeof server.ws.send;
    await server.listen();
    await new Promise((r) => setTimeout(r, 1_000));
    expect(await aboutFlight()).toContain("about-page");
  }, 60_000);

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  }, 30_000);

  it("refetches when a head.ts is added there", async () => {
    const file = join(appDir, "about/head.ts");
    await writeFile(file, `export const head = { lang: "nl" };`);
    await vi.waitFor(() => expect(refetches).toContain(file), { timeout: 10_000, interval: 50 });
    expect(await aboutFlight()).toContain(`\\"lang\\":\\"nl\\"`);
  }, 30_000);
});
