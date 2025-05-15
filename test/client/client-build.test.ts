import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { doDevServer } from "./doDevServer.js";
import type { ViteDevServer } from "vite";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { setupTestProject } from "../setup.js";
import { MessageChannel } from "node:worker_threads";
import { resolveEnv } from "../../plugin/config/resolveEnv.js";
import { doBuildClientOnly } from "./doBuildClientOnly.js";

describe("RSC Worker (Client)", () => {
  const testDir = join(process.cwd(), "test/client/fixtures/client-build");
  let events: any;
  beforeAll(async () => {
    // Clean up and create test directory
    await setupTestProject(testDir);
    events = await doBuildClientOnly({
      projectRoot: testDir,
    });
    console.log(events);
    //console.log("Server is listening on port", server.config.server.port);
  }, 10000); // 10s timeout for server setup

  afterAll(async () => {
   // await server.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it("should build client with react-server condition", async () => {
    expect(events.length).toBeGreaterThan(0);
  }); 

}); 