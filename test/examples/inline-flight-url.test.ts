import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { resolve, join, extname } from "node:path";
import { chromium } from "playwright";
import { doBuild } from "../doBuild.js";
import { fileRouter } from "../../plugin/router/fileRouter.js";

// The inline flight is the server's answer to the request that produced the
// document. A page whose client asks for a DIFFERENT url on first load (here:
// `/?view=/about/` shows the about route) must get that url's flight from the
// network, not the inlined render of `/`. A first fetch for the document's own
// url still takes the inline payload with no .rsc round trip.
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

const testDir = resolve(__dirname, "../fixtures/inline-flight-url.test");
const PORT = 4227;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".rsc": "text/x-component",
};

async function setupFixture() {
  await mkdir(join(testDir, "src/routes/about"), { recursive: true });
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = () => <h1 id="heading">{"home"}</h1>;\n`
  );
  await writeFile(
    join(testDir, "src/routes/about/page.tsx"),
    `import * as React from "react";\n` +
      `export const Page = () => <h1 id="heading">{"about"}</h1>;\n`
  );
  // The client shows the route named by ?view= instead of the document's own.
  await writeFile(
    join(testDir, "src/client.tsx"),
    `import { use, useState } from "react";\n` +
      `import { createRoot } from "react-dom/client";\n` +
      `import { createReactFetcher } from "vite-plugin-react-server/utils";\n` +
      `const view = new URLSearchParams(location.search).get("view") ?? location.pathname;\n` +
      `const Shell = ({ data }: { data: any }) => <>{use(useState(data)[0])}</>;\n` +
      `createRoot(document.getElementById("root")!).render(<Shell data={createReactFetcher({ url: view })} />);\n`
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
  "inline flight — only the document's own url takes it",
  () => {
    let server: Server | undefined;

    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();
      const fr = fileRouter(join(testDir, "src/routes"), { root: testDir });
      await doBuild({
        projectRoot: testDir,
        moduleBase: "src",
        Page: fr.Page,
        props: fr.props,
        routePatterns: fr.routePatterns,
        build: { pages: fr.build.pages, outDir: "dist", inlineFlight: true },
      } as never);

      server = serveStatic([
        join(testDir, "dist/static"),
        join(testDir, "dist/client"),
      ]);
      await new Promise<void>((r) => server!.listen(PORT, r));
    }, 180000);

    afterAll(async () => {
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    async function load(path: string) {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      const rscRequests: string[] = [];
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      page.on("request", (r) => {
        const url = new URL(r.url());
        if (url.pathname.endsWith(".rsc")) rscRequests.push(url.pathname);
      });
      await page.goto(`http://localhost:${PORT}${path}`, {
        waitUntil: "networkidle",
      });
      return { browser, page, rscRequests, pageErrors };
    }

    it("the document carries its inline flight", () => {
      const html = readFileSync(join(testDir, "dist/static/index.html"), "utf-8");
      expect(html).toContain(`id="vprs-flight"`);
    });

    it("a first fetch for another url gets that url's flight, not the inline one", async () => {
      const { browser, page, rscRequests, pageErrors } = await load(
        "/?view=/about/"
      );
      try {
        await page.waitForFunction(
          () => document.querySelector("#heading")?.textContent === "about",
          undefined,
          { timeout: 15000 }
        );
        expect(rscRequests).toEqual(["/about/index.rsc"]);
        expect(pageErrors).toEqual([]);
      } finally {
        await browser.close();
      }
    });

    it("a first fetch for the document's own url still takes the inline flight", async () => {
      const { browser, page, rscRequests, pageErrors } = await load(
        "/about/?view=/about/"
      );
      try {
        await page.waitForFunction(
          () => document.querySelector("#heading")?.textContent === "about",
          undefined,
          { timeout: 15000 }
        );
        expect(rscRequests).toEqual([]);
        expect(pageErrors).toEqual([]);
      } finally {
        await browser.close();
      }
    });
  }
);
