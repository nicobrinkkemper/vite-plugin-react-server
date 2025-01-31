import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Manifest } from "vite";

type TryManifestOptions<SSR extends boolean> = {
  root: string;
  outDir: string;
  ssrManifest: SSR;
};

export function tryManifest<SSR extends boolean>(options: TryManifestOptions<SSR>): {
  type: "success";
  manifest: SSR extends true ? Record<string, string[]> : Manifest;
} | {
  type: "error";
  error: Error;
} {
  const manifestPath = resolve(
    options.root,
    options.outDir,
    ".vite",
    options.ssrManifest ? "ssr-manifest.json" : "manifest.json"
  );
  try {
    const result=  JSON.parse(readFileSync(manifestPath, "utf-8"));
    return {
      type: "success",
      manifest: result,
    }
  } catch (e) {
    console.log("No manifest found", manifestPath);
    return {
      type: "error",
      error: e as Error,
    }
  }
}
