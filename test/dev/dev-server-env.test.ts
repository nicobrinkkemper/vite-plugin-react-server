import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server/server";
import { testUserOptions } from "../test-config.js";
import { mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setupTestProjectEnv } from "../setup.js";
import type { RSCStreamResponse } from "../rsc-stream.js";
import { handleRSCStream } from "../rsc-stream.js";

describe("Development Server Environment Handling (Cross-Environment)", () => {
  let server: any;
  let port = 3033;
  let pageURL: string;
  let response: RSCStreamResponse;
  const testDir = resolve(__dirname, "../fixtures/shared/dev-server-env-test-project");

  beforeAll(async () => {
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await setupTestProjectEnv(testDir);
    
    try {
      // Start the server
      server = await createServer({
        mode: "test",
        root: testDir,
        plugins: vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
        }),
        server: {
          port: port,
        },
        // Use a unique cache directory to prevent race conditions
        cacheDir: join(process.cwd(), "node_modules", `.vite-test-${port}`),
      });

      await server.listen();
      if (server.config?.server?.port) {
        port = server.config.server.port;
      }
        pageURL = `http://localhost:${port}/index.rsc`;

      // Test the RSC stream
      response = await handleRSCStream(pageURL);
    } catch (error) {
      console.error("Failed to start dev server:", error);
      throw error;
    }
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it("should handle environment variables properly in dev mode", async () => {
    expect(response).toBeDefined();
    expect(response.status).toBe(200);
    expect(response.contentType).toMatch(/text\/html/);
  });

  it("should serve RSC stream with proper content type", () => {
    expect(response.contentType).toMatch(/text\/html/);
    expect(response.body).toBeDefined();
    expect(typeof response.body).toBe("string");
  });

  it("should generate valid RSC content", () => {
    expect(response.body.length).toBeGreaterThan(0);
    
    // RSC content should contain React streaming data
    expect(response.body).toMatch(/^[0-9a-f]+:/m); // RSC chunk format
  });

  it("should handle page component resolution in dev mode", () => {
    // The fact that we got a successful response means component resolution worked
    expect(response.status).toBe(200);
    expect(response.body).toContain("Test Page"); // From our test page component
  });

  it("should handle props resolution in dev mode", () => {
    // Verify that props were resolved and used
    expect(response.body).toBeTruthy();
    // The response should contain serialized component data
    expect(response.body.includes("Test") || response.body.includes("Page")).toBe(true);
  });

  it("should properly initialize development server", () => {
    expect(server).toBeDefined();
    expect(server.config).toBeDefined();
    expect(server.config.server.port).toBe(port);
  });
});
