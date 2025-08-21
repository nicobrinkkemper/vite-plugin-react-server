import { createLogger, type Logger } from "vite";
import { join } from "node:path";
import { workerData } from "node:worker_threads";
import { addCssFileContent } from "./state.js";
import type { 
  GenericModuleLoader, 
  ComponentResolutionConfig, 
  PluginComponentReference,
  ResolvedComponent,
  WorkerComponentLoader 
} from "../../types.js";
import { readFile } from "node:fs/promises";
import type { OutputBundle } from "rollup";

// Internal plugin component registry
const PLUGIN_COMPONENTS = new Map<string, any>();

// Initialize plugin components if not already done
if (PLUGIN_COMPONENTS.size === 0) {
  try {
    // Import plugin components directly in worker context
    const { Html } = await import("../../components/html.js");
    const { Root } = await import("../../components/root.js");
    const { Css } = await import("../../components/css.js");
    
    PLUGIN_COMPONENTS.set("Html", Html);
    PLUGIN_COMPONENTS.set("Root", Root);
    PLUGIN_COMPONENTS.set("Css", Css);
  } catch (error) {
    // Plugin components not available, that's okay
  }
}

// Create worker component loader
const createWorkerComponentLoader = (): WorkerComponentLoader => ({
  loadComponent: async (config: ComponentResolutionConfig): Promise<ResolvedComponent> => {
    try {
      switch (config.strategy) {
        case "worker-internal":
          if (PLUGIN_COMPONENTS.has(config.moduleId || "")) {
            return {
              type: "success",
              component: PLUGIN_COMPONENTS.get(config.moduleId || ""),
              source: "worker-internal"
            };
          }
          return {
            type: "error",
            error: new Error(`Internal component ${config.moduleId} not found`),
            source: "worker-internal"
          };
          
        case "direct-import":
          if (!config.path) {
            return {
              type: "error",
              error: new Error("Path required for direct-import strategy"),
              source: "direct"
            };
          }
          const module = await import(config.path);
          const component = config.exportName ? module[config.exportName] : module.default;
          return {
            type: "success",
            component,
            source: "direct"
          };
          
        case "serializable-path":
          // This will be handled by the main module loader
          return {
            type: "error",
            error: new Error("Serializable path should be handled by main loader"),
            source: "resolved"
          };
          
        default:
          return {
            type: "error",
            error: new Error(`Unknown component resolution strategy: ${config.strategy}`),
            source: "resolved"
          };
      }
    } catch (error) {
      return {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
        source: "resolved"
      };
    }
  },
  
  loadPluginComponent: async (reference: PluginComponentReference): Promise<ResolvedComponent> => {
    try {
      if (PLUGIN_COMPONENTS.has(reference.componentName)) {
        return {
          type: "success",
          component: PLUGIN_COMPONENTS.get(reference.componentName),
          source: "plugin"
        };
      }
      
      // Try to import from the specified module path
      const module = await import(reference.modulePath);
      const component = module[reference.exportName];
      
      return {
        type: "success",
        component,
        source: "plugin"
      };
    } catch (error) {
      return {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
        source: "plugin"
      };
    }
  },
  
  hasInternalComponent: (componentName: string): boolean => {
    return PLUGIN_COMPONENTS.has(componentName);
  }
});

