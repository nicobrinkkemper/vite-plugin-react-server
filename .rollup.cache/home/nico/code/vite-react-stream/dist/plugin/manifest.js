import { normalizePath } from "vite";
export function resolveManifestEntry(id, manifest) {
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
//# sourceMappingURL=manifest.js.map