import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureFixture,
  hashSetupFn,
  hashDirContents,
} from "../examples/fixture-cache.js";

describe("fixture-cache", () => {
  let scratch: string;
  let testDir: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), "vprs-fixture-cache-"));
    testDir = join(scratch, "fixture");
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  const makeSetup = (marker: string) => {
    const setup = async (dir: string) => {
      await writeFile(join(dir, "src.txt"), `content-${marker}`);
    };
    return setup;
  };

  it("runs setup on first call and reuses the fixture on the second", async () => {
    const setup = makeSetup("a");
    const fnHash = hashSetupFn(setup);

    const first = await ensureFixture(testDir, setup, fnHash);
    expect(first.reused).toBe(false);

    const second = await ensureFixture(testDir, setup, fnHash);
    expect(second.reused).toBe(true);
  });

  it("invalidates when the setup function's content changes", async () => {
    // Distinct function literals: Function.prototype.toString hashes SOURCE,
    // so closure-value changes alone don't differ — source changes must.
    const setupA = async (dir: string) => {
      await writeFile(join(dir, "src.txt"), "content-a");
    };
    await ensureFixture(testDir, setupA, hashSetupFn(setupA));

    const setupB = async (dir: string) => {
      await writeFile(join(dir, "src.txt"), "content-b");
    };
    const result = await ensureFixture(testDir, setupB, hashSetupFn(setupB));
    expect(result.reused).toBe(false);
    expect(await readFile(join(testDir, "src.txt"), "utf-8")).toBe("content-b");
  });

  it("invalidates when extra hashed sources (e.g. test/setup.ts) change", () => {
    const setup = makeSetup("a");
    expect(hashSetupFn(setup, ["helpers v1"])).not.toBe(
      hashSetupFn(setup, ["helpers v2"])
    );
  });

  it("invalidates when fixture files are mutated after setup", async () => {
    const setup = makeSetup("a");
    const fnHash = hashSetupFn(setup);
    await ensureFixture(testDir, setup, fnHash);

    // an upstream test mutating the fixture at runtime
    await writeFile(join(testDir, "src.txt"), "mutated");

    const result = await ensureFixture(testDir, setup, fnHash);
    expect(result.reused).toBe(false);
    expect(await readFile(join(testDir, "src.txt"), "utf-8")).toBe("content-a");
  });

  it("invalidates when a fixture file is added after setup", async () => {
    const setup = makeSetup("a");
    const fnHash = hashSetupFn(setup);
    await ensureFixture(testDir, setup, fnHash);

    await writeFile(join(testDir, "extra.txt"), "surprise");

    const result = await ensureFixture(testDir, setup, fnHash);
    expect(result.reused).toBe(false);
  });

  it("re-runs setup when the directory exists without a marker", async () => {
    const setup = makeSetup("a");
    const fnHash = hashSetupFn(setup);
    await ensureFixture(testDir, setup, fnHash);
    await rm(join(testDir, ".setup-hash"), { force: true });

    const result = await ensureFixture(testDir, setup, fnHash);
    expect(result.reused).toBe(false);
  });

  it("serializes concurrent setup behind the lock — setup runs exactly once", async () => {
    let setupRuns = 0;
    const slowSetup = async (dir: string) => {
      setupRuns++;
      await new Promise((r) => setTimeout(r, 150)); // longer than the lock poll
      await writeFile(join(dir, "src.txt"), "content-slow");
    };
    const fnHash = hashSetupFn(slowSetup);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => ensureFixture(testDir, slowSetup, fnHash))
    );

    expect(setupRuns).toBe(1);
    expect(results.filter((r) => !r.reused)).toHaveLength(1);
    expect(results.filter((r) => r.reused)).toHaveLength(4);
  });

  it("steals a stale lock left by a crashed holder", async () => {
    const setup = makeSetup("a");
    const fnHash = hashSetupFn(setup);
    // a lock with an old mtime and no living holder
    await mkdir(`${testDir}.setup-lock`, { recursive: true });
    await utimes(
      `${testDir}.setup-lock`,
      new Date(Date.now() - 120_000),
      new Date(Date.now() - 120_000)
    );

    const result = await ensureFixture(testDir, setup, fnHash, {
      staleLockMs: 1_000,
    });
    expect(result.reused).toBe(false);
    expect(await readFile(join(testDir, "src.txt"), "utf-8")).toBe("content-a");
  });

  it("ignores build output (dist*) when hashing fixture contents", async () => {
    const setup = makeSetup("a");
    const fnHash = hashSetupFn(setup);
    await ensureFixture(testDir, setup, fnHash);

    const before = await hashDirContents(testDir);
    await writeFile(join(testDir, "dist-output.js"), "built artifact");
    const after = await hashDirContents(testDir);
    expect(after).toBe(before);

    const result = await ensureFixture(testDir, setup, fnHash);
    expect(result.reused).toBe(true);
  });
});
