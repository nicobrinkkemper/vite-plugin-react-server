import { join } from 'path';
import type { PluginContext } from 'rollup';

export interface BuildLoaderOptions {
  root: string;
  pluginContext: PluginContext;
}

export function createBuildLoader({ root, pluginContext }: BuildLoaderOptions) {
  return async (id: string) => {
    const moduleId = join(root, id);
    
    // Load the module source
    const result = await pluginContext.load({ id: moduleId });
    if (!result) {
      throw new Error(`Failed to load module: ${id}`);
    }

    // Emit as asset and get the URL
    const file = pluginContext.emitFile({
      type: 'asset',
      fileName: id,
      source: result.code ?? ''
    });

    const filename = pluginContext.getFileName(file);
    
    // Import and evaluate the module
    const mod = await import(join(root, filename));
    
    // Return the module exports
    return {
      ...mod,
      id: moduleId,
      code: result.code
    };
  };
}