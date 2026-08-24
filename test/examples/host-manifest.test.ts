import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// The host manifest (docs/internals/host-spec.md, Resolution 1): the build
// emits a versioned host-manifest.json PER emitted host target, carrying
// everything the build already holds — route patterns with dynamic flags,
// the prerender list, the asset inventory, per-pattern CSS, bootstrap
// modules, transport, and (for the edge target) the pair's bundle paths.
// createHost derives serving from this contract instead of directory
// spelunking; nothing in it is computed at runtime.
const isolatedLeg = getCondition() !== REACT_CONDITION.server;

const testDir = resolve(__dirname, "../fixtures/host-manifest.test");

async function setupFixture() {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/routes/docs/$slug"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/Counter.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `import "./counter.css";\n` +
      `export function Counter() {\n` +
      `  const [n, setN] = React.useState(0);\n` +
      `  return <button onClick={() => setN((v) => v + 1)}>{"n:" + n}</button>;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/counter.css"),
    `button { padding: 4px; }\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main>\n` +
      `    <h1>{"host-manifest-home"}</h1>\n` +
      `    <Counter />\n` +
      `  </main>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/routes/docs/$slug/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = ({ slug }: { slug: string }) => (\n` +
      `  <article>{"doc:" + slug}</article>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/routes/docs/$slug/props.ts"),
    `export const props = (url: string) => ({\n` +
      `  slug: url.split("/").filter(Boolean).pop() ?? "",\n` +
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
      `const fr = fileRouter("src/routes", {\n` +
      `  root: process.cwd(),\n` +
      `  staticPaths: { "/docs/$slug": () => [{ slug: "alpha" }] },\n` +
      `});\n` +
      `const ASYNC_PAGE = process.env.ASYNC_PAGE === "1";\n` +
      `const MBU = process.env.MODULE_BASE_URL || "/";\n` +
      `const VITE_BASE = process.env.VITE_BASE || undefined;\n` +
      `const builder = await createBuilder({\n` +
      `  configFile: false,\n` +
      `  root: process.cwd(),\n` +
      `  mode: "production",\n` +
      `  base: VITE_BASE,\n` +
      `  esbuild: { jsx: "automatic" },\n` +
      `  plugins: vitePluginReactServer({\n` +
      `    runner: "isolated",\n` +
      // The webpack bake cannot resolve async Page yet (its own gap, tracked
      // separately) — the async variant runs on the esm transport, where the
      // emitter's await is what this suite pins.
      `    transport: ASYNC_PAGE ? "esm" : "webpack",\n` +
      `    moduleBase: "src",\n` +
      `    Page: ASYNC_PAGE ? async (url) => fr.Page(url) : fr.Page,\n` +
      `    props: fr.props,\n` +
      `    routePatterns: fr.routePatterns,\n` +
      `    build: { pages: fr.build.pages, outDir: "dist" },\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: MBU,\n` +
      `    projectRoot: process.cwd(),\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("HOST_MANIFEST_BUILD_OK");\n` +
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

type HostManifest = {
  version: number;
  target: string;
  base: string;
  routes: Array<{ pattern: string; dynamic: boolean }>;
  prerendered: string[];
  assets: string[];
  cssByPattern: Record<string, string[]>;
  bootstrapModules: string[];
  transport: string;
  moduleBaseURL: string;
  htmlOutputPath: string;
  rscOutputPath: string;
  stripHtmlSuffix: boolean;
  renderBundle?: string;
  consumerBundle?: string;
};

describe.skipIf(!isolatedLeg)("host-manifest emission (per host target)", () => {
  let node: HostManifest;
  let edge: HostManifest;

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
    ).toContain("HOST_MANIFEST_BUILD_OK");

    const nodePath = join(testDir, "dist/server/host-manifest.json");
    const edgePath = join(testDir, "dist/server-edge/host-manifest.json");
    expect(existsSync(nodePath), "dist/server/host-manifest.json missing").toBe(
      true
    );
    expect(
      existsSync(edgePath),
      "dist/server-edge/host-manifest.json missing"
    ).toBe(true);
    node = JSON.parse(await readFile(nodePath, "utf8"));
    edge = JSON.parse(await readFile(edgePath, "utf8"));
  }, 240000);

  afterAll(async () => {
    if (!process.env["KEEP_FIXTURE"])
      await rm(testDir, { recursive: true, force: true });
  });

  it("is versioned and self-describing per target", () => {
    for (const m of [node, edge]) {
      expect(m.version).toBe(1);
      expect(m.base).toBe("/");
      expect(m.transport).toBe("webpack");
    }
    expect(node.target).toBe("node");
    expect(edge.target).toBe("edge");
  });

  it("carries the route table with dynamic flags", () => {
    for (const m of [node, edge]) {
      const patterns = Object.fromEntries(
        m.routes.map((r) => [r.pattern, r.dynamic])
      );
      expect(patterns["/"]).toBe(false);
      expect(patterns["/docs/$slug"]).toBe(true);
    }
  });

  it("lists the prerendered urls and the asset inventory disjointly", () => {
    for (const m of [node, edge]) {
      expect(m.prerendered).toContain("/");
      expect(m.prerendered).toContain("/docs/alpha");
      expect(m.assets.length).toBeGreaterThan(0);
      // Assets are the non-document inventory: no prerendered html/rsc.
      expect(m.assets.some((a) => a.endsWith("index.html"))).toBe(false);
      expect(m.assets.some((a) => a.endsWith(".js"))).toBe(true);
    }
  });

  it("records per-pattern css and the bootstrap modules", () => {
    for (const m of [node, edge]) {
      expect(typeof m.cssByPattern).toBe("object");
      const rootCss = m.cssByPattern["/"] ?? [];
      expect(rootCss.some((f) => f.endsWith(".css"))).toBe(true);
      expect(m.bootstrapModules.length).toBeGreaterThan(0);
    }
  });

  it("records the output-path contract the host normalizes with", () => {
    for (const m of [node, edge]) {
      expect(m.htmlOutputPath).toBe("index.html");
      expect(m.rscOutputPath).toBe("index.rsc");
      expect(typeof m.stripHtmlSuffix).toBe("boolean");
    }
  });

  it("the edge manifest names its pair; the node manifest does not", () => {
    expect(edge.renderBundle).toBe("./render.js");
    expect(edge.consumerBundle).toBe("./consumer.js");
    expect(node.renderBundle).toBeUndefined();
  });
});

