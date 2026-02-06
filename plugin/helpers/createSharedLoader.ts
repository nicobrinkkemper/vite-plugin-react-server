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
  isServeMode = false,
  effectiveProjectRoot,
  build,
  // Cache busting for dynamic imports (props with db calls)
  bustCache = false,
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
  // Cache busting for dynamic imports (props with db calls)
  bustCache?: boolean;
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
      // Found in manifest - use the resolved path (it's already a full absolute path)
      resolvedModuleID = manifestResolution.resolvedPath;
      if (verbose) {
        logger?.info(
          `[createSharedLoader] Build mode: resolved via manifest to: ${resolvedModuleID}`
        );
      }
    } else {
      // Not in manifest - use the builtModuleId from resolution
      resolvedModuleID = manifestResolution.builtModuleId;
      if (verbose) {
        logger?.info(
          `[createSharedLoader] Build mode: not in manifest, using builtModuleId: ${resolvedModuleID}`
        );
      }
      
      // Check if we need to prefix with build directory
      // A source path starts with moduleBase (e.g., "src/"), a built path doesn't
      // Also check if it's already an absolute path or starts with file://
      const isSourcePath = moduleId.startsWith(moduleBase + "/") || 
                          moduleId.startsWith("./" + moduleBase + "/") ||
                          (isAbsolute(moduleId) && moduleId.includes(moduleBase));
      
      // If it's not a source path and not already absolute, prefix with server build directory
      if (!isSourcePath && !isAbsolute(resolvedModuleID) && effectiveProjectRoot && build) {
        const serverBuildPath = join(
          effectiveProjectRoot,
          build.outDir || "dist",
          build.server || "server"
        );
        resolvedModuleID = join(serverBuildPath, resolvedModuleID);
        if (verbose) {
          logger?.info(
            `[createSharedLoader] Build mode: prefixing with ${serverBuildPath}: ${resolvedModuleID}`
          );
        }
      }
    }
  } else if (isServeMode) {
    // Dev mode: load directly from source files, no build path prefixing
    if (verbose) {
      logger?.info(
        `[createSharedLoader] Dev mode: loading directly from source`
      );
    }
  } else if (isBuildMode && effectiveProjectRoot && build) {
    // Build mode fallback: prefix with server build directory even without manifest/normalizer
    if (!isAbsolute(resolvedModuleID)) {
      const serverBuildPath = join(
        effectiveProjectRoot,
        build.outDir || "dist",
        build.server || "server"
      );
      resolvedModuleID = join(serverBuildPath, resolvedModuleID);
      if (verbose) {
        logger?.info(
          `[createSharedLoader] Build mode fallback: prefixing with ${serverBuildPath}: ${resolvedModuleID}`
        );
      }
    }
  }

  // Step 3: Construct the full path and import
  const fullPath = isAbsolute(resolvedModuleID) 
    ? resolvedModuleID 
    : effectiveProjectRoot 
      ? join(effectiveProjectRoot, resolvedModuleID)
      : resolvedModuleID;

  if (verbose) {
    logger?.info(`[createSharedLoader] Importing from: ${fullPath}`);
  }

  // Step 4: Import the module
  // Add timestamp query param to bust Node's module cache when needed (e.g., props with db calls)
  const fileUrl = isAbsolute(fullPath) ? pathToFileURL(fullPath).href : fullPath;
  const importUrl = bustCache ? `${fileUrl}?t=${Date.now()}` : fileUrl;
  const result = await import(importUrl);

  // Step 5: Validate exports
  if (result == null) {
    throw new Error(`Module "${moduleId}" does not have any exports`);
  }

  if (!Object.keys(result).length && exportName?.length) {
    throw new Error(
      `Module "${moduleId}" is a module, but does not have any exports so it can't find ${exportName}`
    );
  }

  if (exportName && !(exportName in result)) {
    throw new Error(
      `Module "${moduleId}" exists, but does not export "${exportName}"`
    );
  }

  if (verbose) {
    logger?.info(
      `[createSharedLoader] Module loaded successfully, exports: ${Object.keys(
        result
      ).join(", ")}`
    );
  }

  // Import always returns a module object (not a Promise), so return it directly
  return result;
}

