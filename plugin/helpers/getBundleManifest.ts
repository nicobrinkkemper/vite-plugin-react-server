import type {
  OutputBundle,
  // OutputChunk - removed unused import
} from "rollup";
import type {  ManifestChunk } from "vite";
import type { InputNormalizer } from "../types.js";


/**
 * Get the bundle manifest from the plugin context. Will only work during production build
 * @param pluginContext - The plugin context
 * @param bundle - The bundle
 * @param preserveModulesRoot - The preserve modules root
 * @returns The bundle manifest
 */
export function getBundleManifest<SSR extends boolean>({
  bundle,
  normalizer,
}: {
  bundle: OutputBundle,
  normalizer: InputNormalizer,
}): SSR extends true ? Record<string, string[]> : {
  [key: string]: ManifestChunk & {
    source: string,
  }
} {

  if (!bundle) return {};

  // Track virtual modules to prevent duplicates
  const virtualModules = new Map<string, string>();

  const bundleManifest = Object.fromEntries(
    Object.entries(bundle)
      .map(([originalFileName, chunk]) => {
        if(!originalFileName && 'file' in chunk) {
          return [
            chunk.file,
            {
              file: chunk.file,
              source: 'source' in chunk ? chunk.source : undefined,
            }
          ]
        }
        if (chunk.type === "asset") {
          return [
            originalFileName,
            {
              file: chunk.fileName,
              name: chunk.names[0],
              src: originalFileName,
              source: chunk.source,
              isEntry: chunk.needsCodeReference,
            }
          ]
        }
        
        // Get the module ID, preferring facadeModuleId
        const moduleId = chunk.facadeModuleId || chunk.moduleIds[0] || originalFileName;
        
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
        let [normalizedId, sourcePath] = normalizer(moduleId);

        // For virtual modules, use a consistent naming scheme
        let finalFileName = originalFileName;
        if (moduleId.includes('?')) {
          const [basePath, query] = moduleId.split('?');
          const virtualPath = basePath.includes('node_modules') 
            ? basePath.split('node_modules/')[1] 
            : basePath;
          
          // Create a unique key for this virtual module
          const virtualKey = `${virtualPath}?${query}`;
          
          if (!virtualModules.has(virtualKey)) {
            // First time seeing this virtual module
            let virtualFileName;
            if (query === 'inline') {
              virtualFileName = virtualPath;
            } else if (virtualPath.endsWith('.css')) {
              // Preserve CSS extension for CSS files
              virtualFileName = virtualPath;
            } else {
              // Add .js extension for other files
              virtualFileName = `${virtualPath}.${query}.js`;
            }
            virtualModules.set(virtualKey, virtualFileName);
          }
          
          finalFileName = virtualModules.get(virtualKey)!;
        }

        // handle preserveModulesRoot
        if(normalizedId.startsWith('\x00')){
          normalizedId = normalizedId.slice(1);
        }
        if(sourcePath.startsWith('/')){
          sourcePath = sourcePath.slice(1);
        }

        
        const withCss = chunk.viteMetadata?.importedCss?.size ? {
          css: Array.from(chunk.viteMetadata.importedCss),
        } : {};
        const bundleManifestEntry = [
          sourcePath,
          {
            file: finalFileName,
            name: normalizedId,
            src: sourcePath,
            isEntry: chunk.isEntry,
            ...(chunk.imports?.length > 0 ? { imports: chunk.imports } : {}),
            ...(chunk.dynamicImports?.length > 0 ? { dynamicImports: chunk.dynamicImports } : {}),
            ...withCss,
          },
        ];
        return bundleManifestEntry;
      })
      .filter(Boolean)
  );
  return bundleManifest;
}
