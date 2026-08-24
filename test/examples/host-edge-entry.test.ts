import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// The generated portable host entry (host-spec, "The API"): the build emits
// dist/server-edge/host.js — a module that statically imports its pair and
// inlines its manifest, exporting the fetch-shaped handler. It is the form a
// filesystem-less runtime mounts (`export default { fetch: handler }`), and
// the seam of Resolution 4: extra runtime arguments (workerd's env/ctx)
// thread as `platform` into loader context, so binding-backed data has a
// contract instead of a globalThis stash. Statics are the platform's job in
// this form — a prerendered URL that still reaches the handler is answered
// plainly, never re-rendered.
const isolatedLeg = getCondition() !== REACT_CONDITION.server;

const testDir = resolve(__dirname, "../fixtures/host-edge-entry.test");

async function setupFixture() {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/routes/hello/$name"), { recursive: true });
  await writeFile(
    join(testDir, "src/action.ts"),
    `"use server";\n` +
      `export async function greet(n: number): Promise<string> {\n` +
      `  return "entry:" + n;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/Counter.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `import { greet } from "../action.js";\n` +
      `export function Counter() {\n` +
      `  void greet;\n` +
      `  return <button>{"c"}</button>;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main><h1>{"host-edge-entry-home"}</h1><Counter /></main>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/routes/hello/$name/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = ({ name, greeting }: { name: string; greeting: string }) => (\n` +
      `  <article>{"hello:" + name + ":" + greeting}</article>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/routes/hello/$name/props.ts"),
    `type Ctx = { platform?: Array<Record<string, unknown>> };\n` +
      `export const props = (url: string, ctx?: Ctx) => ({\n` +
      `  name: url.split("/").filter(Boolean).pop() ?? "",\n` +
      `  greeting: String(\n` +
      `    (ctx?.platform?.[0] as { GREETING?: string } | undefined)?.GREETING ??\n` +
      `      "none",\n` +
      `  ),\n` +
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
      `const fr = fileRouter("src/routes", { root: process.cwd() });\n` +
      `const builder = await createBuilder({\n` +
      `  configFile: false,\n` +
      `  root: process.cwd(),\n` +
      `  mode: "production",\n` +
      `  esbuild: { jsx: "automatic" },\n` +
      `  plugins: vitePluginReactServer({\n` +
      // runner "isolated" until the edge-runner branch merges — the pair,
      // manifest, and host entry emit identically under webpack transport.
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
      `console.log("HOST_EDGE_ENTRY_BUILD_OK");\n` +
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

describe.skipIf(!isolatedLeg)("generated portable host entry", () => {
  let handler: (
    request: Request,
    ...platform: unknown[]
  ) => Promise<Response>;

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
    ).toContain("HOST_EDGE_ENTRY_BUILD_OK");

    const entryPath = join(testDir, "dist/server-edge/host.js");
    expect(existsSync(entryPath), "dist/server-edge/host.js missing").toBe(
      true
    );
    const mod = (await import(pathToFileURL(entryPath).href)) as {
      default: typeof handler;
    };
    expect(typeof mod.default).toBe("function");
    handler = mod.default;
  }, 240000);

  afterAll(async () => {
    if (!process.env["KEEP_FIXTURE"])
      await rm(testDir, { recursive: true, force: true });
  });

  it("renders a dynamic match with baked imports and inlined manifest", async () => {
    const res = await handler(new Request("http://edge.test/hello/world/"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hello:world");
  });

  it("threads the runtime's extra arguments as platform into loader context", async () => {
    const res = await handler(
      new Request("http://edge.test/hello/bindings/"),
      { GREETING: "from-env" },
      { waitUntil: () => {} }
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("hello:bindings:from-env");
  });

  it("statics are the platform's job — a prerendered URL is answered plainly", async () => {
    const res = await handler(new Request("http://edge.test/"));
    expect(res.status).toBe(404);
    const body = await res.text();
    // A plain naming answer for the misrouted artifact, never a re-render
    // and never the app's 404 document.
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("index.html");
  });

  it("routes action POSTs through the baked gate", async () => {
    const { encodeReply } = await import("react-server-dom-esm/client.edge");
    const body = await encodeReply([3]);
    const res = await handler(
      new Request("http://edge.test/", {
        method: "POST",
        headers: { "x-rsc-action": "src/action.ts#greet" },
        body: body as string,
      })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"entry:3"');
  });

  it("a miss is the 404 fallback document", async () => {
    const res = await handler(new Request("http://edge.test/no/such/route/"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
