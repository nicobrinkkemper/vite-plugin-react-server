import { createLogger, type Logger } from "vite";
import { workerData } from "node:worker_threads";
import type { GenericModuleLoader } from "../../types.js";
import { createSharedLoader } from "../../helpers/createSharedLoader.js";

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

  // Simple GenericModuleLoader using shared loader utility
  return async (id: string) => {
    if (verbose) {
      logger.info(`[RSC Worker Loader] Loading module: ${id}`);
    }

    const [moduleID, exportName] = id.split("#");

    // Use shared loader utility - it handles virtual modules, manifest resolution, and imports
    return await createSharedLoader({
      moduleId: moduleID,
      exportName,
      verbose,
      logger,
      resolveVirtual: true,
      manifest: manifest as Record<string, { file: string } | undefined> | undefined,
      normalizer: workerData.userOptions?.normalizer,
      moduleBase: workerData.userOptions?.moduleBase || "src",
      preserveModulesRoot: workerData.userOptions?.build?.preserveModulesRoot,
      projectRoot: effectiveProjectRoot,
      buildOutDir: build?.outDir || "dist",
      buildServerDir: build?.server || "server",
      isBuildMode,
      isServeMode,
      effectiveProjectRoot,
      build,
    });
  };
};
