import {
  createLogger,
  type EnvironmentModuleGraph,
  type EnvironmentModuleNode,
  type ModuleGraph,
  type ModuleNode,
} from "vite";
import type {
  CreateHandlerOptions,
  CssContent,
} from "../types.js";
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
      error: unknown;
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

export type CollectViteModuleGraphCssOptions = Pick<
  CreateHandlerOptions,
  | "pagePath"
  | "layouts"
  | "moduleBaseURL"
  | "moduleBasePath"
  | "moduleRootPath"
  | "projectRoot"
  | "css"
  | "loader"
  | "normalizer"
  | "moduleID"
  | "publicOrigin"
  | "logger"
  | "verbose"
>;

export type CollectViteModuleGraphCssFn = <
  Opt extends CollectViteModuleGraphCssOptions = CollectViteModuleGraphCssOptions
>(options: {
  moduleGraph: ModuleGraph | EnvironmentModuleGraph;
  onCss?: (cssContent: CssContent, parentUrl: string) => void;
  parentUrl?: string;
  handlerOptions: Opt;
}) => Promise<CollectViteModuleGraphCssResult>;

export const collectViteModuleGraphCss: CollectViteModuleGraphCssFn =
  async function _collectViteModuleGraphCss({
    moduleGraph,
    onCss,
    parentUrl,
    handlerOptions,
  }) {
    const {
      pagePath,
      moduleBaseURL,
      moduleBasePath,
      moduleRootPath,
      projectRoot,
      publicOrigin,
      css,
      loader,
      normalizer,
      moduleID,
    } = handlerOptions;
    const logger = handlerOptions.logger ?? createLogger  ();
    const verbose = handlerOptions.verbose ?? false;
    if(handlerOptions.verbose) {
      logger.info(`Starting CSS collection for pagePath: ${pagePath}`);
    }
    
    if (!pagePath) {        
      if(verbose) {
        logger.info(`No pagePath, skipping`);
      }
      return { type: "skip" };
    }

    const cssFiles = new Map<string, CssContent>();
    if(verbose) {
      logger.info(`Getting module by URL: ${pagePath}`);
    }
    
    // Resolve a module by path, trying the URL schemes different module graphs
    // use (dev client vs. server-environment full paths vs. leading slash).
    const getModule = async (path: string) => {
      let mod = await moduleGraph.getModuleByUrl(path, true);
      if (!mod && projectRoot && !path.startsWith('/')) {
        mod = await moduleGraph.getModuleByUrl(`${projectRoot}/${path}`, true);
      }
      if (!mod && !path.startsWith('/')) {
        mod = await moduleGraph.getModuleByUrl(`/${path}`, true);
      }
      return mod;
    };

    const pageModule = await getModule(pagePath);

    if (!pageModule) {
      if(verbose) {
        logger.info(`No page module found for any path variant, skipping`);
      }
      return { type: "skip" };
    }

    // `route.tsx` layouts resolve from a separate module graph than the page
    // (resolveLayoutChain loads them directly), so a layout's CSS module — e.g.
    // a per-theme `.Theme` stylesheet — is collected only if we also seed the
    // walk with each layout module. Mirrors the static build path in
    // processCssFilesForPages.
    const layoutModules = [];
    for (const layer of handlerOptions.layouts ?? []) {
      if (!layer?.component) continue;
      const mod = await getModule(layer.component);
      if (mod) layoutModules.push(mod);
    }

    if(verbose) {
      logger.info(`Page module found, starting walk`);
    }

    const seen = new Set<string>();
    const processing = new Set<string>();

    const walkModule = async (mod: ModuleNode | EnvironmentModuleNode) => {
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
      if(verbose) {
        logger.info(`Processing module: ${mod.id}`);
      }
      
      // Processing module
      if (mod.id.endsWith(".css")) {
          if(verbose) {
          logger.info(`Loading CSS module: ${mod.id}?inline`);
        }
        const string = await loader(`${mod.id}?inline`).then(
          (m) => m?.["default"] ?? ""
        );
        if (typeof string !== "string") {
          throw new Error(
            `CSS module ${mod.id}?inline did not return a string`
          );
        } else if (string === "") {
          throw new Error(
            `CSS module ${mod.id}?inline returned an empty string`
          );
        }
        if(verbose) {
          logger.info(`CSS loaded successfully: ${mod.id}`);
        }
        const cssContent = createCssProps({
          id: mod?.id,
          code: string,
          userOptions: {
            moduleBaseURL: moduleBaseURL,
            moduleBasePath: moduleBasePath,
            moduleRootPath: moduleRootPath,
            projectRoot: projectRoot,
            css: css,
            normalizer: normalizer,
            moduleID: moduleID,
            publicOrigin: publicOrigin,
          },
        });
        cssFiles.set(mod?.id, cssContent);
        onCss?.(cssContent, parentUrl ?? pagePath);
      }

      if (mod.importedModules) {
        if(verbose) {
          logger.info(`Processing imports for module: ${mod.id}`);
        }
        // Processing imports for module
        const importedModules = Array.from(
          mod.importedModules?.values() as Iterable<
            ModuleNode | EnvironmentModuleNode
          >
        );  
        if(verbose) {
          logger.info(`Found ${importedModules.length} imported modules`);
        }
        // Found imported modules
        for (const importedMod of importedModules) {
          // Vite's dev module graph can hold unresolved nodes whose `id` is
          // still null (referenced but not yet resolved/transformed). They
          // carry no CSS to collect and nothing to recurse into, so skip them
          // rather than aborting the whole walk — a single such node used to
          // throw `Imported module has no id` and break CSS collection for the
          // entire page in dev:rsc.
          if (
            typeof importedMod === "object" &&
            importedMod != null &&
            "id" in importedMod &&
            importedMod.id &&
            typeof importedMod.id === "string"
          ) {
            await walkModule(importedMod);
          }
        }
      }

      processing.delete(mod.id);
      seen.add(mod.id);
    };

    try {
      if(verbose) {
        logger.info(`Starting module walk`);
      }
      await walkModule(pageModule);
      for (const mod of layoutModules) {
        await walkModule(mod);
      }
      if(verbose) {
        logger.info(`Module walk completed successfully`);
      }
    } catch (error) {
      if(verbose) {
        logger.error(`Error during module walk: ${(error as Error)?.message ?? 'no message'}`);
      }
      return {
        type: "error",
        error: error as Error,
        metrics: {
          cssFiles: cssFiles.size,
          processing: processing.size,
        },
      };
    }
    
    if(verbose) {
      logger.info(`CSS collection completed, found ${cssFiles.size} CSS files`);
    }
    return {
      type: "success",
      cssFiles,
      metrics: {
        cssFiles: cssFiles.size,
        processing: processing.size,
      },
    };
  };
