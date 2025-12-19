import { resolve } from "node:path";
import type { Logger } from "vite";
import type { InputNormalizer } from "../types.js";

/**
 * Shared utility for resolving module paths from manifests.
 * 
 * This handles the common pattern of:
 * 1. Normalizing the moduleId using the normalizer (if provided)
 * 2. Looking up a source path in a manifest to get the built file path
 * 3. Handling different manifest key formats (with/without moduleBase prefix)
 * 4. Resolving the full file path for loading
 * 
 * Used by both:
 * - RSC worker loader (createRscWorkerLoader)
 * - Build loader (createBuildLoader.server)
 */
export function resolveModuleFromManifest({
  moduleId,
  normalizer,
  manifest,
  moduleBase,
  preserveModulesRoot,
  projectRoot,
  buildOutDir,
  buildServerDir,
  verbose = false,
  logger,
}: {
  moduleId: string;
  normalizer?: InputNormalizer;
  manifest: Record<string, { file: string } | undefined>;
  moduleBase: string;
  preserveModulesRoot?: boolean;
  projectRoot: string;
  buildOutDir: string;
  buildServerDir: string;
  verbose?: boolean;
  logger?: Logger;
}): {
  manifestEntry: { file: string } | undefined;
  resolvedPath: string | null;
  builtModuleId: string;
} {
  // Normalize the moduleId using the normalizer (same logic as buildLoader)
  let normalizedKey = moduleId;
  let normalizedValue = moduleId;
  if (normalizer) {
    [normalizedKey, normalizedValue] = normalizer(moduleId);
  }
  // Try to find manifest entry using normalized keys
  let manifestEntry = manifest[normalizedValue] ?? manifest[normalizedKey];

  // If not found and preserveModulesRoot is false, try with the moduleBase prefix removed
  if (
    !manifestEntry &&
    preserveModulesRoot === false &&
    normalizedValue.startsWith(moduleBase + "/")
  ) {
    const withoutModuleBase = normalizedValue.replace(
      moduleBase + "/",
      ""
    );
    manifestEntry = manifest[withoutModuleBase];
    
    if (verbose && manifestEntry) {
      logger?.info(
        `[resolveModuleFromManifest] Found entry after removing moduleBase: ${withoutModuleBase} -> ${manifestEntry.file}`
      );
    }
  }

  // If we found a manifest entry, use its file path
  let builtModuleId = moduleId;
  if (manifestEntry && manifestEntry.file) {
    builtModuleId = manifestEntry.file;
    if (verbose) {
      logger?.info(
        `[resolveModuleFromManifest] Resolved ${moduleId} -> ${builtModuleId} via manifest`
      );
    }
  } else if (verbose) {
    logger?.warn(
      `[resolveModuleFromManifest] No manifest entry found for ${moduleId} (tried keys: ${normalizedValue}, ${normalizedKey}), using moduleId directly`
    );
  }

  // Construct the full resolved path
  const resolvedPath = manifestEntry
    ? resolve(projectRoot, buildOutDir, buildServerDir, manifestEntry.file)
    : null;

  return {
    manifestEntry,
    resolvedPath,
    builtModuleId,
  };
}

