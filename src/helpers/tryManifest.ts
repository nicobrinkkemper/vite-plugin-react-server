import { readFileSync } from "fs";
import { resolve } from "path";

type TryManifestOptions = {
  root: string;
  outDir: string;
  ssrManifest: boolean;
};

export function tryManifest(options: TryManifestOptions) {
  const manifestPath = resolve(
    options.root,
    options.outDir,
    ".vite",
    options.ssrManifest ? "ssr-manifest.json" : "manifest.json"
  );
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (e) {
    console.log("No manifest found", manifestPath);
    return null;
  }
}
