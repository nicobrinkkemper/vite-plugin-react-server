import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  mkdir,
  rm,
  writeFile,
  readFile,
  readdir,
  symlink,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// Two css paths that must not be conflated:
//
// 1. AUTOMATIC inclusion — a stylesheet a route's module graph imports. The
//    SSG pass seeds its css walk with the page AND its props loader
//    (processCssFilesForPages), so a stylesheet only props.ts imports reaches
//    the frozen document. The host manifest's cssByPattern is what the edge
//    and node hosts serve the same route from, so it must agree: membership
//    for that pattern, and the frozen document carrying the <link> — both,
//    since membership alone does not prove the link is emitted.
// 2. MANUAL rendering — an explicit `?url` import the page renders as a
//    <link> itself. That is an asset url in the page's own markup, not a css
//    the build attaches to the route, so it is asserted on the document
//    only and never on cssByPattern.
//
// Webpack transport, runner isolated: the bake runner edge serves from, and
// the node target beside it.
const isolatedLeg = getCondition() !== REACT_CONDITION.server;

const testDir = resolve(__dirname, "../fixtures/host-manifest-props-css.test");

async function setupFixture() {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/routes/about"), { recursive: true });
  await mkdir(join(testDir, "src/routes/manual"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = () => <main>{"props-css-home"}</main>;\n`,
  );
  // /about: the page imports no css; only its props loader does.
  await writeFile(
    join(testDir, "src/routes/about/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = ({ title }: { title: string }) => (\n` +
      `  <article className="about">{title}</article>\n` +
      `);\n`,
  );
  await writeFile(
    join(testDir, "src/routes/about/props.ts"),
    `import "./about.css";\n` +
      `export const props = (_url: string) => ({ title: "props-css-about" });\n`,
  );
  await writeFile(
    join(testDir, "src/routes/about/about.css"),
    `.about { color: rebeccapurple; }\n`,
  );
  // /styled: the page itself imports css — the ordinary automatic case.
  await mkdir(join(testDir, "src/routes/styled"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/styled/page.tsx"),
    `import * as React from "react";\n` +
      `import "./styled.css";\n` +
      `export const Page = () => <article className="styled">{"props-css-styled"}</article>;\n`,
  );
  await writeFile(
    join(testDir, "src/routes/styled/styled.css"),
    `.styled { color: orange; }\n`,
  );
  // /manual: the page renders a stylesheet url by hand.
  await writeFile(
    join(testDir, "src/routes/manual/page.tsx"),
    `import * as React from "react";\n` +
      `import manualCss from "./manual.css?url";\n` +
      `export const Page = () => (\n` +
      `  <section>\n` +
      `    <link rel="stylesheet" href={manualCss} />\n` +
      `    <p className="manual">{"props-css-manual"}</p>\n` +
      `  </section>\n` +
      `);\n`,
  );
  await writeFile(
    join(testDir, "src/routes/manual/manual.css"),
    `.manual { color: teal; }\n`,
  );
  await writeFile(
    join(testDir, "src/client.tsx"),
    `"use client";\n` +
      `import { startClient } from "vite-plugin-react-server/router/client";\n` +
      `startClient({ moduleBaseURL: "/" });\n`,
  );
  await writeFile(
    join(testDir, "index.html"),
    `<!DOCTYPE html><html><head></head><body><div id="root"></div>` +
      `<script type="module" src="/src/client.tsx"></script></body></html>`,
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
      `    runner: "isolated",\n` +
      `    transport: "webpack",\n` +
      `    moduleBase: "src",\n` +
      `    Page: fr.Page,\n` +
      `    props: fr.props,\n` +
      `    routePatterns: fr.routePatterns,\n` +
      `    build: { pages: fr.build.pages, outDir: "dist" },\n` +
      // Link, never inline: the assertions are about <link> emission.
      `    css: { inlineCss: false },\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    projectRoot: process.cwd(),\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("PROPS_CSS_BUILD_OK");\n` +
      `process.exit(0);\n`,
  );
  try {
    await symlink(
      resolve(__dirname, "../../node_modules"),
      join(testDir, "node_modules"),
      "dir",
    );
  } catch {
    /* already linked */
  }
}

type HostManifest = {
  target: string;
  cssByPattern: Record<string, string[]>;
  htmlOutputPath: string;
};

/** The frozen document for a route, found by walking the build output. */
async function frozenDocument(route: string): Promise<string> {
  const distDir = join(testDir, "dist");
  const wanted = `${route.replace(/^\//, "")}/index.html`;
  const files = (await readdir(distDir, { recursive: true })) as string[];
  const hit = files.find((f) => f.split("\\").join("/").endsWith(wanted));
  if (!hit) {
    throw new Error(`no frozen document for ${route} under ${distDir}`);
  }
  return readFile(join(distDir, hit), "utf8");
}

const stylesheetLinks = (html: string): string[] =>
  [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((m) => m[0]);

describe.skipIf(!isolatedLeg)(
  "host-manifest css: props-only imports and hand-rendered ?url stylesheets",
  () => {
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
        `build failed (status ${proc.status}):\n${proc.stderr}`,
      ).toContain("PROPS_CSS_BUILD_OK");
      node = JSON.parse(
        await readFile(join(testDir, "dist/server/host-manifest.json"), "utf8"),
      );
      edge = JSON.parse(
        await readFile(
          join(testDir, "dist/server-edge/host-manifest.json"),
          "utf8",
        ),
      );
    }, 240000);

    afterAll(async () => {
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    it("a stylesheet only props.ts imports is in the route's cssByPattern (node and edge)", () => {
      for (const m of [node, edge]) {
        const css = m.cssByPattern["/about"] ?? [];
        expect(css, `${m.target} cssByPattern["/about"]`).toHaveLength(1);
        expect(css[0]).toMatch(/\.css$/);
      }
      // The two targets describe one build.
      expect(edge.cssByPattern["/about"]).toEqual(node.cssByPattern["/about"]);
    });

    it("the frozen /about document links that same stylesheet", async () => {
      const html = await frozenDocument("/about");
      expect(html).toContain("props-css-about");
      const [cssFile] = node.cssByPattern["/about"];
      const links = stylesheetLinks(html);
      expect(
        links.some((l) => l.includes(cssFile)),
        `expected a <link rel="stylesheet"> for ${cssFile}, got:\n${links.join("\n")}`,
      ).toBe(true);
    });

    it("a stylesheet the page imports is recorded and linked the same way", async () => {
      for (const m of [node, edge]) {
        expect(m.cssByPattern["/styled"] ?? []).toHaveLength(1);
      }
      const html = await frozenDocument("/styled");
      const [cssFile] = node.cssByPattern["/styled"];
      const links = stylesheetLinks(html);
      expect(
        links.some((l) => l.includes(cssFile)),
        `expected a <link rel="stylesheet"> for ${cssFile}, got:\n${links.join("\n")}`,
      ).toBe(true);
    });

    it("a page importing no css has no cssByPattern entry", () => {
      for (const m of [node, edge]) {
        expect(m.cssByPattern["/"]).toBeUndefined();
      }
    });

    it("a ?url stylesheet the page renders itself lands in the document as the page wrote it", async () => {
      const html = await frozenDocument("/manual");
      expect(html).toContain("props-css-manual");
      const links = stylesheetLinks(html);
      // The asset url Vite emitted for manual.css, rendered by the page —
      // asserted on the document only; cssByPattern is about the css the
      // build attaches to a route, which this is not.
      expect(
        links.some((l) => /href="[^"]*manual[^"]*\.css"/.test(l)),
        `expected the hand-rendered manual.css link, got:\n${links.join("\n")}`,
      ).toBe(true);
    });
  },
);
