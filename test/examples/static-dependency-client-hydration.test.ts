import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, readdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve, join, extname } from "node:path";
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// A dependency's "use client" component, rendered by a server component,
// prerendered, served from a dumb file server and hydrated in a real browser.
// The client reference names the dependency module's own browser file; this
// pins that the browser build wrote it and that the component answers a
// click, both where a first-party client module imports the package too and
// where only the server component does.
const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();
// Fail CLOSED where a browser is guaranteed (the CI browser-regressions job
// sets this): a missing Chromium must fail the job, never skip it green.
// Local runs without a browser still skip. Same discipline as
// VPRS_REQUIRE_MINIFLARE in the workerd smoke.
if (!browserAvailable && process.env["VPRS_REQUIRE_BROWSER"]) {
  throw new Error(
    "VPRS_REQUIRE_BROWSER is set but Playwright Chromium is not installed"
  );
}



const testDir = resolve(__dirname, "../fixtures/static-dependency-client-hydration.test");
const PORT = 4229;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".rsc": "application/octet-stream",
};

const counter = (name: string) =>
  `"use client";\n` +
  `import * as React from "react";\n` +
  `export function ${name}({ id }) {\n` +
  `  const [n, setN] = React.useState(0);\n` +
  `  return React.createElement("button", { id, onClick: () => setN((v) => v + 1) }, "count:" + n);\n` +
  `}\n`;

async function setupPackage(name: string, component: string) {
  const dir = join(testDir, "node_modules", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      type: "module",
      exports: { ".": "./index.js" },
      peerDependencies: { react: "*" },
    })
  );
  await writeFile(join(dir, "index.js"), counter(component));
}

async function setupFixture() {
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  // The repo's dependencies, linked one by one, so the two packages below can
  // sit beside them as real directories.
  await mkdir(join(testDir, "node_modules"), { recursive: true });
  const installed = resolve(__dirname, "../../node_modules");
  for (const entry of await readdir(installed)) {
    if (entry.startsWith(".")) continue;
    await symlink(join(installed, entry), join(testDir, "node_modules", entry), "dir");
  }
  // shared-ui: a first-party client module imports it as well.
  // server-ui: only the server component imports it.
  await setupPackage("shared-ui", "SharedCounter");
  await setupPackage("server-ui", "ServerCounter");
  await writeFile(
    join(testDir, "src/routes/Toolbar.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `import { SharedCounter } from "shared-ui";\n` +
      `export function Toolbar() {\n` +
      `  return <SharedCounter id="from-client" />;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { SharedCounter } from "shared-ui";\n` +
      `import { ServerCounter } from "server-ui";\n` +
      `import { Toolbar } from "./Toolbar.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main id="app">\n` +
      `    <Toolbar />\n` +
      `    <SharedCounter id="shared-from-server" />\n` +
      `    <ServerCounter id="server-only" />\n` +
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
}

/**
 * The dumb file server: dist/static then dist/client, extension-less paths
 * get index.html, unknown paths get 404. No handler, no Accept negotiation.
 */
function serveStatic(roots: string[]): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname).replace(/\/{2,}/g, "/");
    if (pathname.endsWith("/")) pathname += "index.html";
    else if (!extname(pathname)) pathname += "/index.html";
    for (const root of roots) {
      const file = join(root, pathname);
      if (existsSync(file) && file.startsWith(root)) {
        res.writeHead(200, {
          "content-type": MIME[extname(file)] ?? "application/octet-stream",
        });
        res.end(readFileSync(file));
        return;
      }
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
}

describe.skipIf(!browserAvailable)(
  "dependency client component rendered by a server component hydrates",
  () => {
    let server: Server | undefined;

    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();

      // A spawned production build, as in static-suspense-hydration.
      const mainLeg = getCondition() === REACT_CONDITION.server;
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
          `    runner: ${JSON.stringify(mainLeg ? "main" : "isolated")},\n` +
          `    moduleBase: "src",\n` +
          `    Page: fr.Page,\n` +
          `    props: fr.props,\n` +
          `    routePatterns: fr.routePatterns,\n` +
          `    build: { pages: fr.build.pages, outDir: "dist" },\n` +
          `    moduleBasePath: "",\n` +
          `    moduleBaseURL: "/",\n` +
          `    projectRoot: process.cwd(),\n` +
          `    clientPackages: ["shared-ui", "server-ui"],\n` +
          `  }),\n` +
          `});\n` +
          `await builder.buildApp();\n` +
          `console.log("DEPENDENCY_BUILD_OK");\n` +
          `process.exit(0);\n`
      );
      const env = { ...process.env, NODE_ENV: "production" };
      env["NODE_OPTIONS"] = mainLeg ? "--conditions react-server" : "";
      const proc = spawnSync("node", ["build.mjs"], {
        cwd: testDir,
        encoding: "utf8",
        timeout: 120000,
        env,
      });
      expect(
        proc.stdout,
        `build failed (status ${proc.status}):\n${proc.stderr}`
      ).toContain("DEPENDENCY_BUILD_OK");

      // dist/static only: the browser must find every file there.
      server = serveStatic([join(testDir, "dist/static")]);
      await new Promise<void>((r) => server!.listen(PORT, r));
    }, 180000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    it("every counter answers a click and no module fails to load", async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        const failed: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("console", (m) => {
          if (m.type() === "error") consoleErrors.push(m.text());
        });
        page.on("response", (r) => {
          if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
        });

        await page.goto(`http://localhost:${PORT}/`, {
          waitUntil: "networkidle",
        });

        for (const id of ["from-client", "shared-from-server", "server-only"]) {
          await page.locator(`#${id}`).waitFor({ timeout: 15000 });
          // The first click that lands is the hydration-complete signal.
          await page.waitForFunction(
            (id) => {
              const b = document.querySelector(`#${id}`) as HTMLButtonElement;
              if (!b) return false;
              if (b.textContent === "count:0") b.click();
              return b.textContent !== "count:0";
            },
            id,
            { timeout: 20000, polling: 400 }
          );
          expect(await page.locator(`#${id}`).textContent(), id).toBe("count:1");
        }

        expect(failed).toEqual([]);
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }
);
