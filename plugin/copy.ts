import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

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
      const dir = dirname(dest);
      // wait 'till last moment to prevent empty directories
      await mkdir(dir, { recursive: true });
      await copyFile(src, dest);
    }
  } else if (stats.isDirectory()) {
    const entries = await readdir(src);
    for (const entry of entries) {
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
