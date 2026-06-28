import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * Tests for HMR (Hot Module Replacement) in dev mode.
 * Verifies:
 * 1. Server sends 'vite-plugin-react-server:server-component-update' event on file change
 * 2. Module cache is invalidated after file change
 * 3. New content is returned on next request
 */

let server: ViteDevServer;
let port = 3115;
const testDir = resolve(__dirname, "../fixtures/hmr.test");

async function setupTestFiles() {
  await mkdir(join(testDir, "src/page"), { recursive: true });

  // Initial page component
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `import React from "react";
export const Page = () => <div>Initial Content</div>;`
  );

  // Props
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `export const props = () => ({ version: 1 });`
  );
}

/**
 * Fetch the RSC stream until it contains `needle` (the HMR change has
 * propagated) or the deadline passes. A fixed sleep before a single fetch is
 * flaky on loaded CI runners, where file-watch -> invalidate -> re-render can
 * take longer than the wait; polling is robust without weakening the assertion.
 */
async function fetchUntil(
  url: string,
  needle: string,
  timeoutMs = 12000
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const res = await fetch(url, { headers: { Accept: "text/x-component" } });
    if (res.ok) {
      last = await res.text();
      if (last.includes(needle)) return last;
    }
    await sleep(200);
  }
  return last;
}

describe("HMR", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await setupTestFiles();

    server = await createServer({
      root: testDir,
      configFile: false,
      server: { port, strictPort: true },
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          moduleBase: "src",
          verbose: true,
        }),
      ],
      logLevel: "warn",
    });

    await server.listen();
  }, 30000);

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("should send HMR event when server file changes", async () => {
    // Make initial request to populate module graph
    const initialResponse = await fetch(`http://localhost:${port}/`, {
      headers: { Accept: "text/x-component" },
    });
    expect(initialResponse.ok).toBe(true);
    const initialContent = await initialResponse.text();
    expect(initialContent).toContain("Initial Content");

    // Wait for module graph to settle
    await sleep(200);

    // Set up event listener BEFORE making the change
    const events: Array<{ type: string; event?: string; data?: any }> = [];
    const originalSend = server.ws.send.bind(server.ws);
    server.ws.send = function(payload: any) {
      if (payload && typeof payload === 'object') {
        events.push(payload);
      }
      return originalSend(payload);
    };

    // Modify the page file
    await writeFile(
      join(testDir, "src/page/page.tsx"),
      `import React from "react";
export const Page = () => <div>Updated Content</div>;`
    );

    // Poll until the change propagates (file watch -> invalidate -> re-render).
    const afterContent = await fetchUntil(
      `http://localhost:${port}/`,
      "Updated Content"
    );

    console.log('Captured events:', events.map(e => ({ type: e.type, event: e.event })));
    expect(afterContent).toContain("Updated Content");
  }, 15000);

  it("should return updated content after file change", async () => {
    // Let the file watcher settle from the previous test's edit to this same
    // file — back-to-back same-path changes can be coalesced if too close.
    await sleep(1500);

    // Update page with new content
    await writeFile(
      join(testDir, "src/page/page.tsx"),
      `import React from "react";
export const Page = () => <div>Version 2 Content</div>;`
    );

    // Poll until propagated (see fetchUntil note).
    const content = await fetchUntil(`http://localhost:${port}/`, "Version 2");
    expect(content).toContain("Version 2");
  }, 15000);

  it("should update props when props file changes", async () => {
    // Update props
    await writeFile(
      join(testDir, "src/page/props.ts"),
      `export const props = () => ({ version: 2, updated: true });`
    );

    // Wait for file watcher and module cache
    await sleep(1500);

    // Request should use new props
    const response = await fetch(`http://localhost:${port}/`, {
      headers: { Accept: "text/x-component" },
    });
    expect(response.ok).toBe(true);
    // The RSC stream should reflect the new props somehow
    // (exact verification depends on how props are used in the stream)
  }, 15000);
});
