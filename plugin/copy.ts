import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function copy({
  src,
  dest,
  exclude,
  include,
}: {
  src: string;
  dest: string;
  exclude: ((src: string) => boolean)[];
  include?: ((src: string) => boolean)[];
}) {
  // handle file case first
  const stats = await stat(src);
  if (stats.isFile()) {
    // handle exclusions
    if (exclude && exclude.some((f) => f(src))) {
      return;
    } else if (!include || include.some((f) => f(src))) {
      await copyFile(src, dest);
    }
  } else if (stats.isDirectory()) {
    const entries = await readdir(src);
    const filtered = entries.filter((entry) => {
      const newSrc = join(src, entry);
      if (exclude && exclude.some((f) => f(newSrc))) {
        return false;
      } else if (!include || include.some((f) => f(newSrc))) {
        return true;
      } else {
        return false;
      }
    });
    if(!filtered.length) {
      return;
    }
    await mkdir(dest, { recursive: true });
    for (const entry of filtered) {
      let newSrc = join(src, entry);
      copy({
        src: newSrc,
        dest: join(dest, entry),
        exclude: exclude,
        include: include,
      });
    }
  }
}
