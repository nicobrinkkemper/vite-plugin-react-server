import type {
  OutputBundle,
  OutputChunk,
} from "rollup";
import type { Manifest } from "vite";
import type { InputNormalizer } from "../types.js";


/**
 * Get the bundle manifest from the plugin context. Will only work during production build
 * @param pluginContext - The plugin context
 * @param bundle - The bundle
 * @param preserveModulesRoot - The preserve modules root
 * @param serverDir - The server directory name from build config
 * @returns The bundle manifest
 */
export function getBundleManifest<SSR extends boolean>({
  bundle,
  normalizer,
  serverDir,
}: {
  bundle: OutputBundle,
  normalizer: InputNormalizer,
  serverDir?: string,
}): SSR extends true ? Record<string, string[]> : Manifest {

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
        const chunkWithFacade = chunk as OutputChunk;
        
        // Get the module ID, preferring facadeModuleId
        const moduleId = chunkWithFacade.facadeModuleId || chunkWithFacade.moduleIds[0] || originalFileName;
        
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
            const virtualFileName = query === 'inline' ? virtualPath : `${virtualPath}.${query}.js`;
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
