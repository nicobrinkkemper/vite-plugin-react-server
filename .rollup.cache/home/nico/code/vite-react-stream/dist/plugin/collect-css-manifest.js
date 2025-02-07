export async function collectModuleGraphCss(moduleGraph, pagePath, onCss) {
    if (!pagePath)
        return new Map();
    const cssFiles = new Map();
    const pageModule = await moduleGraph.getModuleByUrl(pagePath, true);
    if (!pageModule) {
        return new Map();
    }
    const seen = new Set();
    const walkModule = (mod) => {
        if (!mod?.id || seen.has(mod.id))
            return;
        seen.add(mod.id);
        if (mod?.id?.endsWith(".css")) {
            cssFiles.set(mod?.url, mod?.id);
        }
        mod?.importedModules?.forEach((imp) => walkModule(imp));
    };
    walkModule(pageModule);
    return cssFiles;
}
export function collectManifestCss(manifest, root, pagePath, onCss) {
    const relativePagePath = pagePath.startsWith(root + "/")
        ? pagePath.slice(root.length + 1)
        : pagePath;
    if (!relativePagePath)
        return new Map();
    const cssFiles = new Map();
    const seen = new Set();
    const walkManifestEntry = (id) => {
        if (seen.has(id))
            return;
        seen.add(id);
        if (id.endsWith(".css")) {
            cssFiles.set(id, id);
            onCss?.(id);
            return;
        }
        // Get the manifest entry
        const entry = manifest[id];
        if (!entry)
            return;
        // Add direct CSS
        if (entry.css) {
            entry.css.forEach((css) => {
                cssFiles.set(entry.file, css);
                onCss?.(css);
            });
        }
        // Walk imports recursively
        if (entry.imports) {
            entry.imports.forEach((imp) => walkManifestEntry(imp));
        }
        // Also check dynamicImports
        if (entry.dynamicImports) {
            entry.dynamicImports.forEach((imp) => walkManifestEntry(imp));
        }
    };
    if (manifest[relativePagePath]) {
        walkManifestEntry(relativePagePath);
    }
    return cssFiles;
}
//# sourceMappingURL=collect-css-manifest.js.map