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
  | "cssFiles"
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
      if (importPath === moduleKey) continue;
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
          "code" in manifest[cssFile] &&
          typeof manifest[cssFile].code === "string"
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
export async function collectBundleManifestCss(
  options: CssCollectionOptions
): Promise<Map<string, CssContent>> {
  const cssMap = new Map<string, CssContent>();
  if (options.cssFiles) {
    for (const [, value] of Object.entries(options.cssFiles)) {
      const file = join(
        options.projectRoot,
        options.build.outDir,
        options.build.server,
        value
      );
      const code =
        options.manifest != null &&
        value in options.manifest &&
        "code" in options.manifest[value] &&
        typeof options.manifest[value].code === "string"
          ? options.manifest[value].code
          : await readFile(file, "utf-8");
      cssMap.set(
        file,
        createCssProps({
          id: file,
          code: code,
          css: options.css,
          moduleBaseURL: options.moduleBaseURL,
          moduleBasePath: options.moduleBasePath,
          moduleRootPath: options.moduleRootPath,
          projectRoot: options.projectRoot,
        })
      );
    }
  }

  // Process page and props modules
  if (typeof options.id === "string") {
    await collectCssFromModule(options.id, options.manifest, cssMap, options);
  } else if (Array.isArray(options.id)) {
    for (const _id of options.id) {
      await collectCssFromModule(_id, options.manifest, cssMap, options);
    }
  }

  return cssMap;
}
