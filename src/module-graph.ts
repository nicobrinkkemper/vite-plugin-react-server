import type { ModuleNode, ViteDevServer } from "vite";

export interface ModuleWithDeps {
  id: string;
  deps: Set<string>;
  css: Set<string>;
}

export function getModuleGraph(server: ViteDevServer) {
  return {
    async getModuleWithDeps(id: string): Promise<ModuleWithDeps> {
      // Load module first to ensure it's in the module graph
      await server.ssrLoadModule(id);

      const resolvedId = await server.pluginContainer.resolveId(id, undefined, {
        // Add ssr and react-server conditions
        ssr: true,
      });

      if (!resolvedId) throw new Error(`Module not found: ${id}`);

      const moduleNode = server.moduleGraph.getModuleById(resolvedId.id);
      if (!moduleNode) throw new Error(`Module node not found: ${id}`);

      const deps = new Set<string>();
      const css = new Set<string>();

      // Recursively collect dependencies
      const collectDeps = (node: ModuleNode) => {
        // Track CSS imports
        if (node.id?.endsWith(".css") && node.id) {
          css.add(node.id);
        }

        // Track all dependencies
        for (const dep of node.importedModules) {
          if (dep.id && !deps.has(dep.id)) {
            deps.add(dep.id);
            collectDeps(dep);
          }
        }
      };

      collectDeps(moduleNode);
      return { id: moduleNode.id ?? "", deps, css };
    },
  };
}
