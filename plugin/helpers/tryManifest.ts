import { join, resolve } from "node:path";

import type { Manifest } from "vite";
import { readFile } from "node:fs/promises";

export type TryManifestOptions<SSR extends boolean = false> = {
  root: string;
  outDir: string;
  ssrManifest?: SSR;
  preserveModulesRoot?: string;
  manifestPath?: string | boolean | undefined;
};

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
    }
  | {
      type: "skip";
    }
> {
  let path = options.manifestPath;
  if (path === false) {
    return {
      type: "skip",
    };
  }
  if (options.ssrManifest) {
    path = join(".vite", "ssr-manifest.json");
  } else {
    path = join(".vite", "manifest.json");
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
    return {
      type: "error",
      error: e as Error,
    };
  }
}
