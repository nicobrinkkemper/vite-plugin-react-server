import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve, join } from "node:path";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// createHost over the emitted artifacts (host-spec: the API + request
// algorithm + prod-grade HTTP). The Node convenience form inspects buildDir,
// reads the host manifest, and serves: exact-match assets before routing,
// prerendered documents, per-request renders for dynamic matches (through
// the flavor the manifest records — the baked pair for a webpack build),
// the action gate on POST, and DISTINCT failure pages — 404 for a miss,
// 500 after onError for a render failure, 405 elsewhere. Conditional
// requests and cache profiles derive from the manifest at startup.
const isolatedLeg = getCondition() !== REACT_CONDITION.server;

const testDir = resolve(__dirname, "../fixtures/host-serving.test");
const PORT = 4225;
const BASE = `http://localhost:${PORT}`;

async function setupFixture() {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/routes/docs/$slug"), { recursive: true });
  await writeFile(
    join(testDir, "src/action.ts"),
    `"use server";\n` +
      `export async function greet(n: number): Promise<string> {\n` +
      `  return "host:" + n;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/Counter.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `import { greet } from "../action.js";\n` +
      `export function Counter() {\n` +
      `  const [n] = React.useState(0);\n` +
      `  void greet;\n` +
      `  return <button>{"n:" + n}</button>;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main><h1>{"host-serving-home"}</h1><Counter /></main>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/routes/docs/$slug/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = ({ slug }: { slug: string }) => {\n` +
      `  if (slug === "explode") throw new Error("deliberate render failure");\n` +
      `  return <article>{"doc:" + slug}</article>;\n` +
      `};\n`
  );
  await writeFile(
    join(testDir, "src/routes/docs/$slug/props.ts"),
    `export const props = (url: string) => ({\n` +
      `  slug: url.split("/").filter(Boolean).pop() ?? "",\n` +
      `});\n`
  );
  await writeFile(
    join(testDir, "src/client.tsx"),
    `"use client";\n` +
      `import { startClient } from "vite-plugin-react-server/router/client";\n` +
      `startClient({ moduleBaseURL: "/" });\n`
  );
  await writeFile(
    join(testDir, "index.html"),
    `<!DOCTYPE html><html><head></head><body><div id="root"></div>` +
      `<script type="module" src="/src/client.tsx"></script></body></html>`
  );
  await writeFile(
    join(testDir, "build.mjs"),
    `import { createBuilder } from "vite";\n` +
      `import { vitePluginReactServer } from "vite-plugin-react-server";\n` +
      `import { fileRouter } from "vite-plugin-react-server/router";\n` +
      `const fr = fileRouter("src/routes", {\n` +
      `  root: process.cwd(),\n` +
      `  staticPaths: { "/docs/$slug": () => [{ slug: "alpha" }] },\n` +
      `});\n` +
      `const builder = await createBuilder({\n` +
      `  configFile: false,\n` +
      `  root: process.cwd(),\n` +
      `  mode: "production",\n` +
      `  esbuild: { jsx: "automatic" },\n` +
      `  plugins: vitePluginReactServer({\n` +
      `    runner: "isolated",\n` +
      `    transport: "webpack",\n` +
      `    moduleBase: "src",\n` +
      `    Page: fr.Page,\n` +
      `    props: fr.props,\n` +
      `    routePatterns: fr.routePatterns,\n` +
      `    build: { pages: fr.build.pages, outDir: "dist" },\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    projectRoot: process.cwd(),\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("HOST_SERVING_BUILD_OK");\n` +
      `process.exit(0);\n`
  );
  try {
    await symlink(
      resolve(__dirname, "../../node_modules"),
      join(testDir, "node_modules"),
      "dir"
    );
  } catch {
    /* already linked */
  }
}

describe.skipIf(!isolatedLeg)("createHost (Node convenience form)", () => {
  let server: Server | undefined;
  const seenErrors: string[] = [];

  beforeAll(async () => {
    await setupFixture();
    const proc = spawnSync("node", ["build.mjs"], {
      cwd: testDir,
      encoding: "utf8",
      timeout: 180000,
      env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
    });
    expect(
      proc.stdout,
      `build failed (status ${proc.status}):\n${proc.stderr}`
    ).toContain("HOST_SERVING_BUILD_OK");

    const { createHost, toNodeListener } = (await import(
      "vite-plugin-react-server/host"
    )) as {
      createHost: (opts: {
        buildDir: string;
        onError?: (e: unknown) => void;
      }) => (req: Request) => Promise<Response>;
      toNodeListener: (
        h: (req: Request) => Promise<Response>
      ) => Parameters<typeof createServer>[1];
    };
    const handler = createHost({
      buildDir: join(testDir, "dist"),
      onError: (e) => seenErrors.push(String(e)),
    });
    server = createServer(toNodeListener(handler));
    await new Promise<void>((r) => server!.listen(PORT, r));
  }, 240000);

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
    if (!process.env["KEEP_FIXTURE"])
      await rm(testDir, { recursive: true, force: true });
  });

  it("serves a prerendered document with revalidation semantics", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-type")).toContain("charset=utf-8");
    expect(await res.text()).toContain("host-serving-home");
    const etag = res.headers.get("etag");
    expect(etag).toBeTruthy();
    expect(res.headers.get("cache-control")).toContain("no-cache");
    const cached = await fetch(`${BASE}/`, {
      headers: { "if-none-match": etag! },
    });
    expect(cached.status).toBe(304);
  });

  it("serves manifest assets before routing, with the immutable profile", async () => {
    const home = await fetch(`${BASE}/`).then((r) => r.text());
    const asset = home.match(/src="(\/[^"]+\.js)"/)?.[1];
    expect(asset).toBeTruthy();
    const res = await fetch(`${BASE}${asset}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("renders a dynamic match per-request through the manifest's flavor", async () => {
    const res = await fetch(`${BASE}/docs/beta/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("doc:beta");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("serves the .rsc variant with the flight type and Vary: Accept", async () => {
    const res = await fetch(`${BASE}/docs/beta/index.rsc`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-component");
    expect(res.headers.get("vary") ?? "").toContain("Accept");
  });

  it("canonicalizes the trailing slash with a 308", async () => {
    const res = await fetch(`${BASE}/docs/beta`, { redirect: "manual" });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/docs/beta/");
  });

  it("answers a miss with a 404 document, never a bare body", async () => {
    const res = await fetch(`${BASE}/no/such/route/`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("a render failure is a 500 after onError — never a 404, never a 200", async () => {
    const res = await fetch(`${BASE}/docs/explode/`);
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(seenErrors.some((e) => e.includes("deliberate render failure"))).toBe(
      true
    );
  });

  it("routes action POSTs through the gate", async () => {
    const { encodeReply } = await import("react-server-dom-esm/client.edge");
    const body = await encodeReply([7]);
    const res = await fetch(`${BASE}/`, {
      method: "POST",
      headers: { "x-rsc-action": "src/action.ts#greet" },
      body: body as string,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"host:7"');
  });

  it("everything else is 405 with Allow", async () => {
    const res = await fetch(`${BASE}/`, { method: "PUT" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBeTruthy();
  });
});
