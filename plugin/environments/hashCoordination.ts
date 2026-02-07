import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Shared hash cache across all environments and plugins
const sharedHashCache = new Map<string, string>();

/**
 * Generate a consistent content-based hash for a file
 * This ensures the same file gets the same hash across all environments
 */
export function generateContentHash(originalFilePath: string): string {
  if (sharedHashCache.has(originalFilePath)) {
    return sharedHashCache.get(originalFilePath)!;
  }

  try {
    const originalContent = readFileSync(originalFilePath, 'utf-8');
    const contentHash = createHash('md5').update(originalContent).digest('hex').slice(0, 8);
    sharedHashCache.set(originalFilePath, contentHash);
    return contentHash;
  } catch (error) {
    // Fallback: return empty string if file can't be read
    return '';
  }
}

/**
 * Get the cached hash for a file if it exists
 */
export function getCachedHash(originalFilePath: string): string | undefined {
  return sharedHashCache.get(originalFilePath);
}

/**
 * Clear the hash cache (useful for testing)
 */
export function clearHashCache(): void {
  sharedHashCache.clear();
}
