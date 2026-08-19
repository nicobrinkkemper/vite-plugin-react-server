import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regression test for the static-build hang on a SUSPENDED render under stream
 * backpressure.
 *
 * The trigger: an async server component wrapped in a (client) <Suspense>
 * boundary, so the prerender renders the fallback first and the resolved
 * content in a SECOND flush. The HTML worker piped React's output into a plain
 * object that faked the Writable interface with no-op on/once/emit. React's
 * `renderToPipeableStream().pipe()` checks write()'s return value and, when a
 * chunk exceeds the highWaterMark (falsy return), waits for a `drain` event
 * before flushing again. A no-op event emitter never fires `drain`, so the
 * second flush — and the final end() that signals stream completion — never
 * ran. The main thread never saw the HTML stream end, the fileWriter hung, and
 * the build aborted at its 15s timeout.
 *
 * It surfaced only once a render actually backpressured: a big enough resolved
 * tree, reliably reproduced past the first prerender batch (batchSize default
 * 8), so this fixture pre-renders 9 pages — each a suspended boundary with a
 * large resolved tree.
 *
 * The fix makes the worker pipe into a real node:stream Writable, which drains
 * synchronously and emits `drain`, so React resumes and end()/_final fire on
 * every render.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(__dirname, "../fixtures/html-backpressure-build");

// Two batches at the default batchSize of 8 — the second-batch route is where
// the lost-drain hang reliably bit.
const PAGES = [
  "/",
  "/a/",
  "/b/",
  "/c/",
  "/d/",
  "/e/",
  "/f/",
  "/g/",
  "/h/",
];

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
    `import { createRoot } from "react-dom/client";\ncreateRoot(document.getElementById("root")!).render(<div>Client App</div>);\n`
  );

  // A client component that renders <Suspense> around server children — the
  // boundary that splits the prerender into a fallback flush + a content flush.
  await writeFile(
    resolve(dir, "src/components/slot.client.tsx"),
    `"use client";\n` +
      `import { Suspense, type ReactNode } from "react";\n` +
      `export function StreamSlot({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {\n` +
      `  return <Suspense fallback={fallback}>{children}</Suspense>;\n` +
      `}\n`
  );

  // One shared page module, routed by URL via props — matches how a real app
  // pre-renders many routes from a single page.
  await writeFile(
    resolve(dir, "src/page/page.tsx"),
    `import { StreamSlot } from "../components/slot.client.js";\n` +
      `export function props(url: string) {\n` +
      `  const routeKey = url.replace(/^\\/+|\\/+$/g, "");\n` +
      `  return { routeKey };\n` +
      `}\n` +
      `async function Resolved({ k }: { k: string }) {\n` +
      `  await new Promise((r) => setTimeout(r, 20));\n` +
      `  // A large resolved tree so the post-suspense flush exceeds the writable\n` +
      `  // highWaterMark and backpressures — the condition that lost the drain.\n` +
      `  return (\n` +
      `    <div data-resolved={k}>\n` +
      `      {Array.from({ length: 1500 }, (_, i) => (\n` +
      `        <p key={i}>resolved-content-{k}-{i}-with-extra-padding-to-grow-the-chunk</p>\n` +
      `      ))}\n` +
      `    </div>\n` +
      `  );\n` +
      `}\n` +
      `export function Page({ routeKey }: { routeKey: string }) {\n` +
      `  if (!routeKey) return <div>OVERVIEW</div>;\n` +
      `  return (\n` +
      `    <StreamSlot fallback={<div>loading-{routeKey}</div>}>\n` +
      `      <Resolved k={routeKey} />\n` +
      `    </StreamSlot>\n` +
      `  );\n` +
      `}\n`
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
      `    runner: "main",\n` +
      `    moduleBase: "src",\n` +
      `    Page: "src/page/page.tsx",\n` +
      `    props: "src/page/page.tsx",\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    verbose: false,\n` +
      `    projectRoot: process.cwd(),\n` +
      `    build: { pages: ${JSON.stringify(PAGES)}, assetsDir: "assets", client: "client", server: "server", static: "static", outDir: "dist" },\n` +
      `    css: { inlineCss: false },\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("BACKPRESSURE_BUILD_OK");\n`
  );
}

describe("static build of suspended renders under stream backpressure", () => {
  let status: number | null;
  let stdout: string;
  let stderr: string;

  beforeAll(async () => {
    await setupFixture(FIXTURE_ROOT);

    const env = { ...process.env };
    env["NODE_OPTIONS"] = "--conditions react-server";

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
    await rm(FIXTURE_ROOT, { recursive: true, force: true });
  });

  it("the build completes (no lost-drain hang → 15s timeout)", () => {
    expect(stderr).not.toContain("aborted due to timeout");
    expect(status, `backpressure build failed:\n${stderr}`).toBe(0);
    expect(stdout).toContain("BACKPRESSURE_BUILD_OK");
  });

  it("the second-batch route's resolved content was emitted", async () => {
    // /h/ is the 9th page → the second batch at batchSize 8, where the hang bit.
    const html = await readFile(
      resolve(FIXTURE_ROOT, "dist/static/h/index.html"),
      "utf8"
    );
    // SSR splits interpolated text with comment markers, so match the clean
    // attribute and the static run of the resolved row text.
    expect(html).toContain('data-resolved="h"');
    expect(html).toContain("with-extra-padding-to-grow-the-chunk");
  });
});
