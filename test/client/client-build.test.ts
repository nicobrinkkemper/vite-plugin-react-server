import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { setupTestProject } from "../setup.js";
import { doBuildStaticClient } from "./doBuildStaticClient.js";
import type { PluginEvent } from "vite-plugin-react-server/types";

const testDir = join(process.cwd(), "test/client/fixtures/client-build");
let events: PluginEvent[];

describe("RSC Worker (Client)", () => {
  beforeAll(async () => {
    // just to be save, remove the test directory
    await rm(testDir, { recursive: true, force: true });
    await setupTestProject(testDir);
    // set the events to test
    events = await doBuildStaticClient({
      projectRoot: testDir,
    });
  })

  afterAll(async () => {
    // comment below line to see the fixture directory
    await rm(testDir, { recursive: true, force: true });
  });

  
  it("should receive events", async () => {
    // check if the events are not empty
    expect(events.length).toBeGreaterThan(0);
  });

  // check if the events are of type PluginEvent
  it("should receive build.writeBundle.static-client", async () => {
    const eventOrder = events.map((e) => e.type);
    expect(eventOrder).toEqual(
      expect.arrayContaining([
        "build.writeBundle.static-client",
      ])
    );
  });

}); 