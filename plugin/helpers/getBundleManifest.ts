import type {
  NormalizedOutputOptions,
  OutputBundle,
  PluginContext,
  OutputChunk,
} from "rollup";
import { createInputNormalizer } from "./inputNormalizer.js";
import { join } from "path";

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
export function getBundleManifest(
  pluginContext: PluginContext,
  bundle: OutputBundle,
  preserveModulesRoot: string | undefined
): Record<string, BundleManifestEntry> {

  const normalizer = createInputNormalizer({
    root: pluginContext.environment.config.root,
    removeExtension: false,
    preserveModulesRoot:
      typeof preserveModulesRoot === "string" ? preserveModulesRoot : undefined,
  });

  if (!bundle) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(bundle)
      .map(([fileName, chunk]) => {
        if (chunk.type !== "chunk") return null as never;
        const chunkWithFacade = chunk as OutputChunk;

        // Normalize both the module ID and file path
        const [moduleId, sourcePath] = normalizer(
          chunkWithFacade.facadeModuleId || chunkWithFacade.moduleIds[0] || fileName
        );
        return [
          moduleId,
          {
            file: join( pluginContext.environment.config.build.outDir, fileName),
            name: moduleId,
            src: sourcePath.startsWith(pluginContext.environment.config.root) ? sourcePath.slice(pluginContext.environment.config.root.length + 1) : sourcePath,
            isEntry: chunk.isEntry,
            ...(Object.keys(chunk.imports).length > 0
              ? { imports: chunk.imports }
              : {}),
            ...(Object.keys(chunk.dynamicImports).length > 0
              ? { dynamicImports: chunk.dynamicImports }
              : {}),
            ...(chunk.viteMetadata?.importedCss
              ? {
                  css: Array.from(chunk.viteMetadata.importedCss),
                }
              : {}),
          },
        ];
      })
      .filter(Boolean)
  );
}
