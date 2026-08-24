import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// The edge runner's build contract (runner-spec.md, PR C of the runner
// abstraction): under `runner: "edge"` the baked pair IS the paradigm's
// serving artifact — the build emits it unconditionally, and the static
// pages render THROUGH it (the freeze path), so the static surface carries
// the same flavor the per-request path serves. The runner requires the
// process condition absent, so this suite self-skips on the main leg — the
// invariant suite pins that rejection.
const isolatedLeg = getCondition() !== REACT_CONDITION.server;

const testDir = resolve(__dirname, "../fixtures/edge-runner-build.test");

async function setupFixture(edgeOption: string) {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  // The page carries a real client reference: a webpack bake with ZERO
  // client references bundles the browser entry into the consumer and
  // executes it at import ("document is not defined") — a pre-existing
  // freeze bug on every runner, tracked separately; this suite pins the
  // RUNNER contract, not that bug.
  await writeFile(
    join(testDir, "src/routes/Counter.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `export function Counter() {\n` +
      `  const [n, setN] = React.useState(0);\n` +
      `  return <button onClick={() => setN((v) => v + 1)}>{"n:" + n}</button>;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main id="app">\n` +
      `    <h1>{"edge-runner-build"}</h1>\n` +
      `    <Counter />\n` +
      `  </main>\n` +
      `);\n`
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
      `    runner: "edge",\n` +
      `    transport: "webpack",\n` +
      `    moduleBase: "src",\n` +
      `    Page: fr.Page,\n` +
      `    props: fr.props,\n` +
      `    routePatterns: fr.routePatterns,\n` +
      `    build: { pages: fr.build.pages, outDir: "dist"${edgeOption} },\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    projectRoot: process.cwd(),\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("EDGE_RUNNER_BUILD_OK");\n` +
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

function runBuild() {
  return spawnSync("node", ["build.mjs"], {
    cwd: testDir,
    encoding: "utf8",
    timeout: 180000,
    env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
  });
}

describe.skipIf(!isolatedLeg)("runner 'edge' build contract", () => {
  beforeAll(async () => {
    await setupFixture("");
    const proc = runBuild();
    expect(
      proc.stdout,
      `build failed (status ${proc.status}):\n${proc.stderr}`
    ).toContain("EDGE_RUNNER_BUILD_OK");
  }, 240000);

  afterAll(async () => {
    if (!process.env["KEEP_FIXTURE"])
      await rm(testDir, { recursive: true, force: true });
  });

  it("emits the baked pair as the serving artifact", () => {
    expect(existsSync(join(testDir, "dist/server-edge/render.js"))).toBe(true);
    expect(existsSync(join(testDir, "dist/server-edge/consumer.js"))).toBe(
      true
    );
  });

  it("renders the static pages through the pair — final markup, pair flavor", async () => {
    const html = await readFile(
      join(testDir, "dist/static/index.html"),
      "utf8"
    );
    expect(html).toContain("edge-runner-build");
    // The freeze's signature: the document self-carries its flight as the
    // blob (frozen through the pair), never swap templates.
    expect(html).toContain('id="vprs-flight"');
    expect(html).not.toContain("$RC");
  });
});

describe.skipIf(!isolatedLeg)(
  "runner 'edge' rejects a disabled pair",
  () => {
    it("build.edge: false contradicts the paradigm and errors at config time", async () => {
      await setupFixture(", edge: false");
      const proc = runBuild();
      expect(proc.status).not.toBe(0);
      // Deliberately NOT satisfiable by the pre-implementation
      // not-implemented error: the paradigm-contradiction message is its own
      // contract.
      expect(proc.stderr).toMatch(/IS the serving artifact/);
    }, 240000);
  }
);
