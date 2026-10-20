import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

/**
 * The browser file the client build emitted for a source module, read from
 * that build's `.vite/manifest.json`.
 *
 * Browser chunks are named by Rollup's own `[hash]` of the emitted chunk, so
 * only the client build knows them. The builds that run after it (SSR, RSC)
 * name a client reference's file, and bake its hosted id into the flight
 * payload, from this lookup: one id then names the same file under
 * `moduleRootPath` (SSR) and `moduleBaseURL` (browser).
 */
export type ClientBuildManifestLookup = {
  /** Absolute path of the client build's manifest. */
  path: string;
  /** Whether the client build has written its manifest. */
  exists: () => boolean;
  /** The emitted file for a source module, or undefined when it has none. */
  fileOf: (sourceId: string) => string | undefined;
};

export function createClientBuildManifestLookup({
  projectRoot,
  outDir,
  staticDir,
}: {
  projectRoot: string;
  outDir: string;
  staticDir: string;
}): ClientBuildManifestLookup {
  const path = resolve(projectRoot, outDir, staticDir, ".vite/manifest.json");
  // Re-read when the client build rewrites it (several builds in one process).
  let cached: { mtimeMs: number; files: Map<string, string> } | undefined;

  const load = (): Map<string, string> | undefined => {
    if (!existsSync(path)) return undefined;
    const { mtimeMs } = statSync(path);
    if (cached?.mtimeMs !== mtimeMs) {
      const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<
        string,
        { file?: string; src?: string } | undefined
      >;
      const files = new Map<string, string>();
      for (const [key, entry] of Object.entries(manifest)) {
        if (entry?.file && /\.[cm]?js$/.test(entry.file)) {
          files.set(entry.src ?? key, entry.file);
        }
      }
      cached = { mtimeMs, files };
    }
    return cached.files;
  };

  return {
    path,
    exists: () => existsSync(path),
    fileOf: (sourceId) => load()?.get(manifestKey(projectRoot, sourceId)),
  };
}

/** Vite's manifest key for a module: its path from the root, posix, no query. */
function manifestKey(projectRoot: string, sourceId: string): string {
  const path = resolve(projectRoot, sourceId.replace(/^\0/, "").replace(/\?.*$/, ""));
  return relative(projectRoot, path).split(sep).join("/");
}

export function missingClientManifestError(path: string, sourceId: string): Error {
  return new Error(
    `[vite-plugin-react-server] ${sourceId} is a client reference, and its ` +
      `browser file is named by the client build, which writes ${path}. That ` +
      `file does not exist: build the client environment before the ssr and ` +
      `server environments (\`vite build --app\` does).`
  );
}
