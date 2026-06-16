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

  it("rewrites the module to createServerReference proxies in the browser env", async () => {
    const result = await server.environments.client.transformRequest(
      "/src/server/actions.server.ts"
    );
    expect(result?.code).toContain("createServerReference");
    expect(result?.code).toContain("callServer");
    // Each export becomes a server-reference proxy, and the server-only body
    // (the original function source) is gone from the browser bundle.
    expect(result?.code).toContain("export const addItem");
    expect(result?.code).not.toContain("return { ok:");
  });

  it("also rewrites in the SSR environment (proxy is inert during render)", async () => {
    const result = await server.environments.ssr.transformRequest(
      "/src/server/actions.server.ts"
    );
    expect(result?.code).toContain("createServerReference");
  });

  it("the emitted proxy id round-trips through the server action endpoint", async () => {
    // The whole point: the id the proxy embeds must be the same id the server
    // resolves. Pull it out of the emitted proxy and POST it like callServer
    // would; the server should run addItem and return its result.
    const result = await server.environments.client.transformRequest(
      "/src/server/actions.server.ts"
    );
    const match = result?.code.match(
      /createServerReference\(\s*"([^"]+#addItem)"/
    );
    expect(match).toBeTruthy();
    const actionId = match![1];

    const res = await fetch(`http://localhost:${port}/`, {
      method: "POST",
      headers: {
        Accept: "text/x-component",
        "Content-Type": "application/json",
        "x-rsc-action": actionId,
      },
      body: JSON.stringify(["hello"]),
    });
    const text = await res.text();
    expect(text).toMatch(/^0:/); // RSC wire format, not an error
    expect(text).toContain("ok"); // addItem returns { ok: !!title }
    expect(text).toContain("true");
  });
});
