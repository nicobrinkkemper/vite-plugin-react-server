import type { Manifest } from "vite";
import { normalizePath } from "vite";

export interface RscManifest {
  clientComponents: Record<string, string>;
}

export function resolveManifestEntry(
  id: string,
  manifest: Manifest
): string | undefined {
  // Try exact match
  if (manifest[id]) {
    return manifest[id].file;
  }

  // Try normalized path
  const normalizedId = normalizePath(id);
  if (manifest[normalizedId]) {
    return manifest[normalizedId].file;
  }

  return undefined;
}
