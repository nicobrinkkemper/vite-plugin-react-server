import { describe, it, expect } from "vitest";
import { getSharedBuild } from "./shared-build.js";

describe("Race Condition Fix - FileWriter Chunk Validation", () => {

  it("should not fail with 'No chunks were written' error under normal conditions", { timeout: 30_000 }, async () => {
    // This test ensures that normal file writing works without race conditions
    await expect(
      getSharedBuild('test-project', 'race-condition-normal', {
        build: {
          pages: ["/"],
        },
        verbose: false,
      })
    ).resolves.not.toThrow();
  });

  it("should handle file.write.done errors without race condition", async () => {
    // This test specifically targets the race condition in file.write.done events
    const testEvent = "file.write.done";
    const errString = "Test error during file.write.done";
    
    await expect(
      getSharedBuild('test-project', 'race-condition-file-write-done', {
        build: {
          pages: ["/"],
        },
        verbose: false,
        onEvent: (event: any) => {
          if (event.type === testEvent) {
            throw new Error(errString);
          }
        },
      })
    ).rejects.toThrow(errString);
  });

  it("should handle file.write errors without race condition", async () => {
    // This test specifically targets the race condition in file.write events
    const testEvent = "file.write";
    const errString = "Test error during file.write";
    
    await expect(
      getSharedBuild('test-project', 'race-condition-file-write', {
        build: {
          pages: ["/"],
        },
        verbose: false,
        onEvent: (event: any) => {
          if (event.type === testEvent) {
            throw new Error(errString);
          }
        },
      })
    ).rejects.toThrow(errString);
  });

  it("should handle multiple builds without race conditions", async () => {
    // This test runs multiple builds sequentially to stress test the race condition fix
    for (let i = 0; i < 3; i++) {
      await expect(
        getSharedBuild('test-project', `race-condition-multiple-${i}`, {
          build: {
            pages: ["/"],
          },
          verbose: false,
        })
      ).resolves.not.toThrow();
      
    }
  });

  it("should handle rapid successive builds without race conditions", async () => {
    // This test runs builds in rapid succession to test timing issues
    for (let i = 0; i < 3; i++) {
      await expect(
        getSharedBuild('test-project', `race-condition-rapid-${i}`, {
          build: {
            pages: ["/", "/page2"],
          },
          verbose: false,
        })
      ).resolves.not.toThrow();
      
    }
  }, 15000); // 15 second timeout for 10 builds
});