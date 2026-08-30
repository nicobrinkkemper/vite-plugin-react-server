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

/**
 * Write a source file and notify Vite of the change. This test exercises vprs's
 * HMR *logic* (hotUpdate -> invalidate -> RSC re-render), not the OS file
 * watcher: native fs events (inotify) are unreliable in CI containers, where the
 * edit otherwise goes undetected and hotUpdate never fires. Emitting the change
 * on server.watcher triggers Vite's onFileChange -> the plugin hotUpdate hooks
 * deterministically, on any environment.
 */
async function writeAndNotify(relPath: string, content: string) {
  const abs = join(testDir, relPath);
  await writeFile(abs, content);
  server.watcher.emit("change", abs);
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

    // Modify the page file and notify Vite.
    await writeAndNotify(
      "src/page/page.tsx",
      `import React from "react";
export const Page = () => <div>Updated Content</div>;`
    );

    // Poll until the change propagates (hotUpdate -> invalidate -> re-render).
    const afterContent = await fetchUntil(
      `http://localhost:${port}/`,
      "Updated Content"
    );

    expect(afterContent).toContain("Updated Content");

    // The browser only refetches on receipt of this custom event (useRscHmr) —
    // server-side invalidation alone is a false pass where every open tab keeps
    // showing pre-edit content until a manual reload. Regression guard: on
    // Vite 8 the environment moved off the hotUpdate options bag onto the hook
    // context, which silenced this push under the react-server orchestrator.
    const updateEvents = events.filter(
      (e) =>
        e.type === "custom" &&
        e.event === "vite-plugin-react-server:server-component-update"
    );
    expect(updateEvents.length).toBeGreaterThan(0);
  }, 15000);

  it("should return updated content after file change", async () => {
    // Update page with new content and notify Vite.
    await writeAndNotify(
      "src/page/page.tsx",
      `import React from "react";
export const Page = () => <div>Version 2 Content</div>;`
    );

    // Poll until propagated (see fetchUntil note).
    const content = await fetchUntil(`http://localhost:${port}/`, "Version 2");
    expect(content).toContain("Version 2");
  }, 15000);

  it("should update props when props file changes", async () => {
    // Update props and notify Vite
    await writeAndNotify(
      "src/page/props.ts",
      `export const props = () => ({ version: 2, updated: true });`
    );

    // Wait for module cache to settle
    await sleep(1500);

    // Request should use new props
    const response = await fetch(`http://localhost:${port}/`, {
      headers: { Accept: "text/x-component" },
    });
    expect(response.ok).toBe(true);
    // The RSC stream should reflect the new props somehow
    // (exact verification depends on how props are used in the stream)
  }, 15000);

  it("should push a refetch when content outside src changes", async () => {
    // Markdown the page reads through a `?raw` glob: outside the module base
    // and without a script extension, so path/extension heuristics never see
    // it as a server edit. The server module graph does.
    await mkdir(join(testDir, "content"), { recursive: true });
    await writeFile(join(testDir, "content/note.md"), "note: first draft");
    await writeAndNotify(
      "src/page/props.ts",
      `const notes = import.meta.glob("../../content/*.md", { query: "?raw", import: "default", eager: true });
export const props = () => ({ note: Object.values(notes)[0] });`
    );
    await writeAndNotify(
      "src/page/page.tsx",
      `import React from "react";
export const Page = ({ note }) => <div>{note}</div>;`
    );
    const before = await fetchUntil(`http://localhost:${port}/`, "first draft");
    expect(before).toContain("first draft");
    // The dev:ssr hook dedupes hotUpdate calls with a short processing
    // window after each edit; let the two setup writes above clear it so the
    // content edit below is judged on its own.
    await sleep(300);

    const events: Array<{ type: string; event?: string; data?: any }> = [];
    const originalSend = server.ws.send.bind(server.ws);
    server.ws.send = function (payload: any) {
      if (payload && typeof payload === "object") events.push(payload);
      return originalSend(payload);
    };
    try {
      await writeAndNotify("content/note.md", "note: second draft");

      const after = await fetchUntil(`http://localhost:${port}/`, "second draft");
      expect(after).toContain("second draft");

      const pushed = events.filter(
        (e) =>
          e.type === "custom" &&
          e.event === "vite-plugin-react-server:server-component-update" &&
          e.data?.file === "content/note.md"
      );
      expect(pushed.length).toBeGreaterThan(0);
    } finally {
      server.ws.send = originalSend;
    }
  }, 20000);
});
