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
  access,
} from "node:fs/promises";
import { join } from "node:path";

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

const dirExists = (dir: string) =>
  access(dir).then(
    () => true,
    () => false
  );

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

/**
 * Ensure `testDir` holds a fixture produced by `setupFn` (identified by
 * `fnHash`). Reuses the directory only when the marker's fnHash matches AND
 * the directory contents still hash to what setup produced; otherwise
 * discards and re-runs setup.
 *
 * Parallel vitest workers can race the initial setup of the same fixture
 * dir. The marker is written last, so a dir without a marker may be another
 * worker mid-setup — wait briefly for its marker before declaring the dir
 * stale. Setup is deterministic per fnHash, so concurrent re-setups
 * converge to identical content.
 */
export async function ensureFixture(
  testDir: string,
  setupFn: (testDir: string) => Promise<void>,
  fnHash: string,
  { markerWaitMs = 3_000 }: { markerWaitMs?: number } = {}
): Promise<EnsureFixtureResult> {
  let marker = await readMarker(testDir);

  if (!marker && (await dirExists(testDir))) {
    // dir without marker: possibly another worker mid-setup — give its
    // marker a moment to appear before treating the dir as a stale leftover
    const deadline = Date.now() + markerWaitMs;
    while (!marker && Date.now() < deadline) {
      await sleep(100);
      marker = await readMarker(testDir);
    }
  }

  if (marker && marker.fnHash === fnHash) {
    const dirHash = await hashDirContents(testDir);
    if (dirHash === marker.dirHash) {
      return { reused: true };
    }
  }

  await discardDir(testDir);
  await mkdir(testDir, { recursive: true });
  await setupFn(testDir);

  const dirHash = await hashDirContents(testDir);
  await writeFile(
    join(testDir, MARKER_FILE),
    JSON.stringify({ fnHash, dirHash } satisfies SetupMarker)
  );
  return { reused: false };
}
