import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { spawnSync } from "node:child_process";
import { resolve, join, extname } from "node:path";
import { chromium } from "playwright";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// The static leg of `inlineFlight: "stream"` under transport:"webpack".
// Streamed delivery is a per-request shape: the interleaver's injection
// safety rests on the producer flushing at element boundaries, which holds
// for React's live streaming renderer but NOT for react-dom/static's
// prelude — a buffered document replayed at arbitrary byte offsets. A chunk
// script injected mid-attribute is swallowed by the parser as text: the
// payload truncates, the decoder hits end-of-stream with unresolved rows
// ("Connection closed", minified #412), and hydration blanks the page.
// This pins the frozen files' contract: every flight-delivery script in the
// emitted bytes parses as a real script element, the document self-carries a
// complete payload (no index.rsc fetch to hydrate), and the page hydrates
// from a dumb static host. The route is sized so the prelude spans several
// chunks — a page that fits one chunk gets every injection at the safe
// trailer boundary and cannot show the failure.
const browserAvailable = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();
if (!browserAvailable && process.env["VPRS_REQUIRE_BROWSER"]) {
  throw new Error(
    "VPRS_REQUIRE_BROWSER is set but Playwright Chromium is not installed"
  );
}

const testDir = resolve(
  __dirname,
  "../fixtures/transport-webpack-stream-static.test"
);
const PORT = 4221;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
  ".rsc": "application/octet-stream",
};

const STREAM_SCRIPT_RE = /<script[^>]*>\(self\.__vprsFlightChunks\|\|=\[\]\)\.push\(/g;
const BLOB_SCRIPT_RE = /<script[^>]*type="text\/x-component"[^>]*id="vprs-flight"/g;

async function setupFixture() {
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/Counter.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `export function Counter() {\n` +
      `  const [n, setN] = React.useState(0);\n` +
      `  return (\n` +
      `    <button id="counter" onClick={() => setN((v) => v + 1)}>\n` +
      `      {"count:" + n}\n` +
      `    </button>\n` +
      `  );\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { Counter } from "./Counter.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main id="app">\n` +
      `    <h1>{"webpack-stream-static"}</h1>\n` +
      `    <Counter />\n` +
      `    {Array.from({ length: 400 }, (_, i) => (\n` +
      `      <p key={i} style={{ paddingLeft: (i % 7) + "px" }}>\n` +
      `        row-{i}-sized-to-span-several-prelude-chunks\n` +
      `      </p>\n` +
      `    ))}\n` +
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
  "transport webpack + inlineFlight stream — frozen files self-carry a parse-safe payload",
  () => {
    let server: Server | undefined;
    let html = "";
    let rsc: Buffer;

    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();

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
          `    transport: "webpack",\n` +
          `    moduleBase: "src",\n` +
          `    Page: fr.Page,\n` +
          `    props: fr.props,\n` +
          `    routePatterns: fr.routePatterns,\n` +
          `    build: { pages: fr.build.pages, outDir: "dist", inlineFlight: "stream" },\n` +
          `    moduleBasePath: "",\n` +
          `    moduleBaseURL: "/",\n` +
          `    projectRoot: process.cwd(),\n` +
          `  }),\n` +
          `});\n` +
          `await builder.buildApp();\n` +
          `console.log("WEBPACK_STREAM_STATIC_BUILD_OK");\n` +
          `process.exit(0);\n`
      );
      const env = { ...process.env, NODE_ENV: "production" };
      env["NODE_OPTIONS"] = mainLeg ? "--conditions react-server" : "";
      const proc = spawnSync("node", ["build.mjs"], {
        cwd: testDir,
        encoding: "utf8",
        timeout: 180000,
        env,
      });
      expect(
        proc.stdout,
        `build failed (status ${proc.status}):\n${proc.stderr}`
      ).toContain("WEBPACK_STREAM_STATIC_BUILD_OK");

      html = await readFile(join(testDir, "dist/static/index.html"), "utf8");
      rsc = Buffer.from(await readFile(join(testDir, "dist/static/index.rsc")));
      server = serveStatic([
        join(testDir, "dist/static"),
        join(testDir, "dist/client"),
      ]);
      await new Promise<void>((r) => server!.listen(PORT, r));
    }, 240000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    it("every flight-delivery script in the file parses as a script element", async () => {
      const inFile =
        (html.match(STREAM_SCRIPT_RE)?.length ?? 0) +
        (html.match(BLOB_SCRIPT_RE)?.length ?? 0);
      expect(inFile).toBeGreaterThan(0);

      // JavaScript off: the DOM is the parser's verdict alone. A script
      // swallowed into an attribute value exists in the bytes but not as an
      // element — the count mismatch is this bug's signature.
      const browser = await chromium.launch();
      try {
        const page = await browser
          .newContext({ javaScriptEnabled: false })
          .then((c) => c.newPage());
        await page.goto(`http://localhost:${PORT}/`, {
          waitUntil: "domcontentloaded",
        });
        const inDom = await page.evaluate(() => {
          const scripts = [...document.querySelectorAll("script")];
          return scripts.filter(
            (s) =>
              s.textContent?.includes("__vprsFlightChunks") ||
              s.id === "vprs-flight"
          ).length;
        });
        expect(inDom).toBe(inFile);
      } finally {
        await browser.close();
      }
    });

    it("the frozen document carries the COMPLETE payload", () => {
      const streamChunks = [
        ...html.matchAll(
          /__vprsFlightChunks\|\|=\[\]\)\.push\("([^"]*)"\)/g
        ),
      ].map((m) => Buffer.from(m[1]!, "base64"));
      const blob = html.match(
        /id="vprs-flight"[^>]*>([A-Za-z0-9+/=]+)<\/script>/
      );
      const payload = blob
        ? Buffer.from(blob[1]!, "base64")
        : Buffer.concat(streamChunks);
      expect(payload.equals(rsc)).toBe(true);
    });

    it("hydrates from a dumb host without fetching index.rsc", async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const rscFetches: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(String(e)));
        page.on("request", (r) => {
          if (r.url().endsWith(".rsc")) rscFetches.push(r.url());
        });
        await page.goto(`http://localhost:${PORT}/`, {
          waitUntil: "networkidle",
        });
        await page.waitForFunction(
          () => {
            const b = document.querySelector("#counter") as HTMLButtonElement;
            if (!b) return false;
            b.click();
            return b.textContent !== "count:0";
          },
          undefined,
          { timeout: 20000, polling: 300 }
        );
        expect(
          pageErrors.filter((e) => /#41[289]|hydrat/i.test(e))
        ).toEqual([]);
        expect(rscFetches).toEqual([]);
        expect(
          await page.evaluate(
            () => document.getElementById("root")!.innerHTML.length
          )
        ).toBeGreaterThan(1000);
      } finally {
        await browser.close();
      }
    });
  }
);