describe.skipIf(!isolatedLeg)(
  "host-manifest: origin moduleBaseURL and async Page resolvers",
  () => {
    let edge: HostManifest;

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
          ASYNC_PAGE: "1",
          VITE_BASE: "/shop/",
          MODULE_BASE_URL: "https://cdn.example.com/assets/",
        },
      });
      expect(
        proc.stdout,
        `build failed (status ${proc.status}):\n${proc.stderr}`
      ).toContain("HOST_MANIFEST_BUILD_OK");
      edge = JSON.parse(
        await readFile(
          join(testDir, "dist/server/host-manifest.json"),
          "utf8"
        )
      );
    }, 240000);

    afterAll(async () => {
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    it("base is Vite's own base, independent of moduleBaseURL", () => {
      // Deliberately DIFFERING values: the app serves under /shop/ while
      // modules load from a CDN origin — deriving one from the other emits
      // the wrong route base.
      expect(edge.base).toBe("/shop/");
      expect(edge.moduleBaseURL).toBe("https://cdn.example.com/assets/");
      expect(
        edge.bootstrapModules.every((m) =>
          m.startsWith("https://cdn.example.com/assets/")
        )
      ).toBe(true);
    });

    it("an async Page resolver still yields the route's css", () => {
      const rootCss = edge.cssByPattern["/"] ?? [];
      expect(rootCss.some((f) => f.endsWith(".css"))).toBe(true);
    });
  }
);
