/**
 * fixture-cache.ts
 *
 * Content-hash-validated fixture setup for the shared-build harness.
 *
 * A fixture directory is reused only while it still matches what its setup
 * produced: a `.setup-hash` marker stores a hash of the setup function's
 * source AND a hash of the fixture dir's contents at setup time. Any
 * mismatch — setup code changed between commits, or a test mutated fixture
 * files at runtime — discards the dir and re-runs setup.
 *
 * Build outputs (dist*) are excluded from the content hash — builds write
 * into the fixture dir but don't make the fixture itself stale.
 */
import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
  rename,
  rm,
  mkdir,
  writeFile,
  stat,
} from "node:fs/promises";
import { join, dirname } from "node:path";

const MARKER_FILE = ".setup-hash";

/** Top-level (and nested) directory names that are build output, not fixture content. */
const isExcludedSegment = (segment: string) =>
  segment === "node_modules" ||
  segment === MARKER_FILE ||
  segment.startsWith("dist");

/**
 * Hash the setup function's own source plus any extra source strings
 * (e.g. the full text of test/setup.ts, which holds the helpers most
 * setupProject functions delegate to — Function.prototype.toString alone
 * misses changes inside those helpers).
 */
export function hashSetupFn(
  setupFn: (testDir: string) => Promise<void>,
  extraSources: string[] = []
): string {
  const hash = createHash("sha1");
  hash.update(setupFn.toString());
  for (const source of extraSources) {
    hash.update("\0");
    hash.update(source);
  }
  return hash.digest("hex");
}

