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
      // Build mode: try to resolve source path using manifest first, then bundle information
      let resolvedEntry = null;
      
      // First try manifest - try direct key lookup first, then search by file field
      if (manifest) {
        if (verbose) {
          logger.info(`[RSC Worker Loader] Searching manifest for moduleID: ${moduleID}`);
        }
        
        // Try direct key lookup first (in case manifest is keyed by built paths)
        if (manifest[moduleID]) {
          resolvedEntry = manifest[moduleID];
          if (verbose) {
            logger.info(
              `[RSC Worker Loader] Build mode: found manifest entry for ${moduleID} via direct key: ${JSON.stringify(resolvedEntry)}`
            );
          }
        } else {
          // Search manifest entries for one where file matches moduleID
          for (const [sourcePath, entry] of Object.entries(manifest)) {
            if (entry && typeof entry === 'object' && 'file' in entry && entry.file === moduleID) {
              resolvedEntry = entry;
              if (verbose) {
                logger.info(
                  `[RSC Worker Loader] Build mode: found manifest entry for ${moduleID} via source path ${sourcePath}: ${JSON.stringify(resolvedEntry)}`
                );
              }
              break;
            }
          }
          
          if (!resolvedEntry && verbose) {
            logger.info(`[RSC Worker Loader] No manifest entry found for ${moduleID}, will fall back to build directory logic`);
          }
        }
      }
      
      // Fall back to bundle if no manifest entry
      if (!resolvedEntry) {
        const bundle = workerData.bundle || {};
        resolvedEntry = bundle[moduleID];
        if (verbose && resolvedEntry) {
          logger.info(
            `[RSC Worker Loader] Build mode: found bundle entry for ${moduleID}: ${JSON.stringify(resolvedEntry)}`
          );
        }
      }
      
      // Set the base module ID from manifest/bundle or use original
      if (resolvedEntry && resolvedEntry.file) {
        // Found entry, use the built file path
        resolvedModuleID = resolvedEntry.file;
        if (verbose) {
          logger.info(
            `[RSC Worker Loader] Build mode: found manifest/bundle entry, using file path: ${resolvedModuleID}`
          );
        }
        
        // For manifest entries, fall through to normal path construction
        // The manifest lookup is working, so we'll rely on the normal path construction
      } else {
        // No manifest/bundle entry found, use original moduleID
        resolvedModuleID = moduleID;
        if (verbose) {
          logger.info(
            `[RSC Worker Loader] Build mode: no manifest/bundle entry found, using original: ${moduleID}`
          );
        }
      }
      
      // Now construct the full path with build directory
      // Check if the resolvedModuleID already contains a build directory path
      const buildDirs = [
        build.outDir || "dist",
        build.client || "client",
        build.server || "server",
        build.static || "static",
      ];
      const alreadyHasBuildPath = buildDirs.some((dir) =>
        resolvedModuleID.startsWith(dir + "/") || resolvedModuleID.startsWith(dir + "\\")
      );
      

      if (alreadyHasBuildPath) {
        // Path already contains build directory, don't add another prefix
        if (verbose) {
          logger.info(
            `[RSC Worker Loader] Build mode: path already contains build directory, using as-is: ${resolvedModuleID}`
          );
        }
      } else {
        // Build mode: always use server build directory since we're in RSC worker (server environment)
        const serverBuildPath = join(
          build.outDir || "dist",
          build.server || "server"
        );
        resolvedModuleID = join(serverBuildPath, moduleID);
        if (verbose) {
          logger.info(
            `[RSC Worker Loader] Build mode: RSC worker environment, prefixing with ${serverBuildPath}`
          );
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
