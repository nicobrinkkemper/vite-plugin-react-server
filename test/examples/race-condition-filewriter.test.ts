import { describe, it, expect } from "vitest";
import { getSharedBuild } from "./shared-build.js";

describe("Race Condition Fix - FileWriter Chunk Validation", () => {

  // The whole file uses a unique `sharedTestName`
  // (`race-condition-filewriter`) so its fixture directory is isolated from
  // the rest of test/examples — without this, parallel test files using the
  // bare `'test-project'` name would tear down the fixture mid-test and
  // surface as "Could not resolve entry module 'src/components/
  // Link.client.tsx'". Per-test timeouts are generous on purpose: each "it"
  // runs full Vite builds (sometimes three in a row), and under the default
  // 5s the suite is reliably flaky on CI.

  it("should not fail with 'No chunks were written' error under normal conditions", { timeout: 30_000 }, async () => {
    await expect(
      getSharedBuild('race-condition-filewriter', 'race-condition-normal', {
        build: {
          pages: ["/"],
        },
        verbose: false,
      })
    ).resolves.not.toThrow();
  });

  it("should handle file.write.done errors without race condition", { timeout: 30_000 }, async () => {
    const testEvent = "file.write.done";
    const errString = "Test error during file.write.done";

    await expect(
      getSharedBuild('race-condition-filewriter', 'race-condition-file-write-done', {
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

  it("should handle file.write errors without race condition", { timeout: 30_000 }, async () => {
    const testEvent = "file.write";
    const errString = "Test error during file.write";

    await expect(
      getSharedBuild('race-condition-filewriter', 'race-condition-file-write', {
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

  it("should handle multiple builds without race conditions", { timeout: 60_000 }, async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        getSharedBuild('race-condition-filewriter', `race-condition-multiple-${i}`, {
          build: {
            pages: ["/"],
          },
          verbose: false,
        })
      ).resolves.not.toThrow();
    }
  });

  it("should handle rapid successive builds without race conditions", { timeout: 60_000 }, async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        getSharedBuild('race-condition-filewriter', `race-condition-rapid-${i}`, {
          build: {
            pages: ["/", "/page2"],
          },
          verbose: false,
        })
      ).resolves.not.toThrow();
    }
  });
});