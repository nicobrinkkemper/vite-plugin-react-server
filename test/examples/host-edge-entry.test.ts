import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, readdir, rm, writeFile, symlink } from "node:fs/promises";
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

// The portability claim ("mountable in a filesystem-less runtime") is proven
// by actually mounting host.js in workerd, not by importing it in Node.
// miniflare is deliberately NOT a dependency — the dedicated CI job installs
// it (`npm i --no-save miniflare@4`) and sets VPRS_REQUIRE_MINIFLARE=1 so
// its absence there fails loudly instead of green-skipping.
const MINIFLARE = "miniflare";
let Miniflare:
  | (new (options: unknown) => {
      dispatchFetch: (url: string, init?: RequestInit) => Promise<Response>;
      dispose: () => Promise<void>;
    })
  | undefined;
try {
  ({ Miniflare } = await import(/* @vite-ignore */ MINIFLARE));
} catch (error) {
  if (process.env.VPRS_REQUIRE_MINIFLARE === "1") throw error;
}

async function collectModules(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (entry.isFile() && /\.m?js$/.test(entry.name)) {
      out.push(join(entry.parentPath, entry.name));
    }
  }
  return out.sort();
}

const testDir = resolve(__dirname, "../fixtures/host-edge-entry.test");

async function setupFixture() {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/routes/hello/$name"), { recursive: true });
  await writeFile(
    join(testDir, "src/action.ts"),
    `"use server";\n` +
      `type Ctx = { platform?: Array<Record<string, unknown>> };\n` +
      `export async function greet(n: number, ctx?: Ctx): Promise<string> {\n` +
      `  const bound = (ctx?.platform?.[0] as { GREETING?: string } | undefined)?.GREETING;\n` +
      `  return "entry:" + n + ":" + String(bound ?? "none");\n` +
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
      default: { fetch: typeof handler };
      handler: typeof handler;
    };
    // The default is the module-worker mount; the bare function is named.
    expect(typeof mod.default).toBe("object");
    expect(typeof mod.default.fetch).toBe("function");
    expect(typeof mod.handler).toBe("function");
    handler = mod.default.fetch;
  }, 240000);

  afterAll(async () => {
    if (!process.env["KEEP_FIXTURE"])
      await rm(testDir, { recursive: true, force: true });
  });

  it.skipIf(!Miniflare)(
    "mounts in workerd: document render and platform-bound action in-isolate",
    async () => {
      const edgeDir = join(testDir, "dist/server-edge");
      const hostPath = join(edgeDir, "host.js");
      const chunkPaths = (await collectModules(edgeDir)).filter(
        (p) => p !== hostPath
      );
      // No nodejs_compat: the entry must run without node shims, like the
      // pair it imports. Bindings become workerd's env — platform[0].
      const mf = new Miniflare!({
        compatibilityDate: "2026-07-01",
        modulesRoot: edgeDir,
        modules: [
          { type: "ESModule", path: hostPath },
          ...chunkPaths.map((path) => ({ type: "ESModule", path })),
        ],
        bindings: { GREETING: "workerd" },
      });
      try {
        const doc = await mf.dispatchFetch("http://edge.test/hello/bindings/");
        expect(doc.status).toBe(200);
        expect(await doc.text()).toContain("hello:bindings:workerd");

        const { encodeReply } = await import(
          "react-server-dom-esm/client.edge"
        );
        const act = await mf.dispatchFetch("http://edge.test/", {
          method: "POST",
          headers: { "x-rsc-action": "src/action.ts#greet" },
          body: (await encodeReply([7])) as string,
        });
        expect(act.status).toBe(200);
        expect(await act.text()).toContain('"entry:7:workerd"');
      } finally {
        await mf.dispose();
      }
    },
    120000
  );

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

  it("routes action POSTs through the baked gate — and platform reaches the action", async () => {
    const { encodeReply } = await import("react-server-dom-esm/client.edge");
    const body = await encodeReply([3]);
    const res = await handler(
      new Request("http://edge.test/", {
        method: "POST",
        headers: { "x-rsc-action": "src/action.ts#greet" },
        body: body as string,
      }),
      { GREETING: "bound" },
      { waitUntil: () => {} }
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"entry:3:bound"');

    // Without runtime arguments the ctx is present but empty.
    const bare = await handler(
      new Request("http://edge.test/", {
        method: "POST",
        headers: { "x-rsc-action": "src/action.ts#greet" },
        body: (await encodeReply([4])) as string,
      })
    );
    expect(await bare.text()).toContain('"entry:4:none"');
  });

  it("a miss is the 404 fallback document", async () => {
    const res = await handler(new Request("http://edge.test/no/such/route/"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