export const createRscWorkerLoader =
  ({
    verbose = workerData.userOptions.verbose ?? false,
    logger = createLogger(workerData.resolvedConfig.logLevel ?? "info", {
      prefix: "vite:plugin-react-server/worker/rsc",
    }),
    hmrState,
    projectRoot = workerData.userOptions.projectRoot,
    build = workerData.userOptions.build,
    manifest = workerData.serverManifest,
    bundle = workerData.bundle,
  }: {
    verbose: boolean;
    logger: Logger;
    hmrState: Map<string, { invalidated: boolean }>;
    projectRoot: string;
    build: {
      server: string;
      outDir: string;
    };
    manifest: Record<string, { file: string } | string>;
    bundle?: OutputBundle;
  }): GenericModuleLoader => {
    
    const componentLoader = createWorkerComponentLoader();
    
    return async (moduleID: string) => {
      const [withOutQuery, query] = moduleID.split("?");
      const hashSplit = withOutQuery.split("#");
      let moduleId = typeof hashSplit[0] === "string" ? hashSplit[0] : moduleID;
      const exportName = typeof hashSplit[1] === "string" ? hashSplit[1] : "";
      
      // Check if this is a plugin component request
      if (moduleId.startsWith("plugin/components/")) {
        const componentName = moduleId.split("/").pop()?.replace(".js", "");
        if (componentName && componentLoader.hasInternalComponent(componentName)) {
          const result = await componentLoader.loadPluginComponent({
            type: "plugin-component",
            componentName: componentName as "Html" | "Root" | "Css",
            modulePath: moduleId,
            exportName: exportName || "default"
          });
          
          if (result.type === "success") {
            if (verbose) {
              logger.info(`Loaded plugin component: ${componentName}`);
            }
            return exportName ? { [exportName]: result.component } : result.component;
          } else {
            throw new Error(`Failed to load plugin component ${componentName}: ${result.error.message}`);
          }
        }
      }

      // If we have a bundle, try to use it first
      if (bundle && Object.keys(bundle).length > 0) {
        if (verbose) {
          logger.info(`Bundle keys: ${Object.keys(bundle).join(', ')}`);
          logger.info(`Looking for module: ${moduleId}`);
        }
        
        // Look for the module in the bundle
        let bundleEntry = bundle[moduleId];
        
        // If not found directly, try to find it using the manifest
        if (!bundleEntry) {
          const manifestValue = manifest[moduleId];
          if (manifestValue) {
            const filePath = typeof manifestValue === "object" ? manifestValue.file : manifestValue;
            if (verbose) {
              logger.info(`Manifest entry found: ${filePath} from manifest: ${JSON.stringify(manifestValue)}`);
            }
            moduleId = filePath;
            // Look for the bundle entry by the compiled file path
            for (const [key, entry] of Object.entries(bundle)) {
              if ('file' in entry && entry.file === filePath) {
                bundleEntry = entry;
                if (verbose) {
                  logger.info(`Found bundle entry by manifest lookup: ${key} -> ${entry.file}`);
                }
                break;
              }
            }
          }
        }
        
        if (bundleEntry) {
          if (verbose) {
            logger.info(`Found bundle entry for ${moduleId}`);
            logger.info(`Bundle entry type: ${typeof bundleEntry}`);
            logger.info(`Bundle entry keys: ${Object.keys(bundleEntry).join(', ')}`);
          }
          
          // For bundle entries, the bundle key IS the file path relative to the server output
          // The bundle entry contains the module code, not a file reference
          if (query === "inline") {
            // For inline queries, we need to return the source code
            if ('code' in bundleEntry) {
              return {default: bundleEntry.code as string};
            }
          }
          
          // Import the module directly using the bundle key as the relative path
          const fullPath = join(projectRoot, build.outDir, build.server, moduleId);
          const res = await import(fullPath);
          if (verbose) {
            logger.info(
              `Module imported successfully from bundle, exports: ${Object.keys(res).join(", ")}`
            );
          }
          
          // Check if this is a CSS module and add to stateful CSS system
          if (moduleId.endsWith('.css') || moduleId.includes('.module.css')) {
            try {
              // Read the CSS file content
              const cssFilePath = join(projectRoot, build.outDir, build.server, moduleId);
              const cssContent = await readFile(cssFilePath, 'utf-8');
              
              // Add CSS to stateful system directly
              addCssFileContent(moduleId, cssContent, workerData.userOptions);
              if (verbose) {
                logger.info(`Added CSS file ${moduleId} to stateful system`);
              }
              
              // Also add CSS to module's viteMetadata for proper CSS handling
              if (res && typeof res === 'object') {
                // Ensure viteMetadata exists
                if (!res.viteMetadata) {
                  res.viteMetadata = {};
                }
                if (!res.viteMetadata.importedCss) {
                  res.viteMetadata.importedCss = new Set();
                }
                // Add the CSS file to the importedCss set
                res.viteMetadata.importedCss.add(moduleId);
                if (verbose) {
                  logger.info(`Added CSS file ${moduleId} to module's viteMetadata`);
                }
              }
            } catch (error) {
              if (verbose) {
                logger.warn(`Failed to read CSS file ${moduleId}: ${error}`);
              }
            }
          }
          
          if (!exportName) return res;
          if (!(exportName in res)) {
            throw new Error(`Export ${exportName} not found in module ${moduleId}`);
          }
          return res;
        }
      }
      
      // If not found, try to find it by looking for the compiled path in manifest values
      let foundManifestEntry = null;
      for (const [, value] of Object.entries(manifest)) {
        const filePath = typeof value === "object" ? value.file : value;
        if (filePath === moduleId) {
          foundManifestEntry = value;
          break;
        }
      }
      
      if (foundManifestEntry) {
        // Construct a path RELATIVE to projectRoot to avoid double prefixing later
        const filePath = typeof foundManifestEntry === "object" ? foundManifestEntry.file : foundManifestEntry;
        moduleId = join(build.outDir, build.server, filePath) +
          (query ? `?${query}` : "") +
          (exportName ? `#${exportName}` : "");
      }
      if (verbose) {
        logger.info(`Loading module: ${moduleID}`);
      }

      if (hmrState.get(moduleId)?.invalidated) {
        if (verbose) {
          logger.info(`Module ${moduleId} is invalidated, reloading`);
        }
        hmrState.delete(moduleId);
        const res = await import(join(projectRoot, build.outDir, build.server, moduleId) + `?t=${Date.now()}`);
        if (!exportName) return res;
        if (exportName in res) return { [exportName]: res[exportName] };
        return res;
      }
      if (verbose) {
        logger.info(`Importing module: ${join(projectRoot, moduleId)}`);
      }

      if (query === "inline") {
        if(verbose) {
          logger.info(`Importing inline module: ${moduleId}`);
        }
        return await readFile(join(projectRoot, build.outDir, build.server, moduleId));
      }
      if(verbose) {
        logger.info(`Importing module: ${moduleId}`);
      }
      const res = await import(join(projectRoot, build.outDir, build.server, moduleId));
      if (verbose) {
        logger.info(
          `Module imported successfully, exports: ${Object.keys(res).join(", ")}`
        );
      }
      if (!exportName) return res;
      if (!(exportName in res)) {
        throw new Error(`Export ${exportName} not found in module ${moduleId}`);
      }
      return res;
    };
  };
