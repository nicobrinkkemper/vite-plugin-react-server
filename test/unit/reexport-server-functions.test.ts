import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setStashedGetSource } from 'vite-plugin-react-server/helpers';
import { createTransformer } from 'vite-plugin-react-server/loader';
import { DEFAULT_LOADER_CONFIG } from 'vite-plugin-react-server/config';

describe('Re-export Server Functions', () => {
  const mockGetSourceFunction = vi.fn();
  let transform: (source: string, moduleId: string) => Promise<{ code: string; map: any }>;

  beforeEach(() => {
    mockGetSourceFunction.mockReset();
    setStashedGetSource(mockGetSourceFunction);

    // Create transformer with server environment settings
    transform = createTransformer({
      options: {
        loader: DEFAULT_LOADER_CONFIG,
        verbose: false,
        panicThreshold: 'none',
      },
      forceServerFunction: true,
      isServerEnvironment: true,
    });
  });

  describe('export { name } from "./module"', () => {
    it('should use current module ID for re-exported server functions (React behavior)', async () => {
      // Mock the original module source
      mockGetSourceFunction.mockImplementation((moduleId) => {
        if (moduleId === './original-actions.js') {
          return Promise.resolve({
            source: `
              export async function addTodo(title) {
                return { success: true, title };
              }
            `
          });
        }
        return Promise.reject(new Error('Module not found'));
      });

      const reExportingModule = `
        "use server";
        export { addTodo } from "./original-actions.js";
      `;

      const result = await transform(reExportingModule, '/actions.server.js');

      // React's loader registers re-exports with the current module ID, not the original
      expect(result.code).toContain('registerServerReference(addTodo, "/actions.server.js", "addTodo")');
      expect(result.code).not.toContain('registerServerReference(addTodo, "./original-actions.js", "addTodo")');
    });

    it('should handle multiple re-exported functions', async () => {
      mockGetSourceFunction.mockImplementation((moduleId) => {
        if (moduleId === './todo-actions.js') {
          return Promise.resolve({
            source: `
              export async function addTodo(title) { return { success: true }; }
              export async function deleteTodo(id) { return { success: true }; }
            `
          });
        }
        return Promise.reject(new Error('Module not found'));
      });

      const reExportingModule = `
        "use server";
        export { addTodo, deleteTodo } from "./todo-actions.js";
      `;

      const result = await transform(reExportingModule, '/actions.server.js');

      // React's loader registers re-exports with the current module ID
      expect(result.code).toContain('registerServerReference(addTodo, "/actions.server.js", "addTodo")');
      expect(result.code).toContain('registerServerReference(deleteTodo, "/actions.server.js", "deleteTodo")');
    });

    it('should handle mixed local and re-exported functions', async () => {
      mockGetSourceFunction.mockImplementation((moduleId) => {
        if (moduleId === './external.js') {
          return Promise.resolve({
            source: `export async function externalAction() { return "external"; }`
          });
        }
        return Promise.reject(new Error('Module not found'));
      });

      const mixedModule = `
        "use server";
        export { externalAction } from "./external.js";
        export async function localAction() {
          return "local";
        }
      `;

      const result = await transform(mixedModule, '/mixed.server.js');

      // Local function should use current module ID
      expect(result.code).toContain('registerServerReference(localAction, "/mixed.server.js", "localAction")');
      // Re-exported function should also use current module ID (React behavior)
      expect(result.code).toContain('registerServerReference(externalAction, "/mixed.server.js", "externalAction")');
    });
  });

  describe('export * from "./module"', () => {
    it('should ignore export * declarations (React behavior)', async () => {
      mockGetSourceFunction.mockImplementation((moduleId) => {
        if (moduleId === './all-actions.js') {
          return Promise.resolve({
            source: `
              export async function action1() { return 1; }
              export async function action2() { return 2; }
            `
          });
        }
        return Promise.reject(new Error('Module not found'));
      });

      const exportAllModule = `
        "use server";
        export * from "./all-actions.js";
      `;

      const result = await transform(exportAllModule, '/barrel.server.js');

      // React's loader ignores export * completely
      expect(result.code).not.toContain('registerServerReference(action1');
      expect(result.code).not.toContain('registerServerReference(action2');
    });
  });

  describe('export { default as name } from "./module"', () => {
    it('should handle default export re-exports', async () => {
      mockGetSourceFunction.mockImplementation((moduleId) => {
        if (moduleId === './default-action.js') {
          return Promise.resolve({
            source: `export default async function submitForm() { return "submitted"; }`
          });
        }
        return Promise.reject(new Error('Module not found'));
      });

      const defaultReExport = `
        "use server";
        export { default as submitForm } from "./default-action.js";
      `;

      const result = await transform(defaultReExport, '/forms.server.js');

      // React's loader registers re-exports with the current module ID
      // And uses the exported name (not local name) to avoid invalid JavaScript
      expect(result.code).toContain('registerServerReference(submitForm, "/forms.server.js", "submitForm")');
    });
  });

  describe('nested re-exports', () => {
    it('should use current module ID for nested re-exports (React behavior)', async () => {
      mockGetSourceFunction.mockImplementation((moduleId) => {
        if (moduleId === './level1.js') {
          return Promise.resolve({
            source: `export { deepAction } from "./level2.js";`
          });
        }
        if (moduleId === './level2.js') {
          return Promise.resolve({
            source: `export async function deepAction() { return "deep"; }`
          });
        }
        return Promise.reject(new Error('Module not found'));
      });

      const topLevelModule = `
        "use server";
        export { deepAction } from "./level1.js";
      `;

      const result = await transform(topLevelModule, '/top.server.js');

      // React's loader registers re-exports with the current module ID, not the original
      expect(result.code).toContain('registerServerReference(deepAction, "/top.server.js", "deepAction")');
    });
  });

  describe('error scenarios', () => {
    it('should use current module ID when source module cannot be resolved', async () => {
      mockGetSourceFunction.mockRejectedValue(new Error('Module not found'));

      const reExportingModule = `
        "use server";
        export { unknownAction } from "./missing-module.js";
      `;

      const result = await transform(reExportingModule, '/fallback.server.js');

      // React's loader always uses current module ID for re-exports
      expect(result.code).toContain('registerServerReference(unknownAction, "/fallback.server.js", "unknownAction")');
    });

    it('should handle circular re-exports gracefully', async () => {
      let callCount = 0;
      mockGetSourceFunction.mockImplementation((moduleId) => {
        callCount++;
        if (callCount > 10) {
          throw new Error('Circular dependency detected');
        }
        if (moduleId === './circular1.js') {
          return Promise.resolve({
            source: `export { circularAction } from "./circular2.js";`
          });
        }
        if (moduleId === './circular2.js') {
          return Promise.resolve({
            source: `export { circularAction } from "./circular1.js";`
          });
        }
        return Promise.reject(new Error('Module not found'));
      });

      const circularModule = `
        "use server";
        export { circularAction } from "./circular1.js";
      `;

      const result = await transform(circularModule, '/circular.server.js');

      // React's loader uses current module ID regardless of circular dependencies
      expect(result.code).toContain('registerServerReference(circularAction, "/circular.server.js", "circularAction")');
    });
  });

  describe('React Server Components stream compatibility', () => {
    it('should generate server references compatible with RSC serialization', async () => {
      mockGetSourceFunction.mockImplementation((moduleId) => {
        if (moduleId === '/server/actions/todoActions.server.js') {
          return Promise.resolve({
            source: `
              export async function addTodo(title) { return { success: true }; }
              export async function toggleTodo(id) { return { success: true }; }
            `
          });
        }
        return Promise.reject(new Error('Module not found'));
      });

      const indexModule = `
        "use server";
        export { addTodo, toggleTodo } from "/server/actions/todoActions.server.js";
      `;

      const result = await transform(indexModule, '/actions/index.server.js');

      // React's loader registers re-exports with the current module ID
      // The resulting registrations should produce stream IDs like:
      // {"id":"/actions/index.server.js#addTodo","bound":null}
      expect(result.code).toContain('registerServerReference(addTodo, "/actions/index.server.js", "addTodo")');
      expect(result.code).toContain('registerServerReference(toggleTodo, "/actions/index.server.js", "toggleTodo")');
    });
  });
}); 