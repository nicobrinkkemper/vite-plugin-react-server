import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { resolve, join } from "node:path";
import {
  getCondition,
  REACT_CONDITION,
} from "../../plugin/config/getCondition.js";
import { spawnViteDev, stopViteDev, waitForServer } from "../e2e/devServer.js";

// Editing a `use server` module in dev must reach ACTION EXECUTION, not just
// the render. The dev rsc worker resolves actions through the reference gate,
// whose load paths bottom out in bare dynamic import() — Node's ESM cache
// never invalidates, so the first-imported action body kept running for every
// POST (across full page reloads) until the dev server restarted, while the
// render path reloaded the same module fresh and made the edit LOOK live.
// This drives the dev server over HTTP alone: POST the action, edit the file,
// POST again — the second reply must carry the edited behavior.
//
// The bug lives in the worker topology, so this spec pins the isolated leg
// and self-skips under --conditions react-server (the main leg resolves
// actions on the main thread through a different path).
const isolatedLeg = getCondition() !== REACT_CONDITION.server;

const testDir = resolve(__dirname, "../fixtures/dev-action-module-staleness.test");
const PORT = 4223;
const BASE_URL = `http://localhost:${PORT}`;

const actionSource = (version: string): string =>
  `"use server";\n` +
  `export async function greet(n: number): Promise<string> {\n` +
  `  return "${version}:" + n;\n` +
  `}\n`;

async function setupFixture() {
  await mkdir(join(testDir, "src/routes"), { recursive: true });
  await writeFile(join(testDir, "src/action.ts"), actionSource("v1"));
  await writeFile(
    join(testDir, "src/GreetButton.client.tsx"),
    `"use client";\n` +
      `export function GreetButton({ greet }: { greet: (n: number) => Promise<string> }) {\n` +
      `  return <button onClick={() => greet(1)}>greet</button>;\n` +
      `}\n`
  );
  await writeFile(
    join(testDir, "src/routes/page.tsx"),
    `import * as React from "react";\n` +
      `import { greet } from "../action.js";\n` +
      `import { GreetButton } from "../GreetButton.client.js";\n` +
      `export const Page = () => (\n` +
      `  <main>\n` +
      `    <h1>{"dev-action-staleness"}</h1>\n` +
      `    <GreetButton greet={greet} />\n` +
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
    join(testDir, "vite.config.ts"),
    `import { defineConfig } from "vite";\n` +
      `import { vitePluginReactServer } from "vite-plugin-react-server";\n` +
      `import { fileRouter } from "vite-plugin-react-server/router";\n` +
      `const fr = fileRouter("src/routes", { root: process.cwd() });\n` +
      `export default defineConfig({\n` +
      `  esbuild: { jsx: "automatic" },\n` +
      `  plugins: vitePluginReactServer({\n` +
      `    runner: "isolated",\n` +
      `    moduleBase: "src",\n` +
      `    Page: fr.Page,\n` +
      `    props: fr.props,\n` +
      `    routePatterns: fr.routePatterns,\n` +
      `    build: { pages: fr.build.pages },\n` +
      `    moduleBasePath: "",\n` +
      `    moduleBaseURL: "/",\n` +
      `    projectRoot: process.cwd(),\n` +
      `  }),\n` +
      `});\n`
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

/**
 * POST the action the way the browser proxy does: x-rsc-action id, encoded
 * reply body, flight envelope back. Returns the decoded returnValue.
 */
async function callGreet(): Promise<string> {
  const { encodeReply } = await import("react-server-dom-esm/client.edge");
  const body = await encodeReply([7]);
  const res = await fetch(`${BASE_URL}/`, {
    method: "POST",
    headers: { "x-rsc-action": "src/action.ts#greet" },
    body: body as string,
  });
  const text = await res.text();
  expect(res.status, `action answered ${res.status}: ${text.slice(0, 200)}`).toBe(200);
  const match = text.match(/"returnValue":"([^"]*)"/);
  expect(match, `no returnValue in: ${text.slice(0, 200)}`).not.toBeNull();
  return match![1]!;
}

describe.skipIf(!isolatedLeg)(
  "dev: editing a use-server module reaches action execution",
  () => {
    let server: ChildProcess | undefined;

    beforeAll(async () => {
      await rm(testDir, { recursive: true, force: true });
      await setupFixture();
      server = spawnViteDev({
        dir: testDir,
        port: PORT,
        env: { NODE_OPTIONS: "", NODE_ENV: "development" },
      });
      await waitForServer(BASE_URL, 60_000);
      // The worker registers routes lazily; make sure the page renders once
      // before any action call, like a browser session would.
      const page = await fetch(`${BASE_URL}/`);
      expect(page.status).toBe(200);
      await page.text();
    }, 90_000);

    afterAll(async () => {
      await stopViteDev(server);
      if (!process.env["KEEP_FIXTURE"])
        await rm(testDir, { recursive: true, force: true });
    });

    it("the edited action body answers the next POST", async () => {
      expect(await callGreet()).toBe("v1:7");

      await writeFile(join(testDir, "src/action.ts"), actionSource("v2"));
      // Give the watcher and invalidation a moment; poll rather than sleep
      // a fixed window so the test stays fast when the fix lands.
      const deadline = Date.now() + 10_000;
      let result = "";
      for (;;) {
        result = await callGreet();
        if (result === "v2:7" || Date.now() > deadline) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(result).toBe("v2:7");
    }, 30_000);
  }
);
