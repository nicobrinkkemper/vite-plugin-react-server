import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { setupIndexHTML } from "../setup.js";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * A flight request for a url the file router has no route for is answered
 * with a 404, the way a static host answers a path that was never built:
 * the app's /404 route as flight when it has one (so the client router can
 * show it), a plain "Not Found" otherwise. The router's `no route matches`
 * error must not escape the dev middleware as an unhandled rejection.
 *
 * The request carries its own timeout: a request that is never answered
 * fails there instead of hanging the suite.
 */

const fixturesDir = resolve(__dirname, "../fixtures/unmatched-route-404.test");

async function startApp(name: string, port: number, withNotFoundRoute: boolean) {
  const testDir = join(fixturesDir, name);
  const routesDir = join(testDir, "src/routes");
  await setupIndexHTML(testDir);
  await mkdir(routesDir, { recursive: true });
  await writeFile(
    join(routesDir, "page.tsx"),
    `export const Page = () => <div>Home</div>;`,
  );
  if (withNotFoundRoute) {
    await mkdir(join(routesDir, "404"), { recursive: true });
    await writeFile(
      join(routesDir, "404/page.tsx"),
      `export const Page = () => <div>NOTHING_HERE</div>;`,
    );
  }
  try {
    await symlink(
      resolve(__dirname, "../../node_modules"),
      join(testDir, "node_modules"),
      "dir",
    );
  } catch {}
  const server = await createServer({
    mode: "test",
    root: testDir,
    esbuild: { jsx: "automatic" },
    cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
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
    server: { port },
  });
  await server.listen();
  return server;
}

const flight = (port: number, path: string) =>
  fetch(`http://localhost:${port}${path}`, {
    headers: { accept: "text/x-component" },
    signal: AbortSignal.timeout(15_000),
  });

describe("dev server: a url no route matches", () => {
  const servers: ViteDevServer[] = [];
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);

  beforeAll(async () => {
    process.on("unhandledRejection", onRejection);
    await rm(fixturesDir, { recursive: true, force: true });
    servers.push(await startApp("plain", 3161, false));
    servers.push(await startApp("with-404-route", 3162, true));
  }, 60_000);

  afterAll(async () => {
    process.off("unhandledRejection", onRejection);
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(servers.map((server) => server.close())),
      new Promise<void>((done) => {
        timer = setTimeout(done, 15_000);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    await rm(fixturesDir, { recursive: true, force: true });
  }, 30_000);

  it("answers 404 when the app has no /404 route", async () => {
    const response = await flight(3161, "/nope/index.rsc");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
    expect(rejections).toEqual([]);
  });

  it("answers 404 with the /404 route's flight when the app has one", async () => {
    const response = await flight(3162, "/nope/index.rsc");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/x-component");
    expect(response.headers.get("x-vprs-outcome")).toBe("not-found");
    expect(await response.text()).toContain("NOTHING_HERE");
    expect(rejections).toEqual([]);
  });

  it("still renders a route that matches", async () => {
    const response = await flight(3162, "/index.rsc");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Home");
  });
});
