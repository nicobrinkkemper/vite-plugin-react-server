import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
import { testUserOptions } from "../test-config";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { handleRSCStream, type RSCStreamResponse } from "../rsc-stream.js";

/**
 * Tests for RSC stream format correctness.
 * These tests verify the bugs we've fixed:
 * 1. Client component references should use .js extension, not .tsx
 * 2. CSS should be included in the stream
 * 3. Root component should wrap Page
 */

let server: ViteDevServer;
let port = 3110;
let response: RSCStreamResponse;
const testDir = resolve(__dirname, "../fixtures/rsc-stream-format.test");

async function setupTestFiles() {
  // Create a minimal project structure
  await mkdir(join(testDir, "src/components"), { recursive: true });
  await mkdir(join(testDir, "src/page"), { recursive: true });

  // Client component with onClick (was causing serialization error)
  await writeFile(
    join(testDir, "src/components/Link.client.tsx"),
    `"use client";
import React from "react";
export const Link = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <a href={to} onClick={(e) => { e.preventDefault(); }}>{children}</a>
);`
  );

  // CSS file
  await writeFile(
    join(testDir, "src/page/styles.module.css"),
    `.container { color: red; }`
  );

  // Page component that uses the client component and CSS
  await writeFile(
    join(testDir, "src/page/page.tsx"),
    `import React from "react";
import { Link } from "../components/Link.client.js";
import styles from "./styles.module.css";

export const Page = ({ title }: { title: string }) => (
  <div className={styles.container}>
    <h1>{title}</h1>
    <Link to="/about">About</Link>
  </div>
);`
  );

  // Props (function that takes url)
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `export const props = (url: string) => ({ title: "Test Page", url });`
  );

  // Async props page
  await mkdir(join(testDir, "src/page/async-props"), { recursive: true });
  await writeFile(
    join(testDir, "src/page/async-props/page.tsx"),
    `import React from "react";
export const Page = ({ items }: { items: string[] }) => (
  <div><h1>Async Props</h1>{items.map((i, idx) => <p key={idx}>{i}</p>)}</div>
);`
  );
  await writeFile(
    join(testDir, "src/page/async-props/props.ts"),
    `export const props = async () => {
  await new Promise(r => setTimeout(r, 10));
  return { items: ["a", "b", "c"] };
};`
  );

  // Root component (optional, uses default if not provided)
  await writeFile(
    join(testDir, "src/Root.tsx"),
    `import React from "react";
import { Css } from "vite-plugin-react-server/components";

export const Root = ({ Page, pageProps, cssFiles }: any) => (
  <>
    <Page {...pageProps} />
    <Css cssFiles={cssFiles} />
  </>
);`
  );

  // Vite config would be implicit via test setup
}

describe("RSC Stream Format", () => {
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
          Page: (url: string) => {
            if (url.startsWith("/async-props")) return `src/page/async-props/page.tsx`;
            return `src/page/page.tsx`;
          },
          props: (url: string) => {
            if (url.startsWith("/async-props")) return `src/page/async-props/props.ts`;
            return `src/page/props.ts`;
          },
          Root: "src/Root.tsx",
        }),
      ],
      server: { port },
      cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
    });

    await server.listen();
    port = server.config?.server?.port ?? port;
    response = await handleRSCStream(`http://localhost:${port}/index.rsc`);
  });

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("should include client component references with the dev .tsx extension", () => {
    // In DEV the browser imports client modules through Vite, which transpiles
    // .tsx on the fly — so the client-reference id keeps its real .tsx path.
    // Extension mapping to .js happens only in a BUILD (where the browser loads
    // the compiled .js). Forcing .js in dev produced a phantom
    // "<name>.client.js.tsx" import that 404'd on the second HMR fetch and broke
    // Fast Refresh after the first edit.
    expect(response.result).toMatch(/I\[.*Link\.client.*\.tsx.*Link/);
    expect(response.result).not.toMatch(/I\[.*\.client\.js[^.].*Link/);
  });

  it("should include Root component in the stream", () => {
    // The stream should show Root wrapping the Page
    expect(response.result).toContain('"name":"Root"');
  });

  it("should have cssFiles prop in Root component", () => {
    // Root component should receive cssFiles prop
    // In dev mode, CSS content may be empty since module graph is lazily populated
    // But the structure should be correct
    expect(response.result).toContain("cssFiles");
    expect(response.result).toContain('"name":"Css"');  // Css component in stream
  });

  it("should not have onClick handlers in client component references", () => {
    // The onClick handler should NOT be serialized in the RSC stream
    // Client references should be placeholders, not actual functions
    expect(response.result).not.toContain("onClick");
  });

  it("should have proper RSC stream structure", () => {
    // Basic structure checks
    expect(response.result).toContain("0:");  // Has chunks
    expect(response.ok).toBe(true);
    expect(response.statusCode).toBe(200);
  });

  it("should resolve async props functions", async () => {
    // Test async props page
    const asyncResponse = await handleRSCStream(`http://localhost:${port}/async-props/index.rsc`);
    expect(asyncResponse.ok).toBe(true);
    // Verify the async props were resolved (items array should be in the stream)
    expect(asyncResponse.result).toContain('"items"');
    // Should contain the actual values
    expect(asyncResponse.result).toMatch(/"a".*"b".*"c"/);
  });
});