/** Recursively hash relative paths + contents of a fixture dir, excluding build output. */
export async function hashDirContents(dir: string): Promise<string> {
  const files: string[] = [];

  async function walk(current: string, relPrefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return; // dir vanished mid-walk (parallel worker) — caller re-validates
    }
    for (const entry of entries) {
      if (isExcludedSegment(entry.name)) continue;
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(current, entry.name), rel);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  }

  await walk(dir, "");
  files.sort();

  const hash = createHash("sha1");
  for (const rel of files) {
    hash.update(rel);
    hash.update("\0");
    try {
      hash.update(await readFile(join(dir, rel)));
    } catch {
      hash.update("<unreadable>");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

interface SetupMarker {
  fnHash: string;
  dirHash: string;
}

async function readMarker(testDir: string): Promise<SetupMarker | null> {
  try {
    const raw = await readFile(join(testDir, MARKER_FILE), "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.fnHash === "string" && typeof parsed?.dirHash === "string") {
      return parsed;
    }
  } catch {
    // missing or corrupt marker — treat as stale
  }
  return null;
}

export interface EnsureFixtureResult {
  /** true when the existing fixture validated and setup was skipped */
  reused: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const LOCK_SUFFIX = ".setup-lock";

/** Atomic cross-process lock: mkdir succeeds for exactly one claimant. */
async function acquireLock(testDir: string): Promise<boolean> {
  // The lock lives NEXT TO the fixture, whose parent may not exist yet on a
  // fresh checkout (setup creates it after acquiring the lock). Create the
  // parent first — recursive mkdir is idempotent — then take the lock with a
  // NON-recursive mkdir, which is the atomic claim: exactly one EEXIST-free
  // winner. Anything other than EEXIST is a real error and must be loud,
  // not "lock held" — treating ENOENT as held spins forever with no lock to
  // wait on.
  await mkdir(dirname(testDir), { recursive: true });
  try {
    await mkdir(`${testDir}${LOCK_SUFFIX}`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

async function releaseLock(testDir: string): Promise<void> {
  await rm(`${testDir}${LOCK_SUFFIX}`, { recursive: true, force: true });
}

/** Lock age in ms, or null when no lock exists. */
async function lockAgeMs(testDir: string): Promise<number | null> {
  try {
    const s = await stat(`${testDir}${LOCK_SUFFIX}`);
    return Date.now() - s.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Discard a stale fixture without yanking the path out from under a parallel
 * vitest worker that chdir'd into it (doBuild does) — a plain rm -rf there
 * surfaces as `ENOENT: uv_cwd` crashing the whole worker. rename() keeps the
 * other process's cwd inode valid; the renamed corpse is deleted afterwards.
 */
async function discardDir(testDir: string): Promise<void> {
  const corpse = `${testDir}.stale-${process.pid}-${Date.now()}`;
  try {
    await rename(testDir, corpse);
  } catch {
    return; // already gone (parallel worker discarded it first)
  }
  await rm(corpse, { recursive: true, force: true });
}

async function fixtureIsValid(
  testDir: string,
  fnHash: string
): Promise<boolean> {
  const marker = await readMarker(testDir);
  if (!marker || marker.fnHash !== fnHash) return false;
  return (await hashDirContents(testDir)) === marker.dirHash;
}

/**
 * Ensure `testDir` holds a fixture produced by `setupFn` (identified by
 * `fnHash`). Reuses the directory only when the marker's fnHash matches AND
 * the directory contents still hash to what setup produced; otherwise
 * discards and re-runs setup.
 *
 * Setup is serialized by an atomic cross-process lock (mkdir of
 * `<dir>.setup-lock`): exactly one claimant sets up; everyone else waits on
 * the LOCK, not on a guessed timing grace. Nothing is ever discarded while
 * another claimant holds the lock — on heavily loaded machines a timing
 * grace expires while setup is still legitimately running, and the discard
 * then yanks the fixture out from under a live build (mass
 * "Could not resolve entry module" cascades). A lock left by a crashed
 * holder is stolen after `staleLockMs`.
 */
const DEBUG = !!process.env["VPRS_FIXTURE_DEBUG"];
const dbg = (msg: string) => {
  if (DEBUG) console.error(`[fixture ${process.pid}] ${msg}`);
};

export async function ensureFixture(
  testDir: string,
  setupFn: (testDir: string) => Promise<void>,
  fnHash: string,
  {
    lockTimeoutMs = 120_000,
    // Setup itself is sub-second; a lock this old means its holder died
    // (e.g. vitest terminated the worker on a hook timeout, skipping the
    // finally). Must stay well under hookTimeout: an orphaned lock that
    // outlives the hook ceiling times out every waiter's beforeAll.
    staleLockMs = 10_000,
  }: { lockTimeoutMs?: number; staleLockMs?: number } = {}
): Promise<EnsureFixtureResult> {
  const deadline = Date.now() + lockTimeoutMs;

  while (true) {
    // Wait for any in-flight setup FIRST, polling only the lock (one cheap
    // stat). Validation hashes the whole fixture dir — doing that inside the
    // wait loop lets starved waiters eat the CPU the setup needs.
    let age = await lockAgeMs(testDir);
    if (age !== null) dbg(`waiting on lock (age=${age}ms) ${testDir}`);
    while (age !== null) {
      if (age > staleLockMs) {
        dbg(`stealing stale lock (age=${age}ms) ${testDir}`);
        await releaseLock(testDir); // holder crashed — steal
        break;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `[fixture-cache] timed out after ${lockTimeoutMs}ms waiting for the setup lock on ${testDir}`
        );
      }
      await sleep(100);
      age = await lockAgeMs(testDir);
    }

    if (await fixtureIsValid(testDir, fnHash)) {
      dbg(`valid, reusing ${testDir}`);
      return { reused: true };
    }

    if (!(await acquireLock(testDir))) {
      dbg(`lost acquire race ${testDir}`);
      continue; // another claimant won the lock — go back to waiting
    }
    dbg(`acquired lock, setting up ${testDir}`);
    try {
      // Re-validate under the lock: another claimant may have completed
      // setup between our check and our acquisition.
      if (await fixtureIsValid(testDir, fnHash)) {
        return { reused: true };
      }
      await discardDir(testDir);
      await mkdir(testDir, { recursive: true });
      await setupFn(testDir);
      const dirHash = await hashDirContents(testDir);
      await writeFile(
        join(testDir, MARKER_FILE),
        JSON.stringify({ fnHash, dirHash } satisfies SetupMarker)
      );
      dbg(`setup complete ${testDir}`);
      return { reused: false };
    } finally {
      await releaseLock(testDir);
      dbg(`released lock ${testDir}`);
    }
  }
}
