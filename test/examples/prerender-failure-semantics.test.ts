import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// The prerender port's FAILURE semantics, pinned by building instead of by
// reading (both seams via test-both: the client-condition handler on the
// main-runner leg, the html-worker INIT prerender on the isolated leg):
//
//  1. a page that throws at the SHELL during SSG fails the build loudly with
//     the error named — never a hang, never a half artifact on disk;
//  2. a render that never completes trips htmlTimeout into a clean failure;
//  3. an EXPLICIT consumer progressiveChunkSize is honored — the static
//     1<<30 default applies only when unset, so a small explicit value
//     outlines the boundary back into the streamed shape on purpose.
const testDir = resolve(
  __dirname,
  "../fixtures/prerender-failure-semantics.test"
);

const PAGE = join(testDir, "src/routes/page.tsx");

const GOOD_SUSPENDED_PAGE =
  `import * as React from "react";\n` +
  `import { Suspense } from "react";\n` +
  `async function Delayed() {\n` +
  `  await new Promise((r) => setTimeout(r, 30));\n` +
  `  return (\n` +
  `    <section data-resolved="yes">\n` +
  `      {Array.from({ length: 300 }, (_, i) => (\n` +
  `        <p key={i}>resolved-row-{i}-padding-to-split-the-flush</p>\n` +
  `      ))}\n` +
  `    </section>\n` +
  `  );\n` +
  `}\n` +
  `export const Page = () => (\n` +
  `  <main>\n` +
  `    <h1>{"prerender-semantics"}</h1>\n` +
  `    <Suspense fallback={<div id="fallback">{"loading"}</div>}>\n` +
  `      <Delayed />\n` +
  `    </Suspense>\n` +
  `  </main>\n` +
  `);\n`;

const SHELL_THROW_PAGE =
  `import * as React from "react";\n` +
  `export const Page = () => {\n` +
  `  throw new Error("shell-boom");\n` +
  `};\n`;

// The hang lives in the HTML PRERENDER, not the flight: a client component
// that suspends forever during SSR. The flight completes (the component is a
// reference row), so this isolates the seam htmlTimeout guards — a server
// component that never resolves would hang the RSC render first, a separate
// (pre-existing) timeout surface.
const NEVER_RESOLVES_PAGE =
  `import * as React from "react";\n` +
  `import { Suspense } from "react";\n` +
  `import { Stuck } from "./Stuck.client.js";\n` +
  `export const Page = () => (\n` +
  `  <main>\n` +
  `    <Suspense fallback={<div>{"loading"}</div>}>\n` +
  `      <Stuck />\n` +
  `    </Suspense>\n` +
  `  </main>\n` +
  `);\n`;

async function setupFixture() {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/Stuck.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `const never = new Promise<never>(() => {});\n` +
      `export function Stuck() {\n` +
      `  React.use(never);\n` +
      `  return null;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "index.html"),
    `<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>`
  );
  await writeFile(
    join(testDir, "build.mjs"),
    `import { readFileSync } from "node:fs";\n` +
      `import { createBuilder } from "vite";\n` +
      `import { vitePluginReactServer } from "vite-plugin-react-server";\n` +
      `import { fileRouter } from "vite-plugin-react-server/router";\n` +
      `const extra = JSON.parse(readFileSync("case.json", "utf8"));\n` +
      `const fr = fileRouter("src/routes", { root: process.cwd() });\n` +
      `const builder = await createBuilder({\n` +
      `  configFile: false,\n` +
      `  root: process.cwd(),\n` +
      `  mode: "production",\n` +
      `  esbuild: { jsx: "automatic" },\n` +
      `  plugins: vitePluginReactServer({\n` +
      `    runner: process.env.VPRS_TEST_RUNNER,\n` +
      `    moduleBase: "src",\n` +
      `    Page: fr.Page,\n` +
      `    props: fr.props,\n` +
      `    routePatterns: fr.routePatterns,\n` +
      `    build: { pages: fr.build.pages, outDir: "dist" },\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    projectRoot: process.cwd(),\n` +
      `    ...extra,\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("PRERENDER_BUILD_OK");\n` +
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

function build(extraOptions: Record<string, unknown>) {
  const mainLeg = getCondition() === REACT_CONDITION.server;
  const env = {
    ...process.env,
    NODE_ENV: "production",
    VPRS_TEST_RUNNER: mainLeg ? "main" : "isolated",
  };
  env["NODE_OPTIONS"] = mainLeg ? "--conditions react-server" : "";
  return spawnSync("node", ["build.mjs"], {
    cwd: testDir,
    encoding: "utf8",
    // Generous for a build, tight enough that a hung prerender FAILS the
    // test instead of eating the suite's budget: pin 1's "never a hang".
    timeout: 150000,
    env,
  });
}

const writeCase = async (page: string, extra: Record<string, unknown>) => {
  await rm(join(testDir, "dist"), { recursive: true, force: true });
  await writeFile(PAGE, page);
  await writeFile(join(testDir, "case.json"), JSON.stringify(extra));
};

describe("prerender failure semantics (SSG builds, spawned)", () => {
  beforeAll(setupFixture, 60000);
  afterAll(async () => {
    if (!process.env["KEEP_FIXTURE"])
      await rm(testDir, { recursive: true, force: true });
  });

  it("a SHELL throw fails the build loudly and leaves no artifact", async () => {
    await writeCase(SHELL_THROW_PAGE, {});
    const proc = build({});
    expect(proc.status, `expected a failing build:\n${proc.stdout}`).not.toBe(0);
    const output = proc.stdout + proc.stderr;
    expect(output).toContain("shell-boom");
    // A failed build's dist may retain Vite's RAW entry template (the prune
    // only runs on success) — the pin is that no RENDERED or degraded
    // document was written for the failed route.
    const artifact = join(testDir, "dist/static/index.html");
    if (existsSync(artifact)) {
      const { readFileSync } = await import("node:fs");
      const html = readFileSync(artifact, "utf8");
      expect(html).not.toContain("prerender-semantics");
      expect(html).not.toContain("shell-boom");
    }
  }, 180000);

  it("a render that never completes trips htmlTimeout into a clean failure", async () => {
    await writeCase(NEVER_RESOLVES_PAGE, { htmlTimeout: 5000 });
    const proc = build({});
    expect(proc.error, "the build HUNG past the spawn timeout").toBeUndefined();
    expect(proc.status, `expected a failing build:\n${proc.stdout}`).not.toBe(0);
    // The two seams name it differently: the prerender abort says
    // htmlTimeout; the main-runner leg's stream watchdog reports the abort.
    // Both are the same contract — a failure that NAMES a timeout.
    const output = proc.stdout + proc.stderr;
    expect(output).toMatch(/htmlTimeout|aborted due to timeout/i);
  }, 180000);

  it("an explicit progressiveChunkSize is honored over the static default", async () => {
    await writeCase(GOOD_SUSPENDED_PAGE, {
      clientPipeableStreamOptions: { progressiveChunkSize: 256 },
    });
    const proc = build({});
    expect(
      proc.stdout,
      `build failed (status ${proc.status}):\n${proc.stderr}`
    ).toContain("PRERENDER_BUILD_OK");
    const { readFileSync } = await import("node:fs");
    const html = readFileSync(join(testDir, "dist/static/index.html"), "utf8");
    // 256 bytes cannot hold the 300-row boundary: React outlines it into the
    // streamed shape — which is exactly what an EXPLICIT chunk size asks for.
    expect(html).toContain("<template");
    // And the unset default (1<<30) is what the artifact-contract suites pin
    // as the opposite: no templates at all (static-suspense-hydration).
  }, 180000);
});
