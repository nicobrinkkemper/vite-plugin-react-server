import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server/server";
import { testUserOptions } from "../test-config.js";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setupTestProjectEnv } from "../setup.js";
import { handleRSCStream, RSCStreamResponse } from "../rsc-stream.js";

let server,
  port = 3033;
let pageURL = `http://localhost:${port}/index.rsc`;
let response: RSCStreamResponse;
const testDir = resolve(__dirname, "../fixtures/dev-server-env.test");

describe("RSC Server", () => {
  beforeAll(async () => {
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestProjectEnv(testDir);
    try {
      // Start the server
      server = await createServer({
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
      response = await handleRSCStream(pageURL);
    } catch (error) {
      console.log("error", error);
    }
  });

  afterAll(async () => {
    await server.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("Should have the right headers", async () => {
    expect(response.ok).toBe(true);
    expect(response.statusCode).toBe(200);
    const contentLength = response.responseHeaders.get("content-length");
    if (contentLength != null && !isNaN(Number(contentLength))) {
      expect(Number(contentLength)).toBeGreaterThan(0);
    }
    expect(response.responseHeaders).toBeInstanceOf(Headers);
    expect(
      response.responseHeaders.get("content-type")?.includes("text/x-component")
    ).toBe(true);
  });

  it("should handle RSC requests and return streaming response", async () => {
    // Verify the response contains RSC data
    // console.log("result", response);

    // Verify the response contains RSC data
    expect(response.result).toContain("0:");
    expect(response.result).toContain("1:");
    expect(response.result).toContain(
      "/* @__PURE__ */ __vite_ssr_import_0__.default.createElement"
    );
    expect(response.result).toContain(
      `["Public: ","http://localhost:${port}"]`
    );
    expect(response.result).toContain(`{"children":["URL: ","/"]}`);
    expect(response.result).toContain(`["Dev: ",true]`);
    expect(response.result).toContain(
      `[["Page","${testDir}/src/page/page.tsx",`
    );
  });
});
