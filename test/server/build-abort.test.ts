import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { resolve } from "path";
import { doBuild } from "../doBuild.js";
import { getCondition } from "vite-plugin-react-server/config";
import { setupTestProject } from "../setup.js";
import { mkdirSync } from "fs";

if (getCondition() !== "react-server") {
  throw new Error("This test is only valid in a react-server environment");
}

describe("Plugin build abort test", () => {
  const testDir = resolve(__dirname, "../fixtures/build-abort.test");
  
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await setupTestProject(testDir);
  });
  
  afterAll(async () => {
    try {
      //  await rm(testDir, { recursive: true, force: true });
    } catch {}
  });


  it("should abort build when abort condition is triggered in onEvent vite:plugin-react-server/static", async () => {
    const testEvents = ["build.writeBundle.static", "build.start"];

    for (const testEvent of testEvents) {
      const errString = "Build cancelled (" + testEvent + ")";
      await expect(
        doBuild({
          projectRoot: testDir,
          build: {
            pages: ["/"],
          },
          panicThreshold: "all_errors",
          onEvent: (event) => {
            console.log(
              "onEvent",
              event.type,
              testEvent,
              event.type === testEvent
            );
            if (event.type === testEvent) {
              throw new Error(errString);
            }
          },
        })
      ).rejects.toThrow(
        `[vite:plugin-react-server/${getCondition("")}-static] ` + errString
      );
    }
  });

  it("should abort build when abort condition is triggered in onEvent vite:plugin-react-server/client", async () => {
    const testEvents = [
      // client is the ssr-client build
      "build.writeBundle.client",
      // static-client is the browser build
      "build.writeBundle.client",
    ];

    for (const testEvent of testEvents) {
      const errString = "Build cancelled (" + testEvent + ")";
      await expect(
        doBuild({
          projectRoot: testDir,
          build: {
            pages: ["/"],
          },
          onEvent: (event) => {
            if (event.type === testEvent) {
              throw new Error(errString);
            }
          },
        })
      ).rejects.toThrowError(
        "[vite:plugin-react-server/client] " + errString
      );
    }
  });

  it("should abort build when abort condition is triggered in onEvent vite:plugin-react-server/server", async () => {
    const testEvents = [
      "build.writeBundle.server",
      // server-static is handled by the static plugin
    ];

    for (const testEvent of testEvents) {
      const errString = "Build cancelled (" + testEvent + ")";
      await expect(
        doBuild({
          projectRoot: testDir,
          build: {
            pages: ["/"],
          },
          onEvent: (event) => {
            if (event.type === testEvent) {
              throw new Error(errString);
            }
          },
        })
      ).rejects.toThrowError(
        "[vite:plugin-react-server/server] " + errString
      );
    }
  });

  it("should abort build when abort condition is triggered in onEvent vite:plugin-react-server/static during file.write, file.write.done", async () => {
    const testEvents = ["file.write", "file.write.done"];

    for (const testEvent of testEvents) {
      const errString = "Build cancelled (" + testEvent + ")";
      await expect(
        doBuild({
          projectRoot: testDir,
          build: {
            pages: ["/"],
          },
          verbose: false,
          panicThreshold: "all_errors",
          onEvent: (event) => {
            if (event.type === testEvent) {
              throw new Error(errString);
            }
          },
        })
      ).rejects.toThrow(
        `[vite:plugin-react-server/${getCondition("")}-static] ` + errString
      );
    }
  });
});
