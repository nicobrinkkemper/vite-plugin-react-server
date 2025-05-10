import type { Manifest } from "vite";
import type { ResolvedUserOptions } from "../types.js";

/**
 * Collects CSS file paths from a manifest by walking through imports starting from a given file
 */
export function collectManifestCss(
  manifest: Manifest,
  startFile: string | string[],
  userOptions: Pick<ResolvedUserOptions, "normalizer">
): Record<string, string> {
  const cssInputs: Record<string, string> = {};
  const visited = new Set<string>();
  
  // Convert startFile to array and ensure we have valid file paths
  const toVisit = Array.isArray(startFile) ? startFile : [startFile];

  
  while (toVisit.length > 0) {
    const currentFile = toVisit.pop()!;
    if (visited.has(currentFile)) continue;
    visited.add(currentFile);
    
    const fileInfo = manifest[currentFile];
    if (!fileInfo) {
      continue;
    }

    // Add CSS files from the css property
    if (fileInfo.css) {
      for (const cssFile of fileInfo.css) {
        const [keyNormalized, valueNormalized] = userOptions.normalizer(cssFile);
        cssInputs[keyNormalized] = valueNormalized;
      }
    }

    // Add imports to visit
    if (fileInfo.imports) {
      for (const importPath of fileInfo.imports) {
        // Skip if we've already visited this import
        if (visited.has(importPath)) {
          continue;
        }
        
        // Add the import to visit
        toVisit.push(importPath);
        
        // Check if the imported file has CSS
        const importedFile = manifest[importPath];
        if (importedFile?.css) {
          for (const cssFile of importedFile.css) {
            const [keyNormalized, valueNormalized] = userOptions.normalizer(cssFile);
            cssInputs[keyNormalized] = valueNormalized;
          }
        }
      }
    }
  }

  return cssInputs;
} 