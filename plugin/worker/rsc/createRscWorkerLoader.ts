import { createLogger, type Logger } from "vite";
import { workerData } from "node:worker_threads";
import type { GenericModuleLoader } from "../../types.js";
import { createSharedLoader } from "../../helpers/createSharedLoader.js";

/**
 * Creates a GenericModuleLoader for the RSC worker.
 * Uses createSharedLoader for virtual modules, manifest resolution, and imports.
 */
export const createRscWorkerLoader = ({
  verbose = false,
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
  const isBuildMode = workerData.configEnv?.command === "build";
  const isServeMode = !isBuildMode;
  const effectiveProjectRoot =
    projectRoot || workerData.userOptions?.projectRoot || process.cwd();

  return async (id: string) => {
    const [moduleID, exportName] = id.split("#");

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
