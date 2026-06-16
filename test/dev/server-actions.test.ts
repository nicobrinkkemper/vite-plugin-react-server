import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * Tests for server actions in dev mode.
 * Verifies:
 * 1. Server action ID is read from x-rsc-action header
 * 2. Response is in RSC wire format (0:<json>\n)
 * 3. Action result is returned correctly
 */

let server: ViteDevServer;
let port = 3111;
const testDir = resolve(__dirname, "../fixtures/server-actions.test");

async function setupTestFiles() {
  await mkdir(join(testDir, "src/server"), { recursive: true });
  await mkdir(join(testDir, "src/page"), { recursive: true });

  // Server action
  await writeFile(
    join(testDir, "src/server/actions.server.ts"),
    `"use server";

export async function addItem(title: string): Promise<{ success: boolean; id: number }> {
  // Simulate adding an item
  return { success: true, id: Date.now() };
}

export async function getItems(): Promise<string[]> {
  return ["item1", "item2", "item3"];
}

export async function failingAction(): Promise<void> {
  throw new Error("This action intentionally fails");
}
`
  );

  // Page component
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `import React from "react";
export const Page = () => <div>Test Page</div>;`
  );

  // Props
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `export const props = () => ({});`
  );
}

describe("Server Actions", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestFiles();

    // Symlink node_modules so react-server-dom-esm resolves from fixture dir
    const { symlink } = await import("node:fs/promises");
    const parentNodeModules = resolve(__dirname, "../../node_modules");
    const fixtureNodeModules = join(testDir, "node_modules");
    try { await symlink(parentNodeModules, fixtureNodeModules, "dir"); } catch {}

    server = await createServer({
      mode: "test",
      root: testDir,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          moduleBase: "src",
          Page: () => `src/page/page.tsx`,
          props: () => `src/page/props.ts`,
        }),
      ],
      server: { port },
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
    });

    await server.listen();
    port = server.config?.server?.port ?? port;
  });

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("should execute server action and return RSC format response", async () => {
    const response = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: {
        "Accept": "text/x-component",
        "Content-Type": "application/json",
        "x-rsc-action": "/src/server/actions.server.ts#addItem",
      },
      body: JSON.stringify(["test item"]),
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get("Content-Type")).toContain("text/x-component");

    const text = await response.text();
    // Should be in RSC wire format: 0:<json>\n
    expect(text).toMatch(/^0:/);
    expect(text).toContain("success");
    expect(text).toContain("true");
    expect(text).toContain("id");
  });

  it("should handle server action returning array", async () => {
    const response = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: {
        "Accept": "text/x-component",
        "Content-Type": "application/json",
        "x-rsc-action": "/src/server/actions.server.ts#getItems",
      },
      body: JSON.stringify([]),
    });

    expect(response.ok).toBe(true);

    const text = await response.text();
    expect(text).toMatch(/^0:/);
    expect(text).toContain("item1");
    expect(text).toContain("item2");
    expect(text).toContain("item3");
  });

  it("should return error for failing action", async () => {
    const response = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: {
        "Accept": "text/x-component",
        "Content-Type": "application/json",
        "x-rsc-action": "/src/server/actions.server.ts#failingAction",
      },
      body: JSON.stringify([]),
    });

    const text = await response.text();
    // Error is returned in the response body
    expect(text).toContain("intentionally fails");
  });

  it("should return error for non-existent action", async () => {
    const response = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: {
        "Accept": "text/x-component",
        "Content-Type": "application/json",
        "x-rsc-action": "/src/server/actions.server.ts#nonExistentAction",
      },
      body: JSON.stringify([]),
    });

    const text = await response.text();
    // Should indicate action not found in response. The reference gate rejects an
    // unregistered/unknown export as "not a registered server reference".
    expect(text.toLowerCase()).toMatch(
      /not found|not a function|undefined|not a registered/
    );
  });
});
