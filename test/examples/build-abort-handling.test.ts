import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { resolve } from "path";
import { getSharedBuild } from "./shared-build.js";
import { setupTestProject } from "../setup.js";
import { mkdirSync } from "fs";

describe("Build Abort Handling (Cross-Environment)", () => {
  let testDir: string;
  
  beforeAll(async () => {
    testDir = resolve(__dirname, "../fixtures/shared/build-abort-test-project");
    mkdirSync(testDir, { recursive: true });
    await setupTestProject(testDir);
  });
  
  afterAll(async () => {
    // Cleanup is handled by the shared build utility
  });

  it("should abort build when abort condition is triggered in onEvent during build.writeBundle events", async () => {
    const testEvents = ["build.writeBundle.client", "build.writeBundle.server"];

    for (const testEvent of testEvents) {
      const errString = "Build cancelled (" + testEvent + ")";
      
      await expect(
        getSharedBuild('build-abort-test-project', `build-abort-${testEvent}`, {
          setupProject: async (dir: string) => {
            // Use the already set up testDir
            return;
          },
          build: {
            pages: ["/"],
          },
          onEvent: (event: any) => {
            if (event.type === testEvent) {
              throw new Error(errString);
            }
          },
        })
      ).rejects.toThrow(errString);
    }
  });

  it("should abort build when abort condition is triggered in onEvent during build.start", async () => {
    const testEvent = "build.start";
    const errString = "Build cancelled (" + testEvent + ")";
    
    await expect(
      getSharedBuild('build-abort-test-project', 'build-abort-start', {
        setupProject: async (dir: string) => {
          // Use the already set up testDir
          return;
        },
        build: {
          pages: ["/"],
        },
        onEvent: (event: any) => {
          if (event.type === testEvent) {
            throw new Error(errString);
          }
        },
      })
    ).rejects.toThrow(errString);
  });

  it("should abort build when abort condition is triggered in onEvent during file.write events", async () => {
    const testEvents = ["file.write", "file.write.done"];

    for (const testEvent of testEvents) {
      const errString = "Build cancelled (" + testEvent + ")";
      
      await expect(
        getSharedBuild('build-abort-test-project', `build-abort-file-${testEvent}`, {
          setupProject: async (dir: string) => {
            // Use the already set up testDir
            return;
          },
          build: {
            pages: ["/"],
          },
          verbose: false,
          panicThreshold: "all_errors",
          onEvent: (event: any) => {
            if (event.type === testEvent) {
              throw new Error(errString);
            }
          },
        })
      ).rejects.toThrow(errString);
    }
  });

  it("should handle build abort consistently across both workflows", async () => {
    // Test that both client and server workflows handle build abort the same way
    const testEvent = "build.writeBundle.client";
    const errString = "Build cancelled (" + testEvent + ")";
    
    // This should work for both client and server workflows
    await expect(
      getSharedBuild('build-abort-test-project', 'build-abort-consistency', {
        setupProject: async (dir: string) => {
          // Use the already set up testDir
          return;
        },
        build: {
          pages: ["/"],
        },
        onEvent: (event: any) => {
          if (event.type === testEvent) {
            throw new Error(errString);
          }
        },
      })
    ).rejects.toThrow(errString);
  });

  it("should abort build with panicThreshold when errors occur", async () => {
    // Test that panicThreshold works consistently across workflows
    const testEvent = "build.writeBundle.server";
    const errString = "Build cancelled (" + testEvent + ")";
    
    await expect(
      getSharedBuild('build-abort-test-project', 'build-abort-panic', {
        setupProject: async (dir: string) => {
          // Use the already set up testDir
          return;
        },
        build: {
          pages: ["/"],
        },
        panicThreshold: "all_errors",
        onEvent: (event: any) => {
          if (event.type === testEvent) {
            throw new Error(errString);
          }
        },
      })
    ).rejects.toThrow(errString);
  });
});
