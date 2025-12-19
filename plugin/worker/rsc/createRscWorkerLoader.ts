import { createLogger, type Logger } from "vite";
import { join, isAbsolute } from "node:path";
import { workerData } from "node:worker_threads";
import type { GenericModuleLoader } from "../../types.js";
import { isModuleInvalidated } from "./state.js";
import { resolveVirtualAndNodeModules } from "../../helpers/resolveVirtualAndNodeModules.js";
import { resolveModuleFromManifest } from "../../helpers/resolveModuleFromManifest.js";

/**
 * Creates a simple GenericModuleLoader for the RSC worker
 *
 * This follows the same pattern as the main thread server version:
 * - Simple dynamic import-based loading
 * - Proper export name resolution
 * - Works in both dev and build scenarios
 */
export const createRscWorkerLoader = ({
  verbose = false, // Disable verbose for performance
  logger = createLogger(workerData.resolvedConfig?.logLevel ?? "info", {
    prefix: "vite:plugin-react-server/worker/rsc",
  }),
  projectRoot,
  build,
  manifest,
}: {
  verbose?: boolean;
  logger?: Logger;
  projectRoot?: string;
  build?: {
    server?: string;
    client?: string;
    static?: string;
    outDir?: string;
  };
  manifest?: Record<string, any>;
} = {}): GenericModuleLoader => {
  // Debug log the build config
  if (verbose) {
    logger.info(`[createRscWorkerLoader] build config: ${JSON.stringify(build)}`);
  }
  
  // Determine projectRoot based on configEnv if not provided
  // In dev mode, configEnv.command should be "serve", but if it's undefined,
  // we can detect dev mode by checking if we're in a dev server environment
  const isBuildMode = workerData.configEnv?.command === "build";
  const isServeMode = !isBuildMode
  const effectiveProjectRoot =
    projectRoot || workerData.userOptions?.projectRoot || process.cwd();

  // Log build config for debugging
  if (verbose) {
    logger.info(
      `[createRscWorkerLoader] build config: ${JSON.stringify(build)}`
    );
    logger.info(
      `[createRscWorkerLoader] manifest: ${JSON.stringify(manifest)}`
    );
  }
  
  if (verbose) {
    logger.info(
      `[createRscWorkerLoader] configEnv: ${JSON.stringify(
        workerData.configEnv
      )}`
    );
    logger.info(
      `[createRscWorkerLoader] config.env: ${JSON.stringify(
        workerData.resolvedConfig?.env
      )}`
    );
    logger.info(
      `[createRscWorkerLoader] mode: ${workerData.resolvedConfig?.mode}`
    );
    logger.info(`[createRscWorkerLoader] NODE_ENV: ${process.env.NODE_ENV}`);
    logger.info(`[createRscWorkerLoader] isServeMode: ${isServeMode}`);
    logger.info(`[createRscWorkerLoader] projectRoot: ${effectiveProjectRoot}`);
  }

  // Simple GenericModuleLoader following the same pattern as main thread server
  return async (id: string) => {
    if (verbose) {
      logger.info(`[RSC Worker Loader] Loading module: ${id}`);
    }

    const [moduleID, exportName] = id.split("#");
    
    // Handle relative imports to _virtual/dynamic-import-helper.js from built files
    // When built files import ../_virtual/dynamic-import-helper.js, we need to resolve it
    // relative to the server build directory
    if (moduleID.includes("_virtual/dynamic-import-helper") || moduleID.includes("_virtual\\dynamic-import-helper")) {
      // Resolve relative to server build directory
      const serverBuildPath = build && isBuildMode
        ? join(effectiveProjectRoot, build.outDir || "dist", build.server || "server")
        : effectiveProjectRoot;
      const virtualPath = join(serverBuildPath, "_virtual", "dynamic-import-helper.js");
      
      if (verbose) {
        logger.info(`[RSC Worker Loader] Resolving virtual module helper: ${virtualPath}`);
      }
      
      try {
        const result = await import(virtualPath);
        if (exportName && !(exportName in result)) {
          throw new Error(`Export ${exportName} not found in virtual module helper`);
        }
        return result;
      } catch (error) {
        // If file doesn't exist, provide shim
        if (verbose) {
          logger.warn(`[RSC Worker Loader] Virtual module helper not found at ${virtualPath}, providing shim`);
        }
        const helper = (specifier: string) => import(specifier);
        const shim = { default: helper, __variableDynamicImportRuntimeHelper: helper };
        return exportName ? (exportName in shim ? { [exportName]: shim[exportName as keyof typeof shim] } : shim) : shim;
      }
    }
    
    // For virtual modules and node_modules, use shared utility
    const virtualOrNodeModule = await resolveVirtualAndNodeModules(
      moduleID,
      exportName,
      verbose,
      logger
    );
    if (virtualOrNodeModule !== null) {
      return virtualOrNodeModule;
    }

    // In dev mode (serve mode), load directly from source files
    // In build mode, use bundle information to resolve source paths to built paths
    let resolvedModuleID = moduleID;
    if (isServeMode) {
      // Dev mode: load directly from source files, no build path prefixing
      if (verbose) {
        logger.info(
          `[RSC Worker Loader] Dev mode: loading directly from source`
        );
      }
    } else if (build && isBuildMode) {
      // Build mode: use shared utility to resolve module from manifest
      if (manifest) {
        const manifestResolution = resolveModuleFromManifest({
          moduleId: moduleID,
          normalizer: workerData.userOptions?.normalizer,
          manifest: manifest as Record<string, { file: string } | undefined>,
          moduleBase: workerData.userOptions?.moduleBase || "src",
          preserveModulesRoot: workerData.userOptions?.build?.preserveModulesRoot,
          projectRoot: effectiveProjectRoot,
          buildOutDir: build.outDir || "dist",
          buildServerDir: build.server || "server",
          verbose,
          logger,
        });

        if (manifestResolution.manifestEntry && manifestResolution.resolvedPath) {
          // Found in manifest - use the resolved path (it's already a full absolute path)
          resolvedModuleID = manifestResolution.resolvedPath;
          if (verbose) {
            logger.info(
              `[RSC Worker Loader] Build mode: resolved via manifest to: ${resolvedModuleID}`
            );
          }
        } else {
          // Not in manifest - use the builtModuleId from resolution (which may be the original moduleID)
          resolvedModuleID = manifestResolution.builtModuleId;
          if (verbose) {
            logger.info(
              `[RSC Worker Loader] Build mode: not in manifest, using builtModuleId: ${resolvedModuleID}`
            );
          }
          
          // Check if we need to prefix with build directory
          // Use moduleBase from userOptions instead of hardcoded "src/"
          const moduleBase = workerData.userOptions?.moduleBase || "src";
          const isSourcePath = moduleID.startsWith(moduleBase + "/") || 
                              moduleID.startsWith("./" + moduleBase + "/") || 
                              (!moduleID.startsWith("/") && !moduleID.startsWith("file://") && !isAbsolute(moduleID));
          
          if (!isSourcePath) {
            // Not a source path - prefix with server build directory
            const serverBuildPath = join(
              effectiveProjectRoot,
              build.outDir || "dist",
              build.server || "server"
            );
            resolvedModuleID = join(serverBuildPath, resolvedModuleID);
            if (verbose) {
              logger.info(
                `[RSC Worker Loader] Build mode: prefixing with ${serverBuildPath}: ${resolvedModuleID}`
              );
            }
          }
        }
        
      } else {
        // No manifest available - fall back to source path detection
        // Use moduleBase from userOptions instead of hardcoded "src/"
        const moduleBase = workerData.userOptions?.moduleBase || "src";
        const isSourcePath = moduleID.startsWith(moduleBase + "/") || 
                            moduleID.startsWith("./" + moduleBase + "/") || 
                            (!moduleID.startsWith("/") && !moduleID.startsWith("file://") && !isAbsolute(moduleID));
        
        if (isSourcePath) {
          resolvedModuleID = moduleID;
        } else {
          const serverBuildPath = join(
            effectiveProjectRoot,
            build.outDir || "dist",
            build.server || "server"
          );
          resolvedModuleID = join(serverBuildPath, moduleID);
        }
      }
    }

    // Construct the full path relative to effectiveProjectRoot
    // If resolvedModuleID is already absolute (from manifest resolution), use it directly
    const fullPath = isAbsolute(resolvedModuleID) 
      ? resolvedModuleID 
      : join(effectiveProjectRoot, resolvedModuleID);

    // CRITICAL: Node.js caches ES modules, and we can't easily clear that cache
    // However, in development mode, Vite's file watcher should trigger module reloads
    // The issue is that Node.js's module cache persists even after file changes
    // 
    // Solution: We rely on the fact that when a file changes, Node.js should detect it
    // on the next import. But if the module is already cached, we need to force a reload.
    // 
    // Unfortunately, there's no reliable way to clear Node.js ES module cache in a worker.
    // The best we can do is ensure we're not using cached components when modules are invalidated.
    // This is handled in loadComponentsWithCache by checking isModuleInvalidated().
    //
    // For now, we'll just import normally. The cache invalidation in loadComponentsWithCache
    // should prevent using stale components, and Node.js should eventually pick up file changes.

    if (verbose) {
      const normalizedModulePath = resolvedModuleID.replace(/^\.\//, '').replace(/\\/g, '/');
      const isInvalidated = isModuleInvalidated(normalizedModulePath);
      if (isInvalidated) {
        logger.info(`[RSC Worker Loader] Module ${normalizedModulePath} is invalidated, but Node.js will use cached module. Component cache will be cleared.`);
      }
      logger.info(`[RSC Worker Loader] Importing from: ${fullPath}`);
    }

    try {
      // Use dynamic import - Node.js will use cached module if available
      // We rely on loadComponentsWithCache to skip cached components when invalidated
      const result = await import(fullPath);

      if (result == null) {
        throw new Error(`Module "${moduleID}" does not have any exports`);
      }

      if (!Object.keys(result).length && exportName?.length) {
        throw new Error(
          `Module "${moduleID}" is a module, but does not have any exports so it can't find ${exportName}`
        );
      }

      if (exportName && !(exportName in result)) {
        throw new Error(
          `Module "${moduleID}" exists, but does not export "${exportName}"`
        );
      }

      if (verbose) {
        logger.info(
          `[RSC Worker Loader] Module loaded successfully, exports: ${Object.keys(
            result
          ).join(", ")}`
        );
      }

      return result;
    } catch (error) {
      if (verbose) {
        logger.error(
          `[RSC Worker Loader] Failed to import ${fullPath}: ${error}`
        );
      }
      throw error;
    }
  };
};
