import type { Manifest, ModuleGraph } from "vite";
import { createInputNormalizer } from "./helpers/inputNormalizer.js";
import { DEFAULT_CONFIG } from "./config/defaults.js";

export async function collectModuleGraphCss({
  moduleGraph,
  pagePath,
  onCss,
  parentUrl,
}: {
  moduleGraph: ModuleGraph;
  pagePath: string;
  onCss?: (path: string, parentUrl: string) => void;
  parentUrl?: string;
}) {
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
      onCss?.(mod?.url, parentUrl ?? pagePath);
    }
    mod?.importedModules?.forEach((imp: any) => walkModule(imp));
  };
  walkModule(pageModule);
  return cssFiles;
}

export function collectManifestClientFiles({
  manifest,
  root,
  pagePath,
  preserveModulesRoot,
  moduleBase,
  onCss,
  onClientModule,
  testCss = DEFAULT_CONFIG.AUTO_DISCOVER.cssPattern,
  testCssModule = DEFAULT_CONFIG.AUTO_DISCOVER.cssModulePattern,
  testClient = DEFAULT_CONFIG.AUTO_DISCOVER.clientComponents,
  testJson = DEFAULT_CONFIG.AUTO_DISCOVER.jsonPattern,
}: {
  manifest: Manifest;
  root: string;
  pagePath: string;
  preserveModulesRoot?: boolean;
  moduleBase?: string;
  onCss?: (path: string, parentUrl: string) => void;
  onClientModule?: (path: string, parentUrl: string) => void;
  parentUrl?: string;
  testCss?: (id: string) => boolean;
  testCssModule?: (id: string) => boolean;
  testClient?: (id: string) => boolean;
  testJson?: (id: string) => boolean;
}) {
  const normalizer = createInputNormalizer({
    root,
    removeExtension: true,
    preserveModulesRoot: preserveModulesRoot ? moduleBase : undefined,
  });
  const [key, value] = normalizer(pagePath);

  const cssFiles = new Map<string, string>();
  const clientFiles = new Map<string, string>();
  const seen = new Set<string>();
  const manifestValues = Object.values(manifest);

  // Try different variations of the path
  const possibleKeys = [
    value, // Relative path
  ];

  const walkManifestEntry = (id: string, parentUrl: string) => {
    if (seen.has(id)) return;
    seen.add(id);

    // Get the manifest entry
    const entry = manifest[id] ?? manifestValues.find((e) => id === e.file);
    if (!entry) {
      console.log(
        `No manifest entry found for ${id}, possible keys: ${Object.keys(
          manifest
        ).join(", ")}`
      );
      return;
    }
    if (
      (typeof testClient === "function" &&
        typeof onClientModule === "function" &&
        testClient(entry.file)) ||
      (typeof testJson === "function" && testJson(entry.file))
    ) {
      onClientModule?.(entry.file ?? "", parentUrl);
      clientFiles.set(id, entry.name ?? "");
    }

    // Add direct CSS from the css array
    if (entry.css) {
      entry.css.forEach((css: string) => {
        cssFiles.set(css, css);
        onCss?.(css, id);
        onClientModule?.(css, id);
      });
    }

    // Walk imports recursively
    if (entry.imports) {
      entry.imports.forEach((imp: string) =>
        walkManifestEntry(imp, entry.file)
      );
    }

    // Also check dynamicImports
    if (entry.dynamicImports) {
      entry.dynamicImports.forEach((imp: string) =>
        walkManifestEntry(imp, entry.file)
      );
    }
  };

  // Try all possible keys
  for (const possibleKey of possibleKeys) {
    if (manifest[possibleKey]) {
      walkManifestEntry(possibleKey, pagePath);
      break;
    }
  }

  // If no entry found by key, try matching by file
  if (cssFiles.size === 0) {
    const entry = manifestValues.find(
      (e) =>
        possibleKeys.includes(e.file) ||
        (e.src && possibleKeys.includes(e.src)) ||
        (e.name && possibleKeys.includes(e.name))
    );
    if (entry) {
      walkManifestEntry(value, pagePath);
    } else {
      console.warn(
        `No manifest entry found for ${value} (tried all possible keys: ${possibleKeys.join(
          ", "
        )})`
      );
    }
  }

  return { cssFiles, clientFiles };
}
