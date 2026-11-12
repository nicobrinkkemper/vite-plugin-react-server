import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preview, type PreviewServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config.js";

// `vite preview` of a static build answers like the static host it stands in
// for: /about and /about/ both serve about/index.html, an unknown route is a
// 404, and a flight request reads the route's index.rsc. Vite's own SPA
// fallback would answer every extensionless path with the root index.html.
const testDir = resolve(__dirname, "../fixtures/preview-static-routing.test");
const staticDir = join(testDir, "dist/static");

let server: PreviewServer;
let origin: string;

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/page"), { recursive: true });
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `export const Page = () => <h1>home</h1>;\n`
  );
  await writeFile(join(testDir, "src/page/props.ts"), `export const props = {};\n`);
  await mkdir(join(staticDir, "about"), { recursive: true });
  await mkdir(join(staticDir, "assets"), { recursive: true });
  await writeFile(join(staticDir, "index.html"), "<h1>home</h1>");
  await writeFile(join(staticDir, "index.rsc"), "0:home");
  await writeFile(join(staticDir, "about", "index.html"), "<h1>about</h1>");
  await writeFile(join(staticDir, "about", "index.rsc"), "0:about");
  await writeFile(join(staticDir, "assets", "app.js"), "export {};");

  server = await preview({
    root: testDir,
    configFile: false,
    logLevel: "silent",
    preview: { port: 0, host: "127.0.0.1" },
    plugins: vitePluginReactServer({ ...testUserOptions, projectRoot: testDir }),
  });
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("no port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await server?.close();
  await rm(testDir, { recursive: true, force: true });
});

const DOCUMENT = "text/html,application/xhtml+xml,*/*;q=0.8";
const get = (path: string, accept = DOCUMENT) =>
  fetch(origin + path, { headers: { accept } });

describe("vite preview serves the static build like a static host", () => {
  it("serves the home page for /", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<h1>home</h1>");
  });

  it("resolves /about without a trailing slash to about/index.html", async () => {
    const res = await get("/about");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>about</h1>");
  });

  it("resolves /about/ to about/index.html", async () => {
    const res = await get("/about/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<h1>about</h1>");
  });

  it("answers an unknown route with 404, not the home page", async () => {
    const res = await get("/nope");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("home");
  });

  it("answers an unknown route with 404 for a client that accepts anything", async () => {
    const res = await get("/nope", "*/*");
    expect(res.status).toBe(404);
  });

  it("answers HEAD for a page with headers only", async () => {
    const res = await fetch(origin + "/about", {
      method: "HEAD",
      headers: { accept: "text/html" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("serves a route's flight for an RSC request", async () => {
    const res = await get("/about", "text/x-component");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-component");
    expect(await res.text()).toBe("0:about");
  });

  // The payload URL names the flight file, so the Accept header does not
  // decide: curl sends */*, an address bar asks for a document.
  it("serves a payload URL as the payload for a client that accepts anything", async () => {
    const res = await get("/about/index.rsc", "*/*");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-component");
    expect(await res.text()).toBe("0:about");
  });

  it("serves the root payload URL as the payload for a client that accepts anything", async () => {
    const res = await get("/index.rsc", "*/*");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-component");
    expect(await res.text()).toBe("0:home");
  });

  it("serves a payload URL as the payload for a document request", async () => {
    const res = await get("/about/index.rsc");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-component");
    expect(await res.text()).toBe("0:about");
  });

  it("404s the payload URL of an unknown route for a client that accepts anything", async () => {
    const res = await get("/nope/index.rsc", "*/*");
    expect(res.status).toBe(404);
  });

  it("404s the flight of an unknown route", async () => {
    const res = await get("/nope", "text/x-component");
    expect(res.status).toBe(404);
  });

  it("leaves assets to Vite's static serving", async () => {
    const res = await get("/assets/app.js", "*/*");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("export {};");
  });
});
