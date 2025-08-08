import { createLogger, type Logger } from "vite";
import { join } from "node:path";
import { workerData } from "node:worker_threads";
import type { GenericModuleLoader } from "../../types.js";
import { readFile } from "node:fs/promises";
import type { OutputBundle } from "rollup";

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
  }): GenericModuleLoader =>
  async (moduleID: string) => {
    const [withOutQuery, query] = moduleID.split("?");
    let hashSplit = withOutQuery.split("#");
    let moduleId = typeof hashSplit[0] === "string" ? hashSplit[0] : moduleID;
    let exportName = typeof hashSplit[1] === "string" ? hashSplit[1] : "";
    
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
        const manifestEntry = manifest[moduleId];
        if (manifestEntry) {
          const filePath = typeof manifestEntry === "object" ? manifestEntry.file : manifestEntry;
          if (verbose) {
            logger.info(`Manifest entry found: ${filePath}`);
          }
          // Look for the bundle entry by the compiled file path
          for (const [key, entry] of Object.entries(bundle)) {
            if ('file' in entry && entry.file === filePath) {
              bundleEntry = entry;
              moduleId = key;
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
            return bundleEntry.code as string;
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
        if (!exportName) return res;
        if (!(exportName in res)) {
          throw new Error(`Export ${exportName} not found in module ${moduleId}`);
        }
        return res;
      }
    }
    
    // Fallback to manifest-based resolution
    let manifestEntry = manifest[moduleId];
    
    // If not found, try to find it by looking for the compiled path in manifest values
    if (!manifestEntry) {
      for (const [, value] of Object.entries(manifest)) {
        const filePath = typeof value === "object" ? value.file : value;
        if (filePath === moduleId) {
          manifestEntry = value;
          break;
        }
      }
    }
    
    if (manifestEntry) {
      const mod = manifestEntry;
      const filePath = typeof mod === "object" ? mod.file : mod;
      // Construct the full path to the compiled file
      // projectRoot is already the full path to the test fixture
      moduleId = join(projectRoot, build.outDir, build.server, filePath) +
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
      const res = await import(join(projectRoot, moduleId) + `?t=${Date.now()}`);
      if (!exportName) return res;
      if (exportName in res) return { [exportName]: res[exportName] };
      return res;
    }
    if (verbose) {
      logger.info(`Importing module: ${join(projectRoot, moduleId)}`);
    }

    if (query === "inline") {
      return await readFile(join(projectRoot, moduleId));
    }
    const res = await import(join(projectRoot, moduleId));
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
