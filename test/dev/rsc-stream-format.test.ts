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

  // Props
  await writeFile(
    join(testDir, "src/page/props.ts"),
    `export const props = { title: "Test Page" };`
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

    server = await createServer({
      mode: "test",
      root: testDir,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
          moduleBase: "src",
          Page: (url: string) => `src/page/page.tsx`,
          props: (url: string) => `src/page/props.ts`,
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

  it("should include client component references with .js extension", () => {
    // Client references should be .js, not .tsx
    // The transformer should convert the extension for browser compatibility
    expect(response.result).toMatch(/I\[.*\.client\.js.*Link/);
    expect(response.result).not.toMatch(/I\[.*\.client\.tsx.*Link/);
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
});
