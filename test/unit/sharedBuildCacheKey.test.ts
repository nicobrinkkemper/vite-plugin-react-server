import { describe, it, expect } from "vitest";
import { deriveSetupKey } from "../examples/shared-build.js";

/**
 * Pins the fix for the cascade-failure pattern observed on CI: 16 test
 * suites timed out at their setup hooks after one upstream test corrupted
 * the shared fixture, because `setupCache` keyed only on
 * `(sharedTestName, dir)` and didn't invalidate when the `setupProject`
 * function changed between runs.
 *
 * The fix: hash `setupProject.toString()` into the cache key so two
 * setups with the same name but different bodies get different keys (and
 * different fixture directories), and a setup whose body changes between
 * codebase edits invalidates the prior fixture.
 */

const fakeSetupA = async (_dir: string) => {
  const _written = ["file-a"];
};

const fakeSetupB = async (_dir: string) => {
  const _written = ["file-b"];
};

describe("deriveSetupKey (shared-build cache invalidation)", () => {
  it("returns the default 'test-project-…' key when setupProject is omitted", () => {
    expect(deriveSetupKey("any-name", {})).toBe("test-project-shared");
    expect(deriveSetupKey("any-name", { dir: "custom" })).toBe(
      "test-project-custom",
    );
  });

  it("includes a content-hash suffix when a custom setupProject is supplied", () => {
    const key = deriveSetupKey("my-fixture", { setupProject: fakeSetupA });
    expect(key).toMatch(/^my-fixture-shared-[0-9a-f]{8}$/);
  });

  it("produces the same key for identical setupProject bodies", () => {
    // Two declarations with the same body — `toString()` is identical.
    const a = async (_dir: string) => {
      return 1;
    };
    const b = async (_dir: string) => {
      return 1;
    };
    expect(deriveSetupKey("name", { setupProject: a })).toBe(
      deriveSetupKey("name", { setupProject: b }),
    );
  });

  it("produces different keys for different setupProject bodies", () => {
    const keyA = deriveSetupKey("name", { setupProject: fakeSetupA });
    const keyB = deriveSetupKey("name", { setupProject: fakeSetupB });
    expect(keyA).not.toBe(keyB);
  });

  it("produces different keys when the same setupProject is used with different dirs", () => {
    const keyShared = deriveSetupKey("name", {
      setupProject: fakeSetupA,
      dir: "shared",
    });
    const keyCustom = deriveSetupKey("name", {
      setupProject: fakeSetupA,
      dir: "custom",
    });
    expect(keyShared).not.toBe(keyCustom);
  });

  it("is deterministic — same inputs produce the same key", () => {
    const k1 = deriveSetupKey("name", { setupProject: fakeSetupA });
    const k2 = deriveSetupKey("name", { setupProject: fakeSetupA });
    expect(k1).toBe(k2);
  });
});
