import type { Manifest } from "vite";

/**
 * Collects CSS file paths from a manifest by walking through imports starting from a given file
 */
export function collectManifestCss(
  manifest: Manifest,
  startFile: string | string[],
): Record<string, string> {
  const cssInputs: Record<string, string> = {};
  const visited = new Set<string>();
  
  // Convert startFile to array and ensure we have valid file paths
  const toVisit = Array.isArray(startFile) ? startFile : [startFile];

  // Helper function to find manifest entry by file property
  const findManifestEntryByFile = (filePath: string) => {
    for (const [key, value] of Object.entries(manifest)) {
      if (value && typeof value === 'object' && 'file' in value && value.file === filePath) {
        return { key, value };
      }
    }
    return null;
  };
  
  while (toVisit.length > 0) {
    const currentFile = toVisit.pop()!;
    if (visited.has(currentFile)) continue;
    visited.add(currentFile);
    
    // First try to find by key (for direct matches)
    let fileInfo = manifest[currentFile];
    
    // If not found by key, try to find by file property
    if (!fileInfo) {
      const found = findManifestEntryByFile(currentFile);
      if (found) {
        fileInfo = found.value;
      }
    }
    
    if (!fileInfo) {
      continue;
    }

    // Add CSS files from the css property
    if (fileInfo.css) {
      for (const cssFile of fileInfo.css) {
        cssInputs[cssFile] = cssFile;
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
        
        // Check if the imported file has CSS by finding it in the manifest
        const importedEntry = findManifestEntryByFile(importPath);
        if (importedEntry?.value.css) {
          for (const cssFile of importedEntry.value.css) {
            cssInputs[cssFile] = cssFile;
          }
        }
      }
    }
  }

  return cssInputs;
} 