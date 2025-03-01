import type { Manifest, ModuleGraph } from 'vite';

export async function collectModuleGraphCss(
  moduleGraph: ModuleGraph,
  pagePath: string,
  onCss?: (path: string) => void
) {
  if (!pagePath) return new Map<string, string>();

  const cssFiles = new Map<string, string>();
  const pageModule = await moduleGraph.getModuleByUrl(pagePath, true);
  if (!pageModule) {
    return new Map<string, string>();
  }
  const seen = new Set<string>();
  const walkModule = (mod: any) => {
    if (!mod?.id || seen.has(mod.id)) return;
    seen.add(mod.id);
    if (mod?.id?.endsWith(".css")) {
      cssFiles.set(mod?.url, mod?.id);
      onCss?.(mod?.url);
    }
    mod?.importedModules?.forEach((imp: any) => walkModule(imp));
  };
  walkModule(pageModule);
  return cssFiles;
}

export function collectManifestCss(
  manifest: Manifest,
  root: string,
  pagePath: string,
  onCss?: (path: string, parentUrl: string) => void,
  parentUrl?: string
) {
  const relativePagePath = root !== "" && pagePath.startsWith(root.endsWith('/') ? root : root + '/')
    ? pagePath.slice(root.length + (root.endsWith('/') ? 0 : 1))
    : pagePath;
  const cssFiles = new Map<string, string>();
  const seen = new Set<string>();
  const manifestValues = Object.values(manifest);
  const walkManifestEntry = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    if (id.endsWith(".css")) {
      cssFiles.set(id, id);
      onCss?.(id, parentUrl ?? pagePath);
      return;
    }
    if (id.endsWith(".css.js")) {
      cssFiles.set(id.slice(0, -3), id.slice(0, -3));
      onCss?.(id.slice(0, -3), parentUrl ?? pagePath);
      return;
    }
    // Get the manifest entry
    const entry = manifest[id] ?? manifestValues.find(e => e.file === id);
    if (!entry) return;

    // Add direct CSS
    if (entry.css) {
      entry.css.forEach((css: string) => {
        cssFiles.set(entry.src ?? entry.file ?? '', css);
        onCss?.(css, parentUrl ?? pagePath);
      });
    }

    // Walk imports recursively
    if (entry.imports) {
      entry.imports.forEach((imp: string) => walkManifestEntry(imp));
    }

    // Also check dynamicImports
    if (entry.dynamicImports) {
      entry.dynamicImports.forEach((imp: string) => walkManifestEntry(imp));
    }
  };

  if (manifest[relativePagePath]) {
    walkManifestEntry(relativePagePath);
  }
  return cssFiles;
}
