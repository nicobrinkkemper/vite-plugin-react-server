import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve, join, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

// The NOT-FOUND terminal outcome, end to end in a real browser: navigating to
// a route that does not exist must stay IN the SPA. The host answers the
// flight miss with the prerendered /404 route's flight (status 404,
// x-vprs-outcome: not-found), and the fetcher decodes it under the gate's
// dual rule — DECLARED flight (text/x-component, any status), or an OK
// response that is not a document — so the router renders the 404 route
// without a document load. Text or HTML reaching the decoder is the failure
// class this retires; a host that answers a miss with anything that fails
// both halves of the rule still triggers the full-navigation fallback.
const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();
// Fail CLOSED where a browser is guaranteed (the CI browser-regressions job
// sets this): a missing Chromium must fail the job, never skip it green.
if (!browserAvailable && process.env["VPRS_REQUIRE_BROWSER"]) {
  throw new Error(
    "VPRS_REQUIRE_BROWSER is set but Playwright Chromium is not installed"
  );
}

const testDir = resolve(__dirname, "../fixtures/static-notfound-navigation.test");
const PORT = 4199;

const MIME: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
};

async function setupFixture() {
  await mkdir(join(testDir, "src/routes/404"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/Counter.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `export function Counter({ id }: { id: string }) {\n` +
      `  const [n, setN] = React.useState(0);\n` +
      `  return (\n` +
      `    <button id={id} onClick={() => setN((v) => v + 1)}>\n` +
      `      {"count:" + n}\n` +
      `    </button>\n` +
      `  );\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/NavLink.client.tsx"),
    `"use client";\n` +
      `export { Link } from "vite-plugin-react-server/router/client";\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { Link } from "./NavLink.client.js";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main>\n` +
      `    <h1 id="heading">{"home"}</h1>\n` +
      `    <Counter id="home-counter" />\n` +
      `    <Link id="to-missing" to="/missing/">{"go somewhere that does not exist"}</Link>\n` +
      `  </main>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/routes/404/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = () => (\n` +
      `  <main>\n` +
      `    <h1 id="heading">{"lost-page"}</h1>\n` +
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
      `    runner: process.env.VPRS_PROBE_RUNNER || "isolated",\n` +
      `    moduleBase: "src",\n` +
      `    Page: fr.Page,\n` +
      `    props: fr.props,\n` +
      `    routePatterns: fr.routePatterns,\n` +
      `    build: { pages: fr.build.pages, outDir: "dist" },\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    projectRoot: process.cwd(),\n` +
      `  }),\n` +
      `});\n` +
      `await builder.buildApp();\n` +
      `console.log("NOTFOUND_BUILD_OK");\n` +
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

describe.skipIf(!browserAvailable)(
  "not-found navigation — the 404 route's flight keeps the SPA alive",
  () => {
    let server: Server | undefined;

    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();

      // Deploy-realistic build in a spawned NODE_ENV=production process; the
      // runner follows this leg's ambient condition (test-both covers both).
      const mainLeg = !!process.env["NODE_OPTIONS"]?.includes("react-server");
      const env = { ...process.env, NODE_ENV: "production" };
      env["NODE_OPTIONS"] = mainLeg ? "--conditions react-server" : "";
      env["VPRS_PROBE_RUNNER"] = mainLeg ? "main" : "isolated";
      const proc = spawnSync("node", ["build.mjs"], {
        cwd: testDir,
        encoding: "utf8",
        timeout: 120000,
        env,
      });
      expect(
        proc.stdout,
        `build failed (status ${proc.status}):\n${proc.stderr}`
      ).toContain("NOTFOUND_BUILD_OK");

      // The REAL Node host: createRequestHandler over dist/static (the layer
      // that owns the not-found flight outcome), with the built client
      // modules served beside it like any asset host would.
      const { createRequestHandler, toNodeListener } = await import(
        "vite-plugin-react-server/request-handler"
      );
      const handler = createRequestHandler({
        staticDir: join(testDir, "dist/static"),
      });
      const listener = toNodeListener(handler);
      // Asset shim beside the handler, dist/static FIRST: both roots emit a
      // routes/<Component>-<hash>.js, and only the static one is the
      // browser-flavored bundle (the client root's copy imports bare "react"
      // for Node SSR). Root order is load-bearing.
      const assetRoots = [join(testDir, "dist/static"), join(testDir, "dist/client")];
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const pathname = decodeURIComponent(
          new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname
        ).replace(/\/{2,}/g, "/");
        if (extname(pathname) && !pathname.endsWith(".rsc")) {
          for (const root of assetRoots) {
            const file = join(root, pathname);
            if (existsSync(file) && file.startsWith(root)) {
              res.writeHead(200, {
                "content-type":
                  MIME[extname(file)] ?? "application/octet-stream",
              });
              return void res.end(readFileSync(file));
            }
          }
        }
        listener(req, res);
      });
      await new Promise<void>((r) => server!.listen(PORT, r));
    }, 180000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    it("renders the 404 route in place: no reload, one 404-status flight fetch", async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const flightResponses: { url: string; status: number; outcome: string | null }[] = [];
        const documentRequests: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("response", (r) => {
          if (new URL(r.url()).pathname.endsWith(".rsc")) {
            flightResponses.push({
              url: new URL(r.url()).pathname,
              status: r.status(),
              outcome: r.headers()["x-vprs-outcome"] ?? null,
            });
          }
        });
        page.on("request", (r) => {
          if (r.resourceType() === "document")
            documentRequests.push(new URL(r.url()).pathname);
        });

        await page.goto(`http://localhost:${PORT}/`, {
          waitUntil: "networkidle",
        });

        // Hydration gate (an unhydrated Link click is a full navigation —
        // a legitimate failure of everything below).
        await page.waitForFunction(
          () => {
            const b = document.querySelector(
              "#home-counter"
            ) as HTMLButtonElement;
            if (!b) return false;
            b.click();
            return b.textContent !== "count:0";
          },
          undefined,
          { timeout: 20000, polling: 400 }
        );

        const timeOriginBefore = await page.evaluate(
          () => performance.timeOrigin
        );

        await page.click("#to-missing");
        await page.waitForFunction(
          () => document.querySelector("#heading")?.textContent === "lost-page",
          undefined,
          { timeout: 15000 }
        );

        // The SPA survived the miss: no reload, no document request.
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(
          timeOriginBefore
        );
        expect(documentRequests).toEqual(["/"]);

        // Exactly one flight fetch for the missing route, answered as the
        // not-found outcome: status 404, flight body, outcome header.
        const missing = flightResponses.filter((f) =>
          f.url.includes("missing")
        );
        expect(missing).toHaveLength(1);
        expect(missing[0]!.status).toBe(404);
        expect(missing[0]!.outcome).toBe("not-found");

        expect(pageErrors).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }
);
