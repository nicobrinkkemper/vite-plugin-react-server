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
    const pageModule = await moduleGraph.getModuleByUrl(pagePath, true);
    if (!pageModule) {
      if(verbose) {
        logger.info(`No page module found, skipping`);
      }
      return { type: "skip" };
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
          if (typeof importedMod === "object" && importedMod != null) {
            if (
              "id" in importedMod &&
              importedMod.id &&
              typeof importedMod.id === "string"
            ) {
              await walkModule(importedMod);
            } else {
              throw new Error(`Imported module has no id`);
            }
          } else {
            throw new Error(`Imported module is not an object`);
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
