import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import { vitePluginReactServer } from "../../dist/plugin/plugin.server";
import { testUserOptions } from "../test-config";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { setupTestProject } from "../setup.js";
import { doBuild } from "./doBuild.js";

describe("RSC Server", () => {
  let server;
  const testDir = join(process.cwd(), "test/server/fixtures/rsc-server");
  let pageURL = `http://localhost:5173/index.rsc`;

  beforeAll(async () => {

    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestProject(testDir);
    // await doBuild({
    //   projectRoot: testDir,
    // });
    
    // Start the server
    server = await createServer({
      root: testDir,
      plugins: [vitePluginReactServer({
        ...testUserOptions,
        projectRoot: testDir,
      })],
      logLevel: 'info'
    });

    await server.listen();
    pageURL = `http://localhost:${server.config.server.port}/index.rsc`;
  }, 10000); // 10s timeout for server setup

  afterAll(async () => {
    await server.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("should handle RSC requests and return streaming response", async () => {
    const response = await fetch(pageURL, {
      headers: {
        Accept: "text/x-component; charset=utf-8",
      },
    });
    expect(response.status).toBe(200);
    

    if (!response.body) {
      throw new Error("Response body is null");
    }

    // Read the streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        expect(response.headers.get("content-type")).toBe(
            "text/x-component; charset=utf-8"
          );
        if (done) break;

        // Decode each chunk and append to result
        const chunk = decoder.decode(value, { stream: true });
        result += chunk;
      }
    } finally {
      reader.releaseLock();
    }
    // Verify the response contains RSC data
    //console.log("result", result);
    
    // Verify the response contains RSC data
    expect(result).toContain("0:");
    expect(result).toContain("1:");
  }, 10000); // 10s timeout for the test

  it("should handle server restarts", async () => {
    // Make a request to trigger HMR
    const response = await fetch(pageURL);
    expect(response.status).toBe(200);

    // The server should be ready to handle restarts
    expect(server.ws).toBeDefined();
  }, 10000); // 10s timeout for the test
}); 