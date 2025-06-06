import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server/server";
import { testUserOptions } from "../test-config";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setupTestProject } from "../setup.js";
import { handleRSCStream, RSCStreamResponse } from "../rsc-stream.js";

let server,
  port = 3104,
  pageURL,
  response: RSCStreamResponse;
const testDir = resolve(__dirname, "../fixtures/rsc-server.test");

describe("RSC Server", () => {

  beforeAll(async () => {
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestProject(testDir);

    // Start the server
    server = await createServer({
      mode: "test",
      root: testDir,
      plugins: [
        vitePluginReactServer({
          ...testUserOptions,
          projectRoot: testDir,
        }),
      ],
      server: {
        port: port,
      },
    });

    await server.listen();
    if (server.config?.server?.port) {
      port = server.config.server.port;
    }
    pageURL = `http://localhost:${port}/index.rsc`;
    response = await handleRSCStream(pageURL);
  });

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("should have the right headers", async () => {
    expect(response.ok).toBe(true);
    expect(response.statusCode).toBe(200);
    expect(response.responseHeaders).toBeInstanceOf(Headers);
    const contentLength = response.responseHeaders.get("content-length");
    if (contentLength != null && !isNaN(Number(contentLength))) {
      expect(Number(contentLength)).toBeGreaterThan(0);
    }
    expect(
      response.responseHeaders.get("content-type")?.includes("text/x-component")
    ).toBe(true);
  });

  it("should handle RSC requests and return streaming response", async () => {
    // Verify the response contains RSC data
    //console.log("result", result);

    // Verify the response contains RSC data
    expect(response.result).toContain("0:");
    expect(response.result).toContain("1:");
  });
});
