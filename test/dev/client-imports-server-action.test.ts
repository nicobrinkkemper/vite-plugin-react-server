import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";

/**
 * Guard for the "client component imports a 'use server' module" footgun.
 *
 * A "use server" module must never reach the browser bundle. It only lands in
 * the client (browser) environment when a "use client" component imports it
 * directly — which would bundle server-only code into the browser and crash
 * cryptically at runtime. The transformer fails fast in env=client with a clear
 * message pointing at the props pattern. SSR and the RSC server environment
 * still handle "use server" normally.
 */

let server: ViteDevServer;
const port = 3133;
const testDir = resolve(__dirname, "../fixtures/client-imports-server.test");

describe("Client importing a 'use server' module", () => {
  beforeAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(join(testDir, "src/server"), { recursive: true });
    await mkdir(join(testDir, "src/page"), { recursive: true });

    await writeFile(
      join(testDir, "src/server/actions.server.ts"),
      `"use server";
export async function addItem(title: string): Promise<{ ok: boolean }> {
  return { ok: !!title };
}
`
    );
    await writeFile(
      join(testDir, "src/page/page.tsx"),
      `import React from "react";
export const Page = () => <div>Test Page</div>;`
    );
    await writeFile(
      join(testDir, "src/page/props.ts"),
      `export const props = () => ({});`
    );

    const parentNodeModules = resolve(__dirname, "../../node_modules");
    const fixtureNodeModules = join(testDir, "node_modules");
    try {
      await symlink(parentNodeModules, fixtureNodeModules, "dir");
    } catch {}

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
    });
    await server.listen();
  });

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("fails fast in the browser (client) environment with a clear message", async () => {
    await expect(
      server.environments.client.transformRequest(
        "/src/server/actions.server.ts"
      )
    ).rejects.toThrow(/reached the browser bundle/i);
  });

  it("does NOT reject the same module in the SSR environment", async () => {
    // SSR runs server-side (Node) — a "use server" module is fine there.
    await expect(
      server.environments.ssr.transformRequest("/src/server/actions.server.ts")
    ).resolves.toBeTruthy();
  });
});
