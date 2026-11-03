import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import {
  mkdir,
  rm,
  writeFile,
  readFile,
  symlink,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";
import { testUserOptions } from "../test-config.js";
import { handleRSCStream } from "../rsc-stream.js";

// A route carries the css its own module graph imports and nothing else.
// The rsc worker renders every route of a build (and every dev request) in
// one long-lived thread, so css that one render collects must not survive
// into the next. Two routes import their own stylesheet; whichever renders
// second would carry the first one's sheet if it did. The staticPaths route
// imports none, and its expanded urls render after both.

const testDir = resolve(__dirname, "../fixtures/route-css-isolation.test");

// Each sheet declares a custom property named after it: minifiers keep it
// verbatim, so it identifies an inlined <style> as surely as a file name
// identifies a <link>.
const SHEETS = {
  home: { file: "home.module.css", marker: "--route-css-home" },
  plain: { file: "plain.module.css", marker: "--route-css-plain" },
} as const;

const OWN_SHEET: Record<string, keyof typeof SHEETS | undefined> = {
  "/": "home",
  "/plain": "plain",
  "/greet/ada": undefined,
  "/greet/grace": undefined,
};

async function setupFixture(testDir: string) {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/routes/plain"), { recursive: true });
  await mkdir(join(testDir, "src/routes/greet/$name"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/home.module.css"),
    `.home { ${SHEETS.home.marker}: 1; }\n`,
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import styles from "./home.module.css";\n` +
      `export const Page = () => <main className={styles.home}>{"css-home"}</main>;\n`,
  );
  await writeFile(
    join(testDir, "src/routes/plain/plain.module.css"),
    `.plain { ${SHEETS.plain.marker}: 1; }\n`,
  );
  await writeFile(
    join(testDir, "src/routes/plain/page.tsx"),
    `import * as React from "react";\n` +
      `import styles from "./plain.module.css";\n` +
      `export const Page = () => <main className={styles.plain}>{"css-plain"}</main>;\n`,
  );
  await writeFile(
    join(testDir, "src/routes/greet/$name/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = ({ name }: { name: string }) => <main>{"hello " + name}</main>;\n`,
  );
  await writeFile(
    join(testDir, "src/routes/greet/$name/props.ts"),
    `export const props = (_url: string, { params }: { params: { name: string } }) => ({\n` +
      `  name: params.name,\n` +
      `});\n`,
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
      `const builder = await createBuilder({\n` +
      `  configFile: false,\n` +
      `  root: process.cwd(),\n` +
      `  mode: "production",\n` +
      `  esbuild: { jsx: "automatic" },\n` +
      `  plugins: vitePluginReactServer({\n` +
      `    runner: "isolated",\n` +
      `    moduleBase: "src",\n` +
      `    routes: {\n` +
      `      dir: "routes",\n` +
      `      staticPaths: {\n` +
      `        "/greet/$name": () => [{ name: "ada" }, { name: "grace" }],\n` +
      `      },\n` +
      `    },\n` +
      `    build: { outDir: "dist" },\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    projectRoot: process.cwd(),\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("ROUTE_CSS_BUILD_OK");\n` +
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

/** Every mention of a sheet in a document or flight: its file name or its rule. */
const sheetsIn = (text: string): string[] =>
  (Object.keys(SHEETS) as (keyof typeof SHEETS)[]).filter((key) => {
    const { file, marker } = SHEETS[key];
    return text.includes(file.replace(/\.css$/, "")) || text.includes(marker);
  });

const expectedSheets = (route: string): string[] => {
  const own = OWN_SHEET[route];
  return own ? [own] : [];
};

// The static build spawns its own node with runner "isolated", the runner
// that renders through the rsc worker; the react-server leg renders on the
// main thread and is covered by the isolated leg's build.
describe.skipIf(getCondition() === REACT_CONDITION.server)(
  "route css isolation: static build",
  () => {
    beforeAll(async () => {
      await setupFixture(testDir);
      const proc = spawnSync("node", ["build.mjs"], {
        cwd: testDir,
        encoding: "utf8",
        timeout: 180000,
        env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
      });
      expect(
        proc.stdout,
        `build failed (status ${proc.status}):\n${proc.stderr}`,
      ).toContain("ROUTE_CSS_BUILD_OK");
    }, 240000);

    afterAll(async () => {
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    for (const route of Object.keys(OWN_SHEET)) {
      it(`${route} carries only its own css in its document and flight`, async () => {
        const dir = join(testDir, "dist/static", route);
        const html = await readFile(join(dir, "index.html"), "utf8");
        const rsc = await readFile(join(dir, "index.rsc"), "utf8");
        expect(sheetsIn(html), `${route} index.html`).toEqual(
          expectedSheets(route),
        );
        expect(sheetsIn(rsc), `${route} index.rsc`).toEqual(
          expectedSheets(route),
        );
      });
    }
  },
);

describe("route css isolation: dev flights", () => {
  let server: ViteDevServer;
  let port = 3147;
  const devDir = `${testDir}-dev`;

  beforeAll(async () => {
    await setupFixture(devDir);
    server = await createServer({
      mode: "test",
      root: devDir,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          Page: undefined,
          props: undefined,
          projectRoot: devDir,
          moduleBase: "src",
          routes: { dir: "routes" },
        }),
      ],
      server: { port },
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
    });
    await server.listen();
    port = server.config?.server?.port ?? port;
  }, 120000);

  afterAll(async () => {
    await server?.close();
    await rm(devDir, { recursive: true, force: true });
  });

  it("each request's flight carries only its route's css, whatever rendered before", async () => {
    // Both styled routes first, then a route with none, then the first again.
    for (const route of ["/", "/plain", "/greet/ada", "/"]) {
      const flightUrl = `http://localhost:${port}${route.replace(/\/?$/, "/")}index.rsc`;
      const response = await handleRSCStream(flightUrl);
      expect(response.ok, `${route} flight`).toBe(true);
      expect(sheetsIn(response.result), `${route} flight`).toEqual(
        expectedSheets(route),
      );
    }
  });
});
