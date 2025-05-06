import type { Manifest } from "vite";
import type {
  CssContent,
  ResolvedUserOptions,
  StreamPluginOptions,
} from "../types.js";
import { createCssProps } from "./createCssProps.js";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

type Options = Pick<
  ResolvedUserOptions,
  "css" | "moduleBaseURL" | "moduleBasePath" | "moduleRootPath" | "projectRoot"
> & {
  bundleManifest: Manifest;
  build: Pick<
    NonNullable<Required<StreamPluginOptions["build"]>>,
    "outDir" | "server"
  >;
  pagePath: string;
  propsPath?: string;
};

/**
 * Collects CSS files from a bundle manifest using async generators
 */
export async function collectBundleManifestCss({
  bundleManifest,
  pagePath,
  propsPath,
  css,
  moduleBaseURL,
  moduleBasePath,
  moduleRootPath,
  build,
  projectRoot,
}: Options): Promise<Map<string, CssContent>> {
  const cssMap = new Map<string, CssContent>();


  // Find all CSS files in the manifest
  for (const [key, mod] of Object.entries(bundleManifest)) {
    if (key !== pagePath && typeof propsPath === "string" && key !== propsPath)
      continue;
    if (mod.css) {
      for (const cssFile of mod.css) {
        if (cssMap.has(cssFile)) continue;
        try {
          const file = join(projectRoot, build.outDir, build.server, cssFile);
          const code = await readFile(file, "utf-8");
          cssMap.set(
            cssFile,
            createCssProps({
              id: cssFile,
              css,
              code,
              moduleBaseURL,
              moduleBasePath,
              moduleRootPath,
              projectRoot,
            })
          );
        } catch {
          continue;
        }
      }
    }
  }

  return cssMap;
}
