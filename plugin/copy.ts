import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedUserOptions } from "./types.js";

export async function copy({
  src,
  dest,
  filters,
}: {
  src: string;
  dest: string;
    filters: ((src: string) => boolean)[];
}) {
  // handle file case first
  const stats = await stat(src);
  if (stats.isFile()) {
    // handle exclusions
    if (filters.some(f => f(src))) {
      return;
    }
    await copyFile(src, dest);
  } else if (stats.isDirectory()) {
    const entries = await readdir(src);
    await mkdir(dest, { recursive: true });
    for (const entry of entries) {
      copy({
        src: join(src, entry),
        dest: join(dest, entry),
        filters,
      });
    }
  } else {
    throw new Error(`Unknown file type: ${src}`);
  }
}
