import { join, resolve } from "node:path";
import type {
  PluginContext,
} from "rollup";
import type { Manifest } from "vite";
import { readFile } from "node:fs/promises";

type TryManifestOptions<SSR extends boolean = false> = {
  root: string;
  outDir: string;
  ssrManifest?: SSR;
  preserveModulesRoot?: string;
  manifestPath?: string | undefined;
};

const stashedManifests: Map<string, any> = new Map();

export async function tryManifest<SSR extends boolean>(
  options: TryManifestOptions<SSR>
): Promise<
  | {
      type: "success";
      manifest: SSR extends true ? Record<string, string[]> : Manifest;
      error?: never;
    }
  | {
      type: "error";
      error: Error;
      manifest?: never;
    }> {
  if (stashedManifests.has(options.outDir)) {
    return {
      type: "success",
      manifest: stashedManifests.get(options.outDir),
    };
  }
  const localSsrManifestPath = !options.ssrManifest ? undefined : options.manifestPath ? options.manifestPath : join('.vite', 'ssr-manifest.json');
  const localManifestPath = options.ssrManifest ? undefined : options.manifestPath ? options.manifestPath : join('.vite', 'manifest.json');
  const manifestPath = resolve(
    options.root,
    options.outDir,
    options.ssrManifest ? localSsrManifestPath as string : localManifestPath as string
  );
  try {
    const result = JSON.parse(await readFile(manifestPath, "utf-8"));
    stashedManifests.set(options.outDir, result);
    return {
      type: "success",
      manifest: result,
    };
  } catch (e) {
    console.trace("No manifest found", manifestPath);
    return {
      type: "error",
      error: e as Error,
    };
  }
}
