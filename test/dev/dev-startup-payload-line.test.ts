import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createLogger, createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { setupIndexHTML } from "../setup.js";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * In dev, `GET /` is the HTML shell and the page renders once the browser has
 * loaded the payload, so a plain HTTP client sees an empty document. Next to
 * Vite's own URLs the dev server prints one line that says so and names the
 * payload URL of the root route, the URL such a client can read instead.
 */

const fixturesDir = resolve(__dirname, "../fixtures/dev-startup-payload-line.test");

async function startApp(name: string, port: number, base?: string) {
  const testDir = join(fixturesDir, name);
  const routesDir = join(testDir, "src/routes");
  await setupIndexHTML(testDir);
  await mkdir(routesDir, { recursive: true });
  await writeFile(
    join(routesDir, "page.tsx"),
    `export const Page = () => <h1>Home</h1>;`,
  );
  try {
    await symlink(
      resolve(__dirname, "../../node_modules"),
      join(testDir, "node_modules"),
      "dir",
    );
  } catch {}
  const lines: string[] = [];
  const customLogger = createLogger("info");
  customLogger.info = (message) => void lines.push(message);
  const server = await createServer({
    mode: "test",
    root: testDir,
    base,
    customLogger,
    esbuild: { jsx: "automatic" },
    cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
    plugins: [
      vitePluginReactServer({
        ...testUserOptions,
        moduleBaseURL: base ?? "/",
        Page: undefined,
        props: undefined,
        projectRoot: testDir,
        moduleBase: "src",
        routes: { dir: "routes" },
      }),
    ],
    server: { port, strictPort: true, host: "localhost" },
  });
  await server.listen();
  lines.length = 0;
  server.printUrls();
  return { server, lines };
}

// The printed text carries ANSI colors.
const plain = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, "");

describe("dev server: the startup line that names the payload URL", () => {
  const servers: ViteDevServer[] = [];
  let rootLines: string[] = [];
  let baseLines: string[] = [];

  beforeAll(async () => {
    await rm(fixturesDir, { recursive: true, force: true });
    const root = await startApp("root", 3172);
    servers.push(root.server);
    rootLines = root.lines.map(plain);
    const based = await startApp("based", 3173, "/docs/");
    servers.push(based.server);
    baseLines = based.lines.map(plain);
  }, 60_000);

  afterAll(async () => {
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

  it("prints one line with the payload URL of the root route", () => {
    const hits = rootLines.filter((line) => line.includes("index.rsc"));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("http://localhost:3172/index.rsc");
    expect(hits[0]).not.toContain("\n");
  });

  it("says pages render in the browser", () => {
    const hit = rootLines.find((line) => line.includes("index.rsc"));
    expect(hit).toMatch(/render in the browser/);
  });

  it("prints it after Vite's own URLs", () => {
    const local = rootLines.findIndex((line) => line.includes("Local:"));
    const hint = rootLines.findIndex((line) => line.includes("index.rsc"));
    expect(local).toBeGreaterThanOrEqual(0);
    expect(hint).toBeGreaterThan(local);
  });

  it("puts the payload URL under the base", () => {
    const hit = baseLines.find((line) => line.includes("index.rsc"));
    expect(hit).toContain("http://localhost:3173/docs/index.rsc");
  });
});
