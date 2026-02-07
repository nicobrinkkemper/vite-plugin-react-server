import { join, resolve } from "node:path";

import type { Manifest } from "vite";
import { readFile } from "node:fs/promises";

export type TryManifestOptions<SSR extends boolean = false> = {
  root: string;
  // depends on the build.outDir and build.static/build.client, etc
  outDir: string;
  // changes types and defaults to be SSR/non ssr manifest
  ssrManifest?: SSR;
  manifestPath?: string | boolean | undefined;
};

export async function tryManifest<SSR extends boolean = false>(
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
    }
  | {
      type: "skip";
      manifest: Manifest;
    }
> {
  let path = options.manifestPath;
  if (path === false) {
    return {
      type: "skip",
      manifest: {},
    };
  }
  if (!path || path === true) {
    if (options.ssrManifest) {
      path = join(".vite", "ssr-manifest.json");
    } else {
      path = join(".vite", "manifest.json");
    }
  }
  try {
    const result = JSON.parse(
      await readFile(resolve(options.root, options.outDir, path), "utf-8")
    );
    return {
      type: "success",
      manifest: result,
    };
  } catch (e) {
    // If manifest is not found, treat as skip so callers can proceed gracefully
    if ((e as any)?.code === "ENOENT") {
      return { type: "skip", manifest: {} };
    }
    return {
      type: "error",
      error: e as Error,
    };
  }
}
