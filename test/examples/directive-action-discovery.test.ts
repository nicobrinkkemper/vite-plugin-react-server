import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

/**
 * The standard client-imports-an-action topology, end to end: an action
 * module marked by a top-of-file `"use server"` DIRECTIVE (no `.server.`
 * filename), imported ONLY by a client component. Before directive-driven
 * discovery, the browser shipped a correct proxy pointing at a module the
 * server build never emitted — the sealed gate had nothing to resolve and
 * every call died at runtime with "Unknown server reference", with no
 * build-time signal (the original vr4q). Discovery now matches the gate's
 * 3.9.1 directive rule, so the module is BUILT, gated, and executes.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const testDir = resolve(__dirname, "../fixtures/directive-action-discovery");

async function setupFixture() {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  // The action: directive-marked, conventionally named — NOT *.server.*.
  await writeFile(
    join(testDir, "src/routes/edgePing.ts"),
    `"use server";\nexport async function ping(n: number) {\n  return n + 1;\n}\n`
  );
  // The ONLY importer is a client component.
  await writeFile(
    join(testDir, "src/routes/PingButton.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `import { ping } from "./edgePing.js";\n` +
      `export function PingButton() {\n` +
      `  const [out, setOut] = React.useState("");\n` +
      `  return <button id="ping" onClick={async () => setOut(String(await ping(41)))}>{"ping:" + out}</button>;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { PingButton } from "./PingButton.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main>\n` +
      `    <h1>directive-action</h1>\n` +
      `    <PingButton />\n` +
      `  </main>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/client.tsx"),
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
      `const builder = await createBuilder({\n` +
      `  configFile: false,\n` +
      `  root: process.cwd(),\n` +
      `  mode: "production",\n` +
      `  esbuild: { jsx: "automatic" },\n` +
      `  plugins: vitePluginReactServer({\n` +
      `    runner: process.env.VPRS_PROBE_RUNNER || "isolated",\n` +
      `    moduleBase: "src",\n` +
      `    Page: "src/routes/page.tsx",\n` +
      `    build: { pages: ["/"], outDir: "dist" },\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    projectRoot: process.cwd(),\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("DIRECTIVE_ACTION_BUILD_OK");\n` +
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

describe("directive-marked action imported only by a client component", () => {
  beforeAll(async () => {
    await setupFixture();
    const mainLeg = !!process.env["NODE_OPTIONS"]?.includes("react-server");
    const env = { ...process.env, NODE_ENV: "production" };
    env["NODE_OPTIONS"] = mainLeg ? "--conditions react-server" : "";
    env["VPRS_PROBE_RUNNER"] = mainLeg ? "main" : "isolated";
    const proc = spawnSync("node", ["build.mjs"], {
      cwd: testDir,
      encoding: "utf8",
      timeout: 120000,
      env,
    });
    expect(
      proc.stdout,
      `build failed (status ${proc.status}):\n${proc.stderr}`
    ).toContain("DIRECTIVE_ACTION_BUILD_OK");
  }, 180000);

  afterAll(async () => {
    if (!process.env["KEEP_FIXTURE"])
      await rm(testDir, { recursive: true, force: true });
  });

  it("the server build emits and manifests the module", async () => {
    const manifest = JSON.parse(
      await readFile(join(testDir, "dist/server/.vite/manifest.json"), "utf8")
    ) as Record<string, { file: string }>;
    expect(manifest["src/routes/edgePing.ts"]?.file).toBeTruthy();
  });

  it("the browser bundle carries the call-server PROXY, not the SSR stub", () => {
    const routesDir = join(testDir, "dist/static/routes");
    const pingBundle = readdirSync(routesDir).find((f) =>
      f.startsWith("PingButton.client-")
    );
    expect(pingBundle).toBeTruthy();
    const code = readFileSync(join(routesDir, pingBundle!), "utf8");
    expect(code).toContain("edgePing.ts#ping");
    expect(code).not.toContain("cannot run during SSR");
  });

  it("the SSR-root copy stays the render guard (by design)", async () => {
    const ssrCopy = await readFile(
      join(testDir, "dist/client/routes/edgePing.js"),
      "utf8"
    );
    expect(ssrCopy).toContain("cannot run during SSR");
  });

  it("the baked gate resolves and executes it — the original vr4q click", async () => {
    const { handleRouteAction } = (await import(
      pathToFileURL(join(testDir, "dist/server-edge/render.js")).href
    )) as { handleRouteAction: (r: Request, o?: object) => Promise<Response> };
    const { encodeReply, createFromReadableStream } = await import(
      "react-server-dom-esm/client.edge"
    );
    const body = await encodeReply([41]);
    const res = await handleRouteAction(
      new Request("http://edge.test/", {
        method: "POST",
        headers: { "x-rsc-action": "src/routes/edgePing.ts#ping" },
        body: body as string,
      }),
      { projectRoot: testDir }
    );
    expect(res.status).toBe(200);
    const decoded = (await createFromReadableStream(
      res.body as ReadableStream,
      { moduleBaseURL: "/" }
    )) as { returnValue: number };
    expect(decoded.returnValue).toBe(42);
  });
});
