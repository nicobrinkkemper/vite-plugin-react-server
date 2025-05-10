import type { EnvironmentModuleGraph, ModuleGraph } from "vite";
import type { CreateHandlerOptions, CssContent } from "../types.js";
import { createCssProps } from "./createCssProps.js";

type CollectViteModuleGraphCssResult =
  | {
      type: "success";
      cssFiles: Map<string, CssContent>;
      error?: never;
      metrics: {
        cssFiles: number;
        processing: number;
      };
    }
  | {
      type: "error";
      error: Error;
      cssFiles?: never;
      metrics: {
        cssFiles: number;
        processing: number;
      };
    }
  | {
      type: "skip";
      cssFiles?: never;
      error?: never;
      metrics?: never;
    };

export async function collectViteModuleGraphCss<
  InlineCSS extends boolean | undefined = undefined
>({
  moduleGraph,
  pagePath,
  onCss,
  loader,
  parentUrl,
  moduleBaseURL,
  moduleBasePath,
  moduleRootPath,
  projectRoot,
  css,
}: Pick<
  CreateHandlerOptions<InlineCSS>,
  | "pagePath"
  | "moduleBaseURL"
  | "moduleBasePath"
  | "moduleRootPath"
  | "projectRoot"
  | "css"
  | "loader"
> & {
  moduleGraph: ModuleGraph | EnvironmentModuleGraph;
  onCss?: (cssContent: CssContent, parentUrl: string) => void;
  parentUrl?: string;
}): Promise<CollectViteModuleGraphCssResult> {
  if (!pagePath) return { type: "skip" };

  const cssFiles = new Map<string, CssContent>();
  const pageModule = await moduleGraph.getModuleByUrl(pagePath, true);
  if (!pageModule) {
    return { type: "skip" };
  }

  const seen = new Set<string>();
  const processing = new Set<string>();

  const walkModule = async (mod: any) => {
    if (!mod?.id) {
      // Module has no id
      return;
    }

    if (seen.has(mod.id)) {
      // Already processed module
      return;
    }

    if (processing.has(mod.id)) {
      // Circular dependency detected for module
      return;
    }

    processing.add(mod.id);
    // Processing module
    if (mod.id.endsWith(".css")) {
      const string = await loader(mod.id + "?inline").then(
        (m) => m?.['default'] ?? ""
      );
      if (typeof string !== "string") {
        throw new Error(`CSS module ${mod.id}?inline did not return a string`);
      } else if (string === "") {
        throw new Error(`CSS module ${mod.id}?inline returned an empty string`);
      }
      const cssContent = createCssProps({
        id: mod?.url,
        code: string,
        moduleBaseURL: moduleBaseURL,
        moduleBasePath: moduleBasePath,
        moduleRootPath: moduleRootPath,
        projectRoot: projectRoot,
        css: css,
      });
      cssFiles.set(mod?.url, cssContent);
      onCss?.(cssContent, parentUrl ?? pagePath);
    }

    if (mod.importedModules) {
      // Processing imports for module
      const importedModules = Array.from(mod.importedModules);
      // Found imported modules
      for (const importedMod of importedModules) {
        if (typeof importedMod === "object" && importedMod != null) {
          if (
            "id" in importedMod &&
            importedMod.id &&
            typeof importedMod.id === "string"
          ) {
            await walkModule(importedMod);
          } else {
            throw new Error(
              `Imported module has no id`
            );
          }
        } else {
          throw new Error(
            `Imported module is not an object`
          );
        }
      }
    }

    processing.delete(mod.id);
    seen.add(mod.id);
  };

  try {
    await walkModule(pageModule);
  } catch (error) {
    return {
      type: "error",
      error: error as Error,
      metrics: {
        cssFiles: cssFiles.size,
        processing: processing.size,
      },
    };
  }
  return {
    type: "success",
    cssFiles,
    metrics: {
      cssFiles: cssFiles.size,
      processing: processing.size,
    },
  };
}
