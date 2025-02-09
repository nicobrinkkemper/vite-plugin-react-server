import type { ModuleInfo, PluginContext } from 'rollup';

interface ModuleManifestEntry {
  file: string;
  name: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
}

export function getModuleManifest(this: PluginContext): Record<string, ModuleManifestEntry> {
  const manifest: Record<string, ModuleManifestEntry> = {};

  // Build module graph from plugin context
  for (const id of this.getModuleIds()) {
    const info = this.getModuleInfo(id);
    if (!info) continue;
    
    manifest[id] = {
      file: info.id,
      src: info.id,
      name: id,
      isEntry: info.isEntry,
      imports: Array.from(info.importedIds),
      dynamicImports: Array.from(info.dynamicallyImportedIds)
    };
  }

  return manifest;
}