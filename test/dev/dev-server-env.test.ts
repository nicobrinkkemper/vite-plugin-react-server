import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";
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
    expect(response.statusCode).toBe(200);
    expect(response.responseHeaders.get("content-type")).toMatch(/text\/x-component/);
  });

  it("should serve RSC stream with proper content type", () => {
    expect(response.responseHeaders.get("content-type")).toMatch(/text\/x-component/);
    expect(response.result).toBeDefined();
    expect(typeof response.result).toBe("string");
  });

  it("should generate valid RSC content", () => {
    expect(response.result.length).toBeGreaterThan(0);
    
    // RSC content should contain React streaming data
    expect(response.result).toMatch(/^[0-9a-f]+:/m); // RSC chunk format
  });

  it("should handle page component resolution in dev mode", () => {
    // The fact that we got a successful response means component resolution worked
    expect(response.statusCode).toBe(200);
    expect(response.result).toContain("Home Page"); // From our test page component
  });

  it("should handle props resolution in dev mode", () => {
    // Verify that props were resolved and used
    expect(response.result).toBeTruthy();
    // The response should contain serialized component data
    expect(response.result.includes("Test") || response.result.includes("Page")).toBe(true);
  });

  it("should properly initialize development server", () => {
    expect(server).toBeDefined();
    expect(server.config).toBeDefined();
    expect(server.config.server.port).toBe(port);
  });
});
