import { createLogger, type Logger } from "vite";
import type { GenericModuleLoader } from "../../types.js";

export interface BundleEntry {
  file: string;
  src?: string;
  isEntry?: boolean;
  css?: string[];
  imports?: string[];
  dynamicImports?: string[];
}

export interface Bundle {
  [id: string]: BundleEntry;
}

export const createBundleLoader = ({
  verbose,
  logger = createLogger("info", {
    prefix: "vite:plugin-react-server/worker/bundle",
  }),
  bundle = {},
  manifest = {},
}: {
  verbose: boolean;
  logger: Logger;
  bundle: Bundle;
  manifest: Record<string, { file: string } | string>;
}): GenericModuleLoader =>
  async (moduleID: string) => {
    const [withOutQuery, query] = moduleID.split("?");
    const hashSplit = withOutQuery.split("#");
    let moduleId = typeof hashSplit[0] === "string" ? hashSplit[0] : moduleID;
    const exportName = typeof hashSplit[1] === "string" ? hashSplit[1] : "";

    if (verbose) {
      logger.info(`Loading module from bundle: ${moduleID}`);
    }

    // First try to find the module in the bundle
    let bundleEntry = bundle[moduleId];
    
    // If not found directly, try to find it using the manifest
    if (!bundleEntry) {
      const manifestEntry = manifest[moduleId];
      if (manifestEntry) {
        const filePath = typeof manifestEntry === "object" ? manifestEntry.file : manifestEntry;
        // Look for the bundle entry by the compiled file path
        for (const [key, entry] of Object.entries(bundle)) {
          if (entry.file === filePath) {
            bundleEntry = entry;
            moduleId = key;
            break;
          }
        }
      }
    }

    if (!bundleEntry) {
      throw new Error(`Module ${moduleID} not found in bundle`);
    }

    if (verbose) {
      logger.info(`Found bundle entry for ${moduleId}: ${bundleEntry.file}`);
    }

    // For now, we'll need to load the actual file content
    // In a more sophisticated implementation, we could include the source code in the bundle
    // or use a virtual file system
    const filePath = bundleEntry.file;
    
    if (query === "inline") {
      // For inline requests, we might need to read the file
      const fs = await import("node:fs/promises");
      return await fs.readFile(filePath, "utf-8");
    }

    // Import the module
    const res = await import(filePath);
    
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
