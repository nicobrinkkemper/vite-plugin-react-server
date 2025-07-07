import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ViteDevServer } from "vite";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { setupTestProject } from "../setup.js";
import { createClientDevServer } from "./createClientDevServer.js";

describe("RSC Worker (Client)", () => {
  let server: ViteDevServer, port = 5176;
  const testDir = join(process.cwd(), "test/client/fixtures/rsc-worker");
  let pageURL;
  beforeAll(async () => {
    // Set up environment variables
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestProject(testDir);

    server = await createClientDevServer({
      projectRoot: testDir,
    }, port);
    port = server.config.server.port;
    pageURL = `http://localhost:${port}/index.rsc`;
    //console.log("Server is listening on port", server.config.server.port);
  }); 

  afterAll(async () => {
    try {
      await server?.close();
    } catch {
    }
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
    }
  });

  it("should handle RSC requests and return streaming response", async () => {
    const response = await fetch(pageURL, {
      headers: {
        Accept: "text/x-component; charset=utf-8",
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/x-component; charset=utf-8"
    );

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
        if (done) break;

        // Decode each chunk and append to result
        const chunk = decoder.decode(value, { stream: true });
        result += chunk;

        // Log each chunk for debugging
        // console.log("Received chunk:", chunk);
      }
    } finally {
      reader.releaseLock();
    }

    // Log final result for debugging
    // console.log("Final response:", result);

    // Verify the response contains RSC data
    expect(result).toContain("0:");
    expect(result).toContain("1:");
  });

  it("should handle requests", async () => {
    // Make a request to trigger HMR
    const response = await fetch(pageURL);
    expect(response.status).toBe(200);

    // The server should be ready to handle HMR updates
    expect(server.ws).toBeDefined();
  }); // 
});
