import type { Logger } from "vite";

/**
 * Shared utility for handling virtual modules and node_modules in loaders.
 * 
 * For virtual modules and node_modules, we use Node.js native resolution.
 * These should be handled by Node.js's module resolution, not custom logic.
 * 
 * @param moduleId - The module ID to resolve
 * @param exportName - Optional export name to extract
 * @param verbose - Whether to log verbose messages
 * @param logger - Logger instance
 * @returns The resolved module, or null if this isn't a virtual/node_modules module
 */
export async function resolveVirtualAndNodeModules(
  moduleId: string,
  exportName?: string,
  verbose = false,
  logger?: Logger
): Promise<Record<string, any> | null> {
  // For virtual modules and node_modules, use Node.js native resolution
  if (
    !moduleId.includes("_virtual/") &&
    !moduleId.startsWith("_virtual") &&
    !moduleId.includes("node_modules")
  ) {
    return null; // Not a virtual module or node_modules, let caller handle it
  }

  try {
    // Try to import directly - Node.js will resolve it
    const module = await import(moduleId);
    if (exportName && !(exportName in module)) {
      throw new Error(
        `Export ${exportName} not found in module ${moduleId}`
      );
    }
    return module;
  } catch (error) {
    // If it's the dynamic-import-helper, provide a shim
    if (moduleId.includes("dynamic-import-helper")) {
      if (verbose) {
        logger?.warn(
          `[resolveVirtualAndNodeModules] Virtual module detected: ${moduleId}. Providing shim for variable dynamic imports.`
        );
      }

      // _virtual/dynamic-import-helper.js is generated for variable dynamic imports
      // Provide a shim that uses native dynamic import
      const dynamicImportHelper = (specifier: string) => {
        return import(specifier);
      };

      const shim = {
        default: dynamicImportHelper,
        __variableDynamicImportRuntimeHelper: dynamicImportHelper,
      };

      if (exportName) {
        if (
          exportName === "default" ||
          exportName === "__variableDynamicImportRuntimeHelper"
        ) {
          return { [exportName]: dynamicImportHelper };
        }
        return shim;
      }
      return shim;
    }

    // For other virtual modules or node_modules, re-throw the error
    throw error;
  }
}

