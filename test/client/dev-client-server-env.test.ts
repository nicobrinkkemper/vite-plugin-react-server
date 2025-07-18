import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClientDevServer } from "./createClientDevServer.js";
import type { ViteDevServer } from "vite";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { setupTestProjectEnv } from "../setup.js";
import { handleRSCStream } from "../rsc-stream.js";

let server: ViteDevServer;
let port = 1337; // use ports to avoid conflicts
let pageURL;
const testDir = join(process.cwd(), "test/client/fixtures/rsc-worker-env.test");

describe("RSC Worker (Client)", () => {
  beforeAll(async () => {
    // Clean up and create test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    await setupTestProjectEnv(testDir);

    server = await createClientDevServer(
      {
        projectRoot: testDir,
        moduleBaseURL: process.env.VITE_BASE_URL,
      },
      port
    );
    port = server.config.server.port;
    pageURL = `http://localhost:${port}/index.rsc`;
  });

  afterAll(async () => {
    await server?.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("should handle RSC requests and return streaming response", async () => {
    const { result } = await handleRSCStream(pageURL);

    // Verify the response contains RSC data
    expect(result).toContain("0:");
    expect(result).toContain("1:");
    expect(result).toContain(
      `"props":{"MODE":"test","BASE_URL":"${process.env.VITE_BASE_URL}","PROD":false,"DEV":true,"SSR":true,"PUBLIC_ORIGIN":"http://localhost:${port}"}}`
    );
    // console.log(result);
  });
});
