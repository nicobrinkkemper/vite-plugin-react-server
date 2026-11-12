import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { setupIndexHTML } from "../setup.js";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { request } from "node:http";
import { resolve, join } from "node:path";

/**
 * A payload URL (`/index.rsc`, `/about/index.rsc`) names the flight payload,
 * so the dev server answers it with the payload whatever the Accept header
 * says. The browser router asks with `Accept: text/x-component`; curl sends
 * every type, a bare HTTP client sends no Accept at all, and a URL pasted
 * into the address bar asks for a document. None of them should get the
 * HTML shell back.
 *
 * `node:http` is used instead of `fetch` because fetch always adds an Accept
 * header of its own.
 */

const testDir = resolve(__dirname, "../fixtures/payload-url-any-accept.test");
const PORT = 3171;

function get(
  path: string,
  accept: string | undefined,
): Promise<{ status: number; contentType: string; body: string }> {
  return new Promise((done, fail) => {
    const req = request(
      {
        host: "localhost",
        port: PORT,
        path,
        method: "GET",
        headers: accept === undefined ? {} : { accept },
        timeout: 15_000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          done({
            status: res.statusCode ?? 0,
            contentType: String(res.headers["content-type"] ?? ""),
            body,
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error(`no answer for ${path}`)));
    req.on("error", fail);
    req.end();
  });
}

describe("dev server: a payload URL returns the payload for any Accept", () => {
  let server: ViteDevServer;

  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    const routesDir = join(testDir, "src/routes");
    await setupIndexHTML(testDir);
    await mkdir(join(routesDir, "about"), { recursive: true });
    await writeFile(
      join(routesDir, "page.tsx"),
      `export const Page = () => <h1>HOME_PAGE</h1>;`,
    );
    await writeFile(
      join(routesDir, "about/page.tsx"),
      `export const Page = () => <h1>ABOUT_PAGE</h1>;`,
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
      esbuild: { jsx: "automatic" },
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${PORT}`),
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
      server: { port: PORT, strictPort: true },
    });
    await server.listen();
  }, 60_000);

  afterAll(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      server?.close(),
      new Promise<void>((done) => {
        timer = setTimeout(done, 15_000);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    await rm(testDir, { recursive: true, force: true });
  }, 30_000);

  const accepts: Array<[string, string | undefined]> = [
    ["the router's text/x-component", "text/x-component"],
    ["curl's */*", "*/*"],
    ["no Accept header", undefined],
    ["a browser navigation", "text/html,application/xhtml+xml,*/*;q=0.8"],
  ];

  for (const [name, accept] of accepts) {
    it(`/index.rsc with ${name}`, async () => {
      const res = await get("/index.rsc", accept);
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("text/x-component");
      expect(res.body).toContain("HOME_PAGE");
      expect(res.body).not.toContain("<script");
    });

    it(`/about/index.rsc with ${name}`, async () => {
      const res = await get("/about/index.rsc", accept);
      expect(res.status).toBe(200);
      expect(res.contentType).toContain("text/x-component");
      expect(res.body).toContain("ABOUT_PAGE");
    });
  }

  it("still answers / with the HTML shell", async () => {
    const res = await get("/", "*/*");
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("text/html");
  });
});
