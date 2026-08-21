import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, rm, readFile, symlink } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regression: the ISOLATED-runner static build of a suspended render under
 * DEV-VARIANT transport builds (NODE_ENV != production — the pipeline a
 * `vite build` in development mode or a test-ambient build runs).
 *
 * The stall lived in the data-port backpressure protocol: the dev flight
 * payload is large enough to fill the consumer's 16KB buffer, the consumer
 * sent DRAIN (pause), and then (a) the worker-side writable dropped the
 * paused chunk and never completed its write callback, and (b) the
 * consumer's "resume" was a DRAIN sent on the DATA port, which nothing
 * listens to. The build hung forever, and the HTML that had already flushed
 * froze an UNRESOLVED Suspense boundary — the #419 artifact, on disk.
 *
 * The trigger needs a boundary that actually suspends (a client-reference
 * child — async module import) plus enough payload to engage backpressure;
 * the prod-variant equivalent is covered by the browser-level
 * static-suspense-hydration proof.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(__dirname, "../fixtures/isolated-suspense-dev-build");

async function setupFixture(dir: string) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(resolve(dir, "src/routes"), { recursive: true });

  await writeFile(
    resolve(dir, "index.html"),
    `<!DOCTYPE html><html><head></head><body><div id="root"></div><script type="module" src="/src/client.tsx"></script></body></html>`
  );
  await writeFile(
    resolve(dir, "src/client.tsx"),
    `import { startClient } from "vite-plugin-react-server/router/client";\nstartClient({ moduleBaseURL: "/" });\n`
  );
  await writeFile(
    resolve(dir, "src/routes/Counter.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `export function Counter() {\n` +
      `  const [n, setN] = React.useState(0);\n` +
      `  return <button onClick={() => setN((v) => v + 1)}>{"count:" + n}</button>;\n` +
      `}\n`
  );
  await writeFile(
    resolve(dir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { Suspense } from "react";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `async function Delayed() {\n` +
      `  await new Promise((r) => setTimeout(r, 30));\n` +
      `  return (\n` +
      `    <section data-resolved="yes">\n` +
      `      <Counter />\n` +
      `      {Array.from({ length: 300 }, (_, i) => (\n` +
      `        <p key={i}>resolved-row-{i}-padding-to-engage-backpressure</p>\n` +
      `      ))}\n` +
      `    </section>\n` +
      `  );\n` +
      `}\n` +
      `export const Page = () => (\n` +
      `  <main>\n` +
      `    <h1>{"isolated-dev-suspense"}</h1>\n` +
      `    <Suspense fallback={<div>{"loading"}</div>}>\n` +
      `      <Delayed />\n` +
      `    </Suspense>\n` +
      `  </main>\n` +
      `);\n`
  );
  await writeFile(
    resolve(dir, "build.mjs"),
    `import { createBuilder } from "vite";\n` +
      `import { vitePluginReactServer } from "vite-plugin-react-server";\n` +
      `const builder = await createBuilder({\n` +
      `  configFile: false,\n` +
      `  root: process.cwd(),\n` +
      `  mode: "production",\n` +
      `  esbuild: { jsx: "automatic" },\n` +
      `  plugins: vitePluginReactServer({\n` +
      `    runner: "isolated",\n` +
      `    moduleBase: "src",\n` +
      `    Page: "src/routes/page.tsx",\n` +
      `    build: { pages: ["/"], outDir: "dist" },\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    projectRoot: process.cwd(),\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("ISOLATED_DEV_SUSPENSE_BUILD_OK");\n` +
      `process.exit(0);\n`
  );
  try {
    await symlink(
      resolve(__dirname, "../../node_modules"),
      join(dir, "node_modules"),
      "dir"
    );
  } catch {
    /* already linked */
  }
}

describe("isolated-runner dev-variant build of a suspended render", () => {
  let status: number | null;
  let stdout: string;
  let stderr: string;

  beforeAll(async () => {
    await setupFixture(FIXTURE_ROOT);

    // The point of the test: NODE_ENV=test picks the DEV variants of the
    // vendored transport and React at require time. The runner is isolated
    // (no process flag) in BOTH suite legs — that is the pipeline that hung.
    const env = { ...process.env, NODE_ENV: "test" };
    env["NODE_OPTIONS"] = "";
    const proc = spawnSync("node", ["build.mjs"], {
      cwd: FIXTURE_ROOT,
      encoding: "utf8",
      timeout: 120000,
      env,
    });
    status = proc.status;
    stdout = proc.stdout ?? "";
    stderr = proc.stderr ?? "";
  }, 180000);

  afterAll(async () => {
    if (!process.env["KEEP_FIXTURE"])
      await rm(FIXTURE_ROOT, { recursive: true, force: true });
  });

  it("the build completes (no lost-write stall in the port protocol)", () => {
    expect(status, `build failed or hung:\n${stderr}`).toBe(0);
    expect(stdout).toContain("ISOLATED_DEV_SUSPENSE_BUILD_OK");
  });

  it("the prerendered HTML carries the RESOLVED boundary, not a frozen fallback", async () => {
    const html = await readFile(
      resolve(FIXTURE_ROOT, "dist/static/index.html"),
      "utf8"
    );
    expect(html).toContain('data-resolved="yes"');
    expect(html).toContain("padding-to-engage-backpressure");
  });

  it("the flight artifact is complete (the .rsc write used to hang forever)", async () => {
    const rsc = await readFile(
      resolve(FIXTURE_ROOT, "dist/static/index.rsc"),
      "utf8"
    );
    expect(rsc).toContain("data-resolved");
    expect(rsc).toContain("padding-to-engage-backpressure");
  });
});
