import type {
  OutputBundle,
  PluginContext,
  OutputChunk,
} from "rollup";
import { createInputNormalizer } from "./inputNormalizer.js";
import { join } from "path";
import { DEFAULT_CONFIG, resolveOptions } from "../config/index.js";

interface BundleManifestEntry {
  file: string;
  name: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}

/**
 * Get the bundle manifest from the plugin context. Will only work during production build
 * @param pluginContext - The plugin context
 * @param bundle - The bundle
 * @param preserveModulesRoot - The preserve modules root
 * @returns The bundle manifest
 */
export function getBundleManifest({
  pluginContext,
  bundle,
  moduleBase,
  preserveModulesRoot,
}: {
  pluginContext: PluginContext,
  bundle: OutputBundle,
  moduleBase?: string,
  preserveModulesRoot?: boolean,
}): Record<string, BundleManifestEntry> {

  const normalizer = createInputNormalizer({
    root: pluginContext.environment.config.root,
    removeExtension: DEFAULT_CONFIG.FILE_REGEX,
    preserveModulesRoot: preserveModulesRoot === true ? moduleBase : undefined,
  });

  if (!bundle) return {};

  // Track virtual modules to prevent duplicates
  const virtualModules = new Map<string, string>();

  const bundleManifest = Object.fromEntries(
    Object.entries(bundle)
      .map(([fileName, chunk]) => {
        if (chunk.type !== "chunk") return null as never;
        const chunkWithFacade = chunk as OutputChunk;
        
        // Get the module ID, preferring facadeModuleId
        const moduleId = chunkWithFacade.facadeModuleId || chunkWithFacade.moduleIds[0] || fileName;
        
        // Handle commonjs helpers specially - must be done before normalization
        if (moduleId.includes('commonjsHelpers')) {
          return [
            moduleId,
            {
              file: 'commonjs-runtime.js',
              name: 'commonjsHelpers',
              src: moduleId,
              isEntry: false
            }
          ];
        }
        
        // Normalize both paths, removing the root prefix
        const [normalizedId, sourcePath] = normalizer(moduleId);

        // For virtual modules, use a consistent naming scheme
        let finalFileName = fileName;
        if (moduleId.includes('?')) {
          const [basePath, query] = moduleId.split('?');
          const virtualPath = basePath.includes('node_modules') 
            ? basePath.split('node_modules/')[1] 
            : basePath;
          
          // Create a unique key for this virtual module
          const virtualKey = `${virtualPath}?${query}`;
          
          if (!virtualModules.has(virtualKey)) {
            // First time seeing this virtual module
            const virtualFileName = `${virtualPath.replace(/\.js$/, '')}.${query}.js`;
            virtualModules.set(virtualKey, virtualFileName);
          }
          
          finalFileName = virtualModules.get(virtualKey)!;
        }
        const bundleManifestEntry = [
          sourcePath,
          {
            file: finalFileName,
            name: normalizedId.startsWith('\x00') ? normalizedId.replace('\x00', '') : normalizedId,
            src: sourcePath.startsWith('/') ? sourcePath.slice(1) : sourcePath,
            isEntry: chunk.isEntry,
            ...(chunk.imports?.length > 0 ? { imports: chunk.imports } : {}),
            ...(chunk.dynamicImports?.length > 0 ? { dynamicImports: chunk.dynamicImports } : {}),
            ...(chunk.viteMetadata?.importedCss?.size ? {
              css: Array.from(chunk.viteMetadata.importedCss),
            } : {}),
          },
        ];
        return bundleManifestEntry;
      })
      .filter(Boolean)
  );
  return bundleManifest;
}
