/**
 * Capture / restore helpers for e2e fixtures that mutate the sibling demo.
 *
 * Setup must capture originals BEFORE any write. Teardown restores or deletes
 * only when capture succeeded — a failed beforeAll must not truncate existing
 * files with empty defaults or delete unrelated demo sources.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type CapturedFile = {
  path: string;
  /** Bytes that existed before our write; `null` if the path was absent. */
  previous: string | null;
  /** True only after a successful capture (read or confirmed ENOENT). */
  captured: boolean;
};

/**
 * Snapshot a path's contents (or absence). Does not mutate the filesystem.
 */
export async function captureFile(path: string): Promise<CapturedFile> {
  try {
    const previous = await readFile(path, "utf8");
    return { path, previous, captured: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { path, previous: null, captured: true };
    }
    throw err;
  }
}

/**
 * Restore a previously captured path. No-op when capture never succeeded
 * (setup failed before this slot was snapshotted).
 */
export async function restoreFile(slot: CapturedFile | undefined): Promise<void> {
  if (!slot?.captured) return;
  if (slot.previous === null) {
    await unlink(slot.path).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
    return;
  }
  await mkdir(dirname(slot.path), { recursive: true });
  await writeFile(slot.path, slot.previous);
}

/**
 * Capture then write. Returns the capture slot for later restore.
 * If capture fails, nothing is written.
 */
export async function writeTracked(
  path: string,
  contents: string,
): Promise<CapturedFile> {
  const slot = await captureFile(path);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
  return slot;
}
