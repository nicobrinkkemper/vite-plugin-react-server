import { join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { Logger } from "vite";
import type { InputNormalizer } from "../types.js";
import { resolveVirtualAndNodeModules } from "./resolveVirtualAndNodeModules.js";
import { resolveModuleFromManifest } from "./resolveModuleFromManifest.js";

/**
 * Shared loader utility that both RSC worker loader and build loader can use.
 * 
 * This handles the common pattern:
 * 1. Parse id to get moduleId and exportName
 * 2. Handle virtual modules and node_modules (via resolveVirtualAndNodeModules)
 * 3. Try manifest-based resolution (build mode)
 * 4. Import the module
 * 5. Validate exports
 * 
 * If the result is already a module object (not a Promise), it's returned directly.
 * This allows loaders to reuse already-loaded modules.
 * 
 * @param options - Loader configuration options
 * @returns The resolved module (already a module object, not a Promise)
 */
export async function createSharedLoader({
  moduleId,
  exportName,
  verbose = false,
  logger,
  // Virtual module handling
  resolveVirtual = true,
  // Manifest resolution
  manifest,
  normalizer,
  moduleBase,
  preserveModulesRoot,
  projectRoot,
  buildOutDir,
  buildServerDir,
  // Direct import options
  isBuildMode = false,
  isServeMode: _isServeMode = false,
  effectiveProjectRoot,
  build,
}: {
  moduleId: string;
  exportName?: string;
  verbose?: boolean;
  logger?: Logger;
  // Virtual module handling
  resolveVirtual?: boolean;
  // Manifest resolution
  manifest?: Record<string, { file: string } | undefined>;
  normalizer?: InputNormalizer;
  moduleBase?: string;
  preserveModulesRoot?: boolean;
  projectRoot?: string;
  buildOutDir?: string;
  buildServerDir?: string;
  // Direct import options
  isBuildMode?: boolean;
  isServeMode?: boolean;
  effectiveProjectRoot?: string;
  build?: {
    server?: string;
    client?: string;
    static?: string;
    outDir?: string;
  };
}): Promise<Record<string, any>> {
  // Step 1: Handle virtual modules and node_modules first (if enabled)
  if (resolveVirtual) {
    const virtualOrNodeModule = await resolveVirtualAndNodeModules(
      moduleId,
      exportName,
      verbose,
      logger
    );
    if (virtualOrNodeModule !== null) {
      // resolveVirtualAndNodeModules returns a module object directly (not a Promise)
      // If it's already a module object, return it directly
      return virtualOrNodeModule;
    }
  }

  // Step 2: Try manifest-based resolution (build mode)
  let resolvedModuleID = moduleId;
  if (isBuildMode && manifest && normalizer && moduleBase && projectRoot && buildOutDir && buildServerDir) {
    const manifestResolution = resolveModuleFromManifest({
      moduleId,
      normalizer,
      manifest,
      moduleBase,
      preserveModulesRoot,
      projectRoot,
      buildOutDir,
      buildServerDir,
      verbose,
      logger,
    });

    if (manifestResolution.manifestEntry && manifestResolution.resolvedPath) {
      resolvedModuleID = manifestResolution.resolvedPath;
    } else {
      resolvedModuleID = manifestResolution.builtModuleId;
      
      // Prefix non-source, non-absolute paths with server build directory
      const isSourcePath = moduleId.startsWith(moduleBase + "/") || 
                          moduleId.startsWith("./" + moduleBase + "/") ||
                          (isAbsolute(moduleId) && moduleId.includes(moduleBase));
      
      if (!isSourcePath && !isAbsolute(resolvedModuleID) && effectiveProjectRoot && build) {
        resolvedModuleID = join(
          effectiveProjectRoot,
          build.outDir || "dist",
          build.server || "server",
          resolvedModuleID
        );
      }
    }
  } else if (isBuildMode && effectiveProjectRoot && build && !isAbsolute(resolvedModuleID)) {
    // Build mode fallback without manifest
    resolvedModuleID = join(
      effectiveProjectRoot,
      build.outDir || "dist",
      build.server || "server",
      resolvedModuleID
    );
  }

  // Step 3: Construct the full path and import
  const fullPath = isAbsolute(resolvedModuleID) 
    ? resolvedModuleID 
    : effectiveProjectRoot 
      ? join(effectiveProjectRoot, resolvedModuleID)
      : resolvedModuleID;

  // Import the module
  const fileUrl = isAbsolute(fullPath) ? pathToFileURL(fullPath).href : fullPath;
  const result = await import(fileUrl);

  // Validate exports
  if (result == null) {
    throw new Error(`Module "${moduleId}" does not have any exports`);
  }
  if (!Object.keys(result).length && exportName?.length) {
    throw new Error(`Module "${moduleId}" has no exports, can't find ${exportName}`);
  }
  if (exportName && !(exportName in result)) {
    throw new Error(`Module "${moduleId}" does not export "${exportName}"`);
  }

  return result;
}

