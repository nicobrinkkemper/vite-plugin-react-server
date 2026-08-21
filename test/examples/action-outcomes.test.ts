import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";

// The user-visible half of the Flight transaction contract, in a real
// browser against the dev server (both runner topologies via test-both):
//
//  - refresh: a successful action revalidates the current route — the
//    mutated value shows WITHOUT a reload, and client-component state
//    survives the swap.
//  - error: a throwing action rejects with the server's message (decoded
//    from the flight error envelope) and the page stays alive.
//  - redirect: an action redirect() lands on the target route — address bar
//    and content both, no document load.
//  - notFound: an action notFound() swaps in the 404 route's flight with
//    the address unchanged.
//
// The store the mutating action writes is a FILE, not module state: under
// runner "isolated" the action executes in the plugin's process while the
// page renders in the RSC worker, so anything less shared would prove the
// wrong thing.
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

const testDir = resolve(__dirname, "../fixtures/action-outcomes.test");
const STORE = join(testDir, "store.txt");
const PORT = 4211;

async function setupFixture() {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(join(testDir, "src/page"), { recursive: true });
  await writeFile(STORE, "0");

  await writeFile(
    join(testDir, "src/page/actions.ts"),
    `"use server";\n` +
      `import { readFile, writeFile } from "node:fs/promises";\n` +
      `import { redirect, notFound } from "vite-plugin-react-server/router";\n` +
      `const STORE = ${JSON.stringify(STORE)};\n` +
      `export async function bump() {\n` +
      `  const next = Number(await readFile(STORE, "utf8")) + 1;\n` +
      `  await writeFile(STORE, String(next));\n` +
      `  return next;\n` +
      `}\n` +
      `export async function go() {\n` +
      `  redirect("/target/");\n` +
      `}\n` +
      `export async function vanish() {\n` +
      `  notFound();\n` +
      `}\n` +
      `export async function explode() {\n` +
      `  throw new Error("kaboom");\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/page/Actions.client.tsx"),
    `"use client";\n` +
      `import * as React from "react";\n` +
      `export function Actions(props: {\n` +
      `  bump: () => Promise<number>;\n` +
      `  go: () => Promise<void>;\n` +
      `  vanish: () => Promise<void>;\n` +
      `  explode: () => Promise<void>;\n` +
      `}) {\n` +
      `  const [n, setN] = React.useState(0);\n` +
      `  const [caught, setCaught] = React.useState("");\n` +
      `  return (\n` +
      `    <div>\n` +
      `      <button id="counter" onClick={() => setN((v) => v + 1)}>{"count:" + n}</button>\n` +
      `      <button id="bump" onClick={() => void props.bump()}>bump</button>\n` +
      `      <button id="go" onClick={() => void props.go()}>go</button>\n` +
      `      <button id="vanish" onClick={() => void props.vanish()}>vanish</button>\n` +
      `      <button id="explode" onClick={() => props.explode().catch((e) => setCaught(e.message))}>explode</button>\n` +
      `      {caught ? <output id="caught">{caught}</output> : null}\n` +
      `    </div>\n` +
      `  );\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `import * as React from "react";\n` +
      `import { Actions } from "./Actions.client.js";\n` +
      `import { bump, go, vanish, explode } from "./actions.js";\n` +
      `export const Page = ({ value }: { value: number }) => (\n` +
      `  <main>\n` +
      `    <h1 id="heading">home</h1>\n` +
      `    <p id="value">{"value:" + value}</p>\n` +
      `    <Actions bump={bump} go={go} vanish={vanish} explode={explode} />\n` +
      `  </main>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/page/target.tsx"),
    `import * as React from "react";\n` +
      `import { Actions } from "./Actions.client.js";\n` +
      `import { bump, go, vanish, explode } from "./actions.js";\n` +
      `export const Page = () => (\n` +
      `  <main>\n` +
      `    <h1 id="heading">target-page</h1>\n` +
      `    <Actions bump={bump} go={go} vanish={vanish} explode={explode} />\n` +
      `  </main>\n` +
      `);\n`
  );
  await writeFile(
    join(testDir, "src/page/notfound.tsx"),
    `import * as React from "react";\n` +
      `export const Page = () => <h1 id="heading">not-found-page</h1>;\n`
  );
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `import { readFileSync } from "node:fs";\n` +
      `const STORE = ${JSON.stringify(STORE)};\n` +
      `export const props = () => ({ value: Number(readFileSync(STORE, "utf8")) });\n`
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

const pageFor = (route: string) =>
  route.includes("target")
    ? "src/page/target.tsx"
    : route.includes("404")
      ? "src/page/notfound.tsx"
      : "src/page/page.tsx";

describe.skipIf(!browserAvailable)("server-action outcomes (browser)", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let port: number;
  const documentRequests: string[] = [];
  let documentBaseline = 0;

  const text = async (selector: string) => {
    try {
      return await page.locator(selector).textContent({ timeout: 2000 });
    } catch {
      return "<none>";
    }
  };
  const waitFor = (fn: () => Promise<boolean>, ms = 15000) =>
    new Promise<void>((res, rej) => {
      const start = Date.now();
      const tick = async () => {
        if (await fn()) return res();
        if (Date.now() - start > ms) return rej(new Error("waitFor timeout"));
        setTimeout(tick, 300);
      };
      void tick();
    });

  beforeAll(async () => {
    await setupFixture();
    const mainLeg = getCondition() === REACT_CONDITION.server;
    server = await createServer({
      mode: "test",
      root: testDir,
      esbuild: { jsx: "automatic" },
      // Isolated dep-optimizer cache: the symlinked node_modules is shared
      // across fixtures and a stale pre-bundle silently tests old code.
      cacheDir: ".vite-action-outcomes-test",
      optimizeDeps: { force: true },
      plugins: [
        vitePluginReactServer({
          runner: mainLeg ? "main" : "isolated",
          moduleBase: "src",
          Page: pageFor,
          props: () => "src/page/props.ts",
          moduleBasePath: "",
          moduleBaseURL: "/",
          projectRoot: testDir,
        }),
      ],
      server: { port: PORT },
    });
    await server.listen();
    port = server.config.server.port ?? PORT;

    browser = await chromium.launch();
    page = await browser.newPage();
    page.on("request", (r) => {
      if (r.resourceType() === "document") documentRequests.push(r.url());
    });
    await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
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
    // Startup settles before the baseline (cold-cache re-optimize can reload
    // once in linked dev); the contract under test is the action cycle.
    await new Promise((r) => setTimeout(r, 1500));
    documentBaseline = documentRequests.length;
  }, 120000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (!process.env["KEEP_FIXTURE"])
      await rm(testDir, { recursive: true, force: true });
  });

  it("a successful action refreshes the route and client state survives", async () => {
    expect(await text("#value")).toBe("value:0");
    await page.click("#counter");
    const before = await text("#counter");

    await page.click("#bump");
    await waitFor(async () => (await text("#value")) === "value:1");
    expect(await text("#counter")).toBe(before);
    expect(documentRequests.length).toBe(documentBaseline);
  }, 60000);

  it("a throwing action rejects with the server's message; the page stays alive", async () => {
    await page.click("#explode");
    await waitFor(async () => (await text("#caught")) === "kaboom");
    // Still interactive after the failure.
    const before = await text("#counter");
    await page.click("#counter");
    expect(await text("#counter")).not.toBe(before);
    expect(documentRequests.length).toBe(documentBaseline);
  }, 60000);

  it("an action redirect() lands on the target route, address included", async () => {
    await page.click("#go");
    await waitFor(async () => (await text("#heading")) === "target-page");
    expect(new URL(page.url()).pathname).toBe("/target");
    expect(documentRequests.length).toBe(documentBaseline);
  }, 60000);

  it("an action notFound() shows the 404 route without leaving the address", async () => {
    await page.click("#vanish");
    await waitFor(async () => (await text("#heading")) === "not-found-page");
    expect(new URL(page.url()).pathname).toBe("/target");
    expect(documentRequests.length).toBe(documentBaseline);
  }, 60000);
});
