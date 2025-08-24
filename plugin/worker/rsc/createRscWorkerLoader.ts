import { createLogger, type Logger } from "vite";
import { join } from "node:path";
import { workerData } from "node:worker_threads";
import type { GenericModuleLoader } from "../../types.js";

/**
 * Creates a simple GenericModuleLoader for the RSC worker
 * 
 * This follows the same pattern as the main thread server version:
 * - Simple dynamic import-based loading
 * - Proper export name resolution
 * - Works in both dev and build scenarios
 */
export const createRscWorkerLoader = ({
  verbose = true, // Force verbose for debugging
  logger = createLogger(workerData.resolvedConfig.logLevel ?? "info", {
    prefix: "vite:plugin-react-server/worker/rsc",
  }),
  projectRoot,
  build,
  clientPattern,
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
  bundle?: Record<string, any>;
  hmrState?: any;
  clientPattern?: RegExp;
} = {}): GenericModuleLoader => {
  
  // Determine projectRoot based on configEnv if not provided
  // In dev mode, configEnv.command should be "serve", but if it's undefined, 
  // we can detect dev mode by checking if we're in a dev server environment
  const isServeMode = workerData.resolvedConfig.configEnv?.command === "serve" || 
                     workerData.resolvedConfig.mode === "development" ||
                     process.env.NODE_ENV === "development";
  const effectiveProjectRoot = projectRoot || workerData.userOptions.projectRoot || process.cwd();
  
  if (verbose) {
    logger.info(`[createRscWorkerLoader] configEnv: ${JSON.stringify(workerData.resolvedConfig.configEnv)}`);
    logger.info(`[createRscWorkerLoader] mode: ${workerData.resolvedConfig.mode}`);
    logger.info(`[createRscWorkerLoader] NODE_ENV: ${process.env.NODE_ENV}`);
    logger.info(`[createRscWorkerLoader] isServeMode: ${isServeMode}`);
    logger.info(`[createRscWorkerLoader] projectRoot: ${effectiveProjectRoot}`);
    logger.info(`[createRscWorkerLoader] build config: ${JSON.stringify(build)}`);
  }
  
  // Simple GenericModuleLoader following the same pattern as main thread server
  return async (id: string) => {
    if (verbose) {
      logger.info(`[RSC Worker Loader] Loading module: ${id}`);
    }
    
    const [moduleID, exportName] = id.split("#");
    
    // In dev mode (serve mode), load directly from source files
    // In build mode, determine the correct build directory based on module type
    let resolvedModuleID = moduleID;
    if (isServeMode) {
      // Dev mode: load directly from source files, no build path prefixing
            if (verbose) {
        logger.info(`[RSC Worker Loader] Dev mode: loading directly from source`);
      }
    } else if (build) {
      // Build mode: determine the correct build directory based on module type
      // Check if this is a client component using the configured pattern
      const isClientComponent = clientPattern ? clientPattern.test(moduleID) : false;
      
      if (isClientComponent) {
        // Client components should be loaded from the static build (browser files)
        const staticBuildPath = join(build.outDir || "dist", build.static || "static");
        resolvedModuleID = join(staticBuildPath, moduleID);
        if (verbose) {
          logger.info(`[RSC Worker Loader] Build mode: client component, prefixing with ${staticBuildPath}`);
        }
      } else {
        // Server components/pages/props should be loaded from the server build
        const serverBuildPath = join(build.outDir || "dist", build.server || "server");
        resolvedModuleID = join(serverBuildPath, moduleID);
            if (verbose) {
          logger.info(`[RSC Worker Loader] Build mode: server component, prefixing with ${serverBuildPath}`);
        }
      }
    }
    
    // Construct the full path relative to effectiveProjectRoot
    const fullPath = join(effectiveProjectRoot, resolvedModuleID);
    
          if (verbose) {
      logger.info(`[RSC Worker Loader] Importing from: ${fullPath}`);
    }
    
    try {
      // Use dynamic import, just like main thread server version uses ssrLoadModule
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
          `[RSC Worker Loader] Module loaded successfully, exports: ${Object.keys(result).join(", ")}`
        );
      }
      
      return result;
    } catch (error) {
      if (verbose) {
        logger.error(`[RSC Worker Loader] Failed to import ${fullPath}: ${error}`);
      }
      throw error;
    }
  };
};
