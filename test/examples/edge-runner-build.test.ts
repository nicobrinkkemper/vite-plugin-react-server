import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, readFile, readdir, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
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

async function setupFixture(
  edgeOption: string,
  opts: { clientRef?: boolean; pages?: string } = {}
) {
  const { clientRef = true, pages = "fr.build.pages" } = opts;
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  if (clientRef) {
    await mkdir(join(testDir, "src/routes/helper"), { recursive: true });
    await writeFile(join(testDir, "src/routes/helper/index.js"), "export const initialCount = 0;\n");
    await writeFile(
      join(testDir, "src/routes/Counter.client.tsx"),
      `"use client";\n` +
        `import * as React from "react";\n` +
        `import { initialCount } from "./helper";\n` +
        `export function Counter() {\n` +
        `  const [n, setN] = React.useState(initialCount);\n` +
        `  return <button onClick={() => setN((v) => v + 1)}>{"n:" + n}</button>;\n` +
        `}\n`
    );
  }
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      (clientRef
        ? `import { Counter } from "./Counter.client.js";\n`
        : ``) +
      `export const Page = () => (\n` +
      `  <main id="app">\n` +
      `    <h1>{"edge-runner-build"}</h1>\n` +
      (clientRef ? `    <Counter />\n` : ``) +
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
      `    build: { pages: ${pages}, outDir: "dist"${edgeOption} },\n` +
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

  it("pins client-reference IDs across browser, SSR, RSC and edge after a dependency-only edit", async () => {
    async function snapshot() {
      const names = await Promise.all(["static", "client", "server"].map(async (env) => {
        const files = await readdir(join(testDir, "dist", env, "routes"));
        const matches = files.filter((file) => /^Counter\.client-[a-z0-9]+\.js$/i.test(file));
        expect(matches, env).toHaveLength(1);
        return matches[0];
      }));
      expect(new Set(names).size).toBe(1);
      const ref = `/routes/${names[0]}`;
      // The emitted RSC reference, edge producer and baked SSR registry all
      // point at the exact browser filename, not merely an equal hash suffix.
      for (const file of ["server/routes/" + names[0], "server-edge/render.js", "server-edge/consumer.js", "static/index.rsc"]) {
        expect(await readFile(join(testDir, "dist", file), "utf8"), file).toContain(ref);
      }
      return names[0];
    }
    const sourcePath = join(testDir, "src/routes/Counter.client.tsx");
    const source = await readFile(sourcePath, "utf8");
    const before = await snapshot();
    await writeFile(join(testDir, "src/routes/helper/index.js"), "export const initialCount = 7;\n");
    const proc = runBuild();
    expect(proc.status, proc.stdout + proc.stderr).toBe(0);
    expect(await readFile(sourcePath, "utf8")).toBe(source);
    expect(await snapshot()).not.toBe(before);
    expect(await readFile(join(testDir, "dist/static/index.html"), "utf8")).toContain("n:7");
  }, 240000);

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

describe.skipIf(!isolatedLeg)(
  "runner 'edge' with ZERO client references (a server-only app is valid)",
  () => {
    beforeAll(async () => {
      await setupFixture("", { clientRef: false });
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

    it("emits the pair, and the consumer imports and renders", async () => {
      expect(existsSync(join(testDir, "dist/server-edge/render.js"))).toBe(
        true
      );
      const consumerPath = join(testDir, "dist/server-edge/consumer.js");
      expect(existsSync(consumerPath)).toBe(true);
      // The freeze already imported the consumer during the build; import it
      // here too and prove the renderer half works with an empty registry.
      const consumer = await import(pathToFileURL(consumerPath).href);
      expect(typeof consumer.prerenderFlightToHtml).toBe("function");
    });

    it("the frozen page is final markup through the pair", async () => {
      const html = await readFile(
        join(testDir, "dist/static/index.html"),
        "utf8"
      );
      expect(html).toContain("edge-runner-build");
      expect(html).toContain('id="vprs-flight"');
    });
  }
);

describe.skipIf(!isolatedLeg)(
  "runner 'edge' with an empty page set still emits its serving artifact",
  () => {
    it("build.pages: [] produces the pair (nothing to freeze is fine; no pair is not)", async () => {
      await setupFixture("", { pages: "[]" });
      const proc = runBuild();
      expect(
        proc.stdout,
        `build failed (status ${proc.status}):\n${proc.stderr}`
      ).toContain("EDGE_RUNNER_BUILD_OK");
      expect(existsSync(join(testDir, "dist/server-edge/render.js"))).toBe(
        true
      );
      expect(existsSync(join(testDir, "dist/server-edge/consumer.js"))).toBe(
        true
      );
    }, 240000);
  }
);

describe.skipIf(!isolatedLeg)("runner 'edge' bake failures are fatal", () => {
  it("a failed bake fails the build (isolated only warns; edge has no artifact without it)", async () => {
    // Induce a deterministic bake failure: the edge outDir collides with a
    // FILE, so the bundle write cannot create its directory.
    await setupFixture(', edge: { outDir: "edge-collide" }');
    await writeFile(join(testDir, "dist-collide-placeholder"), "");
    await mkdir(join(testDir, "dist"), { recursive: true });
    await writeFile(join(testDir, "dist/edge-collide"), "not a directory");
    const proc = runBuild();
    expect(proc.status).not.toBe(0);
    expect(proc.stderr).toMatch(/no serving artifact without it/);
  }, 240000);
});
