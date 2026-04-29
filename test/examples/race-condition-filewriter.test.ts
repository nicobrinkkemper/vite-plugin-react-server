import { describe, it, expect } from "vitest";
import { getSharedBuild } from "./shared-build.js";

describe("Race Condition Fix - FileWriter Chunk Validation", () => {

  // Each test gets its own `dir`, which combined with the unique
  // `sharedTestName` puts every test on a fresh fixture directory.
  // Earlier we hit "Could not resolve entry module 'src/components/
  // Link.client.tsx'" in CI because tests 2 and 3 deliberately throw
  // mid-build via `onEvent` — Rollup's interrupted run was leaving the
  // shared fixture in a state that broke the later, normal-path tests
  // (4 and 5) that ran against the same directory. Per-test `dir`
  // isolates the failure modes from each other.

  it("should not fail with 'No chunks were written' error under normal conditions", { timeout: 30_000 }, async () => {
    await expect(
      getSharedBuild('race-condition-filewriter', 'race-condition-normal', {
        dir: "race-condition-normal",
        build: {
          pages: ["/"],
        },
        verbose: false,
      })
    ).resolves.not.toThrow();
  });

  it("should handle file.write.done errors without race condition", async () => {
    const testEvent = "file.write.done";
    const errString = "Test error during file.write.done";

    await expect(
      getSharedBuild('race-condition-filewriter', 'race-condition-file-write-done', {
        dir: "race-condition-file-write-done",
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
    const testEvent = "file.write";
    const errString = "Test error during file.write";

    await expect(
      getSharedBuild('race-condition-filewriter', 'race-condition-file-write', {
        dir: "race-condition-file-write",
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
    for (let i = 0; i < 3; i++) {
      await expect(
        getSharedBuild('race-condition-filewriter', `race-condition-multiple-${i}`, {
          dir: "race-condition-multiple",
          build: {
            pages: ["/"],
          },
          verbose: false,
        })
      ).resolves.not.toThrow();
    }
  });

  it("should handle rapid successive builds without race conditions", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        getSharedBuild('race-condition-filewriter', `race-condition-rapid-${i}`, {
          dir: "race-condition-rapid",
          build: {
            pages: ["/", "/page2"],
          },
          verbose: false,
        })
      ).resolves.not.toThrow();
    }
  }, 15000);
});