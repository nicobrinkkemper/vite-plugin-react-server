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
  await mkdir(join(testDir, "src/routes/docs/a/b"), { recursive: true });
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
    `import { notFound } from "vite-plugin-react-server/router";\n` +
      `export const props = (url: string) => {\n` +
      `  const slug = url.split("/").filter(Boolean).pop() ?? "";\n` +
      `  if (slug === "gone") notFound();\n` +
      `  if (slug === "hang") return new Promise(() => {});\n` +
      `  return { slug };\n` +
      `};\n`
  );
  await writeFile(
    join(testDir, "src/routes/docs/a/b/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = () => <article>{"nested-static-ab"}</article>;\n`
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
      `const BASE_PATH = process.env.BASE_PATH || undefined;\n` +
      `const builder = await createBuilder({\n` +
      `  configFile: false,\n` +
      `  root: process.cwd(),\n` +
      `  mode: "production",\n` +
      `  base: BASE_PATH,\n` +
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
      `    moduleBaseURL: BASE_PATH || "/",\n` +
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
    // The baked pair runs production React: the flight carries a digest,
    // not the component message — the contract is that onError FIRED and
    // the response is the 500 page, never a degraded 200.
    expect(seenErrors.length).toBeGreaterThan(0);
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

  it("malformed percent-encoding is a controlled 404, never a rejection", async () => {
    const res = await fetch(`${BASE}/%zz/`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("an encoded slash stays one segment — it cannot forge boundaries", async () => {
    // A COLLIDING static page exists: /docs/a/b is prerendered. The encoded
    // /docs/a%2Fb must still be the dynamic $slug render with one parameter,
    // never the nested static artifact.
    const res = await fetch(`${BASE}/docs/a%2Fb/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("doc:");
    expect(body).not.toContain("nested-static-ab");

    // And the real nested page still serves plainly.
    const nested = await fetch(`${BASE}/docs/a/b/`);
    expect(nested.status).toBe(200);
    expect(await nested.text()).toContain("nested-static-ab");
  });

  it("a malformed segment inside a dynamic-shaped path is the controlled 404", async () => {
    // /docs/$slug would match /docs/<anything> — but %zz cannot decode, so
    // the promise is the 404 document, not a dynamic render of raw bytes.
    const res = await fetch(`${BASE}/docs/%zz/`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("everything else is 405 with Allow", async () => {
    const res = await fetch(`${BASE}/`, { method: "PUT" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBeTruthy();
  });

  it("a prerendered .rsc is a document: no-cache and Vary, never immutable", async () => {
    const res = await fetch(`${BASE}/docs/alpha/index.rsc`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-component");
    expect(res.headers.get("cache-control")).toContain("no-cache");
    expect(res.headers.get("cache-control")).not.toContain("immutable");
    expect(res.headers.get("vary") ?? "").toContain("Accept");
  });

  it("Accept: text/x-component on a prerendered route serves the flight", async () => {
    const res = await fetch(`${BASE}/docs/alpha/`, {
      headers: { accept: "text/x-component" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-component");
  });

  it("a 404 answer never turns into a 304", async () => {
    const first = await fetch(`${BASE}/no/such/route/`);
    expect(first.status).toBe(404);
    const etag = first.headers.get("etag");
    const again = await fetch(`${BASE}/no/such/route/`, {
      headers: { "if-none-match": etag ?? 'W/"whatever"' },
    });
    expect(again.status).toBe(404);
  });

  it("HEAD carries Content-Length for known-length statics", async () => {
    const res = await fetch(`${BASE}/`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(Number(res.headers.get("content-length"))).toBeGreaterThan(0);
  });

  it("loader notFound() reaches the manifest 404 document, not a bare body", async () => {
    const res = await fetch(`${BASE}/docs/gone/`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("a hung render answers 500 fast — the deadline aborts, nothing lingers", async () => {
    const { createHost } = (await import(
      "vite-plugin-react-server/host"
    )) as {
      createHost: (opts: {
        buildDir: string;
        renderDeadlineMs?: number;
      }) => (req: Request) => Promise<Response>;
    };
    const impatient = createHost({
      buildDir: join(testDir, "dist"),
      renderDeadlineMs: 500,
    });
    const started = Date.now();
    const res = await impatient(new Request(`${BASE}/docs/hang/`));
    expect(res.status).toBe(500);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe.skipIf(!isolatedLeg)("createHost under a subpath base", () => {
  let server: Server | undefined;
  const PORT2 = 4226;
  const BASE2 = `http://localhost:${PORT2}`;

  beforeAll(async () => {
    await setupFixture();
    const proc = spawnSync("node", ["build.mjs"], {
      cwd: testDir,
      encoding: "utf8",
      timeout: 180000,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_OPTIONS: "",
        BASE_PATH: "/app/",
      },
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
      }) => (req: Request) => Promise<Response>;
      toNodeListener: (
        h: (req: Request) => Promise<Response>
      ) => Parameters<typeof createServer>[1];
    };
    const handler = createHost({ buildDir: join(testDir, "dist") });
    server = createServer(toNodeListener(handler));
    await new Promise<void>((r) => server!.listen(PORT2, r));
  }, 240000);

  afterAll(async () => {
    await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
    if (!process.env["KEEP_FIXTURE"])
      await rm(testDir, { recursive: true, force: true });
  });

  it("renders a dynamic match under the base — the inner renderer sees the app-relative url", async () => {
    const res = await fetch(`${BASE2}/app/docs/beta/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("doc:beta");
  });

  it("a path outside the base is not routable", async () => {
    const res = await fetch(`${BASE2}/docs/beta/`);
    expect(res.status).toBe(404);
  });

  it("canonicalization preserves base and query", async () => {
    const res = await fetch(`${BASE2}/app/docs/beta?q=1`, {
      redirect: "manual",
    });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("/app/docs/beta/?q=1");
  });

  it("serves the based prerendered document", async () => {
    const res = await fetch(`${BASE2}/app/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("host-serving-home");
  });
});
