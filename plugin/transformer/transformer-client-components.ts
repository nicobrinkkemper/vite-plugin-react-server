import { SourceMapGenerator } from "source-map";
import type { Plugin } from "vite";
import type { Plugin as RollupPlugin } from "rollup";
import type { TransformerOptions } from "./types.js";

export function createClientComponentTransformer({
  moduleId: userModuleId,
}: TransformerOptions): RollupPlugin {
  let moduleIdFn = userModuleId;

  return {
    name: "vite-plugin-react-server:client-components-transformer",

    async transform(code: string, id: string, options?: { ssr?: boolean }) {
      try {
        // Skip node_modules and vite internal files
        if (id.includes('node_modules') || id.includes('vite/dist')) {
          return null;
        }

        // Check if this is a client component from metadata or directive
        const info = this?.getModuleInfo(id);
        const hasDirective = code.match(/^["']use client["'];?/);
        const isClientComponent = hasDirective || info?.meta?.['directives']?.includes('use client');

        if (!isClientComponent) {
          return null;  // Not a client component, skip
        }

        let transformedCode = code;
        const moduleId = moduleIdFn!(id, options?.ssr ?? false);

        // Find all named exports
        const exportMatches = Array.from(
          code.matchAll(/export\s+(?:const|let|var|function|class)\s+(\w+)/g)
        );

        if (!exportMatches.length) {
          return null;
        }

        // Transform each export
        for (const [fullMatch, exportName] of exportMatches) {
          if (!exportName) continue;

          const isClass = fullMatch.includes("class");

          // Remove export keyword
          transformedCode = transformedCode.replace(
            fullMatch,
            fullMatch.replace("export ", "")
          );

          transformedCode += `
const ${exportName}Ref = Object.defineProperties(
  ${isClass 
    ? `class extends ${exportName} {
        constructor(...args) { super(...args); }
      }`
    : `function(...args) { return ${exportName}.apply(null, args); }`
  },
  {
    $$typeof: { value: Symbol.for("react.client.reference") },
    $$id: { value: ${JSON.stringify(moduleId + "#" + exportName)} },
    $$filepath: { value: ${JSON.stringify(id)} }
  }
);
export { ${exportName}Ref as ${exportName} };`;
        }

        return { code: transformedCode, map: null };
      } catch (error) {
        console.error(`[RSC] Error transforming client component: ${id}`, error);
        throw error;
      }
    },
  };
}

/**
 * transformedCode += `
const ${exportName}Ref = Object.defineProperties(
  ${
    isClass
      ? `class extends ${exportName} {
          constructor(...args) { super(...args); }
        }`
      : `function(...args) { return ${exportName}.apply(null, args); }`
  },
  {
    $$typeof: { value: Symbol.for("react.client.reference") },
    $$id: { value: ${JSON.stringify(moduleId + "#" + exportName)} }
  }
);
export { ${exportName}Ref as ${exportName} };`;
 */
