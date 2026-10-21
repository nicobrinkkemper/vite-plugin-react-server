import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { UserConfig } from "vite";
import type { ResolvedUserOptions } from "../types.js";

/** Use the browser environment configuration, including its final overrides. */
export function resolveClientBuildManifestPath(
  options: Pick<ResolvedUserOptions, "projectRoot" | "build">,
  config: Pick<UserConfig, "build" | "environments">,
): string {
  const client = config.environments?.["client"]?.build;
  const manifest = client?.manifest ?? config.build?.manifest;
  return resolve(
    options.projectRoot,
    client?.outDir ?? resolve(options.projectRoot, options.build.outDir, options.build.static),
    typeof manifest === "string" ? manifest : ".vite/manifest.json",
  );
}

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
  getPath,
}: {
  projectRoot: string;
  outDir: string;
  staticDir: string;
  getPath?: () => string | undefined;
}): ClientBuildManifestLookup {
  const manifestPath = () => getPath?.() ?? resolve(projectRoot, outDir, staticDir, ".vite/manifest.json");
  // Re-read when the client build rewrites it (several builds in one process).
  let cached: { path: string; mtimeMs: number; files: Map<string, string> } | undefined;

  const load = (): Map<string, string> | undefined => {
    const path = manifestPath();
    if (!existsSync(path)) return undefined;
    const { mtimeMs } = statSync(path);
    if (cached?.path !== path || cached?.mtimeMs !== mtimeMs) {
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
      cached = { path, mtimeMs, files };
    }
    return cached.files;
  };

  return {
    get path() { return manifestPath(); },
    exists: () => existsSync(manifestPath()),
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
