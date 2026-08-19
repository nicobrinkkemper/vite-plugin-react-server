import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regression test for the NODE_ENV-flip build panic (dev RSC renderer fed
 * prod elements).
 *
 * The trigger: vite-plugin-react-server is imported while NODE_ENV is UNSET,
 * then tooling sets NODE_ENV=production BEFORE the build runs — exactly what
 * `vite build` wrappers and test harnesses do. With the vendored RSC renderer
 * require()d eagerly at plugin-import time, the renderer locked to its
 * DEVELOPMENT variant (NODE_ENV-at-import) while the page's react/jsx-runtime
 * loaded later as PRODUCTION; the SSG prerender then died inside React with
 * `Cannot set properties of undefined (setting 'validated')`
 * (dev renderer writes element._store, prod elements don't have one).
 *
 * The fix defers the vendored require to FIRST USE, so the renderer samples
 * the settled NODE_ENV. This test runs the exact trigger in a dedicated child
 * process (import plugin → flip NODE_ENV → build+SSG in ONE process) and
 * asserts the build completes and emits the prerendered page.
 *
 * Complements dev-prod-error-visibility.test.ts, which pins NODE_ENV from
 * process start per mode — this test is specifically about the flip.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(__dirname, "../fixtures/node-env-flip-build");

async function setupFixture(dir: string) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(resolve(dir, "src/page"), { recursive: true });
  await mkdir(resolve(dir, "src/components"), { recursive: true });
  await writeFile(
    resolve(dir, "index.html"),
    `<!DOCTYPE html><html><head><title>T</title></head><body><div id="root"></div><script type="module" src="/src/client.tsx"></script></body></html>`
  );
  await writeFile(
    resolve(dir, "src/client.tsx"),
    `import React from "react";\nimport { createRoot } from "react-dom/client";\ncreateRoot(document.getElementById("root")!).render(<div>Client App</div>);\n`
  );
  await writeFile(
    resolve(dir, "src/components/Counter.client.tsx"),
    `"use client";\nimport React from "react";\nconst { useState } = React;\nexport function Counter({ start = 0 }: { start?: number }) {\n  const [count, setCount] = useState(start);\n  return <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>;\n}\n`
  );
  await writeFile(
    resolve(dir, "src/page/page.tsx"),
    `import React from "react";\nimport { Counter } from "../components/Counter.client.js";\nexport function Page(props: any) {\n  return (\n    <div>\n      <h1>Env Flip</h1>\n      <Counter start={props.start ?? 0} />\n    </div>\n  );\n}\n`
  );
  await writeFile(
    resolve(dir, "src/page/props.ts"),
    `export const props = (url: string) => ({ start: 5, url });`
  );
  // The driver reproduces the trigger ordering INSIDE one process:
  //   1. import the plugin while NODE_ENV is unset (vendored renderer must
  //      NOT lock its dev/prod variant here),
  //   2. flip NODE_ENV to production (what build tooling does),
  //   3. run the full build + SSG prerender.
  await writeFile(
    resolve(dir, "build-flip.mjs"),
    `// 1. plugin import with NODE_ENV unset\n` +
      `const { vitePluginReactServer } = await import("vite-plugin-react-server");\n` +
      `if (process.env.NODE_ENV) throw new Error("precondition: NODE_ENV must be unset at import, got " + process.env.NODE_ENV);\n` +
      `// 2. tooling flips NODE_ENV after the plugin is already imported\n` +
      `process.env.NODE_ENV = "production";\n` +
      `// 3. build + SSG prerender in the SAME process\n` +
      `const { createBuilder } = await import("vite");\n` +
      `const builder = await createBuilder({\n` +
      `  configFile: false,\n` +
      `  root: process.cwd(),\n` +
      `  mode: "production",\n` +
      `  esbuild: { jsx: "automatic" },\n` +
      `  plugins: vitePluginReactServer({\n` +
      `    runner: "main",\n` +
      `    moduleBase: "src",\n` +
      `    Page: "src/page/page.tsx",\n` +
      `    props: "src/page/props.ts",\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    verbose: false,\n` +
      `    projectRoot: process.cwd(),\n` +
      `    build: { pages: ["/"], assetsDir: "assets", client: "client", server: "server", static: "static", outDir: "dist" },\n` +
      `    css: { inlineCss: false },\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("FLIP_BUILD_OK");\n`
  );
}

describe("NODE_ENV flip between plugin import and build (SSG prerender)", () => {
  let status: number | null;
  let stdout: string;
  let stderr: string;

  beforeAll(async () => {
    await setupFixture(FIXTURE_ROOT);

    const env = { ...process.env };
    delete env["NODE_ENV"]; // unset at process start — part of the trigger
    env["NODE_OPTIONS"] = "--conditions react-server";

    const proc = spawnSync("node", ["build-flip.mjs"], {
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
    await rm(FIXTURE_ROOT, { recursive: true, force: true });
  });

  it("the build completes (no 'validated' panic from the dev-renderer/prod-element mismatch)", () => {
    expect(stderr).not.toContain("setting 'validated'");
    expect(status, `flip build failed:\n${stderr}`).toBe(0);
    expect(stdout).toContain("FLIP_BUILD_OK");
  });

  it("the SSG prerender emitted the page", async () => {
    const html = await readFile(
      resolve(FIXTURE_ROOT, "dist/static/index.html"),
      "utf8"
    );
    expect(html).toContain("Env Flip");
  });
});
