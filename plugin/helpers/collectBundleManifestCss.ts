import type { CreateHandlerOptions, CssContent } from "../types.js";
import { createCssProps } from "./createCssProps.js";
import { join } from "node:path";
import { readFile } from "node:fs/promises";


type CssCollectionOptions = Pick<

CreateHandlerOptions<unknown, React.ComponentType<unknown>>,
  | "projectRoot"
  | "build"
  | "moduleBaseURL"
  | "moduleBasePath"
  | "moduleRootPath"
  | "css"
> & {
  manifest: Record<string, any>;
  id: string | string[];
};

/**
 * Recursively collects CSS files from a bundle manifest
 */
async function collectCssFromModule(
  moduleKey: string,
  manifest: Record<string, any>,
  cssMap: Map<string, CssContent>,
  options: CssCollectionOptions
): Promise<void> {
  const mod = manifest[moduleKey];
  if (!mod) return;

  // Handle CSS imports
  if (mod.imports) {
    for (const importPath of mod.imports) {
      if(importPath === moduleKey) continue;
      if (importPath) {
        const cssEntry = manifest[importPath];
        // Handle CSS array
        if (Array.isArray(cssEntry.css)) {
          for (const cssFile of cssEntry.css) {
            if (cssMap.has(cssFile)) continue;
            const file = join(
              options.projectRoot,
              options.build.outDir,
              options.build.static,
              cssFile
            );
            const code =
              "code" in cssEntry && typeof cssEntry.code === "string"
                ? cssEntry.code
                : await readFile(file, "utf-8");
            cssMap.set(
              importPath,
              createCssProps({
                id: cssFile,
                css: options.css,
                code,
                moduleBaseURL: options.moduleBaseURL,
                moduleBasePath: options.moduleBasePath,
                moduleRootPath: options.moduleRootPath,
                projectRoot: options.projectRoot,
              })
            );
          }
        }
      }
      // Recursively process non-CSS imports
      await collectCssFromModule(importPath, manifest, cssMap, options);
    }
  }

  // Handle direct CSS files
  if (mod.css) {
    for (const cssFile of mod.css) {
      if (cssMap.has(cssFile)) continue;
      try {
        const file = join(
          options.projectRoot,
          options.build.outDir,
          options.build.server,
          cssFile
        );
        const code =
          "code" in manifest[cssFile] && typeof manifest[cssFile].code === "string"
            ? manifest[cssFile].code
            : await readFile(file, "utf-8");
        cssMap.set(
          moduleKey,
          createCssProps({
            id: cssFile,
            css: options.css,
            code,
            moduleBaseURL: options.moduleBaseURL,
            moduleBasePath: options.moduleBasePath,
            moduleRootPath: options.moduleRootPath,
            projectRoot: options.projectRoot,
          })
        );
      } catch {
        continue;
      }
    }
  }
}

/**
 * Collects CSS files from a bundle manifest using async generators
 */
export async function collectBundleManifestCss({
  id,
  manifest,
  projectRoot,
  build,
  moduleBaseURL,
  moduleBasePath,
  moduleRootPath,
  css,
}: CssCollectionOptions): Promise<Map<string, CssContent>> {
  const cssMap = new Map<string, CssContent>();
  const collectionOptions: CssCollectionOptions = {
    manifest,
    projectRoot,
    build,
    moduleBaseURL,
    moduleBasePath,
    moduleRootPath,
    css,
    id,
  };

  // Process page and props modules
  if (typeof id === "string") {
    await collectCssFromModule(id, manifest, cssMap, collectionOptions);
  } else if (Array.isArray(id)) {
    for (const _id of id) {
      await collectCssFromModule(_id, manifest, cssMap, collectionOptions);
    }
  }

  return cssMap;
}
