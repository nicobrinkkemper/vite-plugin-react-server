import { SourceMapGenerator } from "source-map";
import type { TransformerOptions } from "./types.js";

export function createServerActionTransformer(options: TransformerOptions) {
  return {
    name: "vite-plugin-react-server:server-actions-transformer",
    enforce: "post" as const,

    async transform(
      code: string,
      path: string,
      { ssr }: { ssr: boolean } = { ssr: false }
    ) {
      try {
        let transformedCode = code;
        const directiveMatch = code.match(/^["']use server["'];?/);
        const moduleId = options.moduleId(path, ssr);

        // Log the path transformation
        console.log("[RSC Transform] Module path transformation:", {
          original: path,
          transformed: moduleId,
        });

        // Find all named exports
        const exportMatches = Array.from(
          code.matchAll(/export\s+(?:const|let|var|function|class)\s+(\w+)/g)
        );

        if (!exportMatches.length) {
          console.warn(
            `[RSC] No exports found in server action module: ${path}`
          );
          return null;
        }

        // Transform each export
        for (const [fullMatch, exportName] of exportMatches) {
          if (!exportName) {
            console.warn(
              `[RSC] Invalid export in server action module: ${path}`
            );
            continue;
          }

          const isClass = fullMatch.includes("class");

          // Remove export keyword
          transformedCode = transformedCode.replace(
            fullMatch,
            fullMatch.replace("export ", "")
          );

          if (!directiveMatch || directiveMatch.index !== 0) {
            // Server action
          } else {
            // Client component
            transformedCode += `
const ${exportName}Ref = Object.defineProperties(
  ${
    isClass
      ? `class extends ${exportName} {
          constructor(...args) { super(...args); }
        }`
      : `function(...args) { return ${exportName}.apply(null, args); }`
  },
  {
    $$typeof: { value: Symbol.for("react.server.reference") },
    $$id: { value: ${JSON.stringify(moduleId + "#" + exportName)} },
    $$filepath: { value: ${JSON.stringify(path)} },
    $$async: { value: true }
  }
);
export { ${exportName}Ref as ${exportName} };
            `;
          }
        }

        return {
          code: transformedCode,
          map: new SourceMapGenerator({ file: path }).toString(),
        };
      } catch (error) {
        console.error(
          `[RSC] Error transforming client component: ${path}`,
          error
        );
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
