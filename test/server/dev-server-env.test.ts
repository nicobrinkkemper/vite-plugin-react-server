import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server/server";
import { testUserOptions } from "../test-config.js";
import { mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setupTestProjectEnv } from "../setup.js";
import type { RSCStreamResponse } from "../rsc-stream.js";
import { handleRSCStream } from "../rsc-stream.js";

let server,
  port = 3033;
const pageURL = `http://localhost:${port}/index.rsc`;
let response: RSCStreamResponse;
const testDir = resolve(__dirname, "../fixtures/dev-server-env.test");

describe("RSC Server", () => {
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
      response = await handleRSCStream(pageURL);
    } catch (error) {
      console.log("error", error);
    }
  });

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("Should have the right headers", async () => {
    if(!response) {
      throw new Error("Response is not defined");
    }
    expect(response?.ok).toBe(true);
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
      `["Public Origin: ","http://localhost:${port}"]`
    );
    expect(response.result).toContain(`{"children":["URL: ","${process.env.VITE_BASE_URL ?? '/'}"]}`);
    expect(response.result).toContain(`["Dev: ",true]`);
    expect(response.result).toContain(
      `[["Page","${testDir}/src/page/page.tsx",`
    );
  });
});
