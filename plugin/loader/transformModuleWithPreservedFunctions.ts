/**
 * # RSC Boundary Handling
 *
 * This file provides the core transformation logic for React Server Components (RSC) boundaries.
 *
 * All transformations are handled by `transformModuleWithPreservedFunctions` for consistency.
 *
 * ## Error Behavior
 *
 * - If a client component is imported on the server, the export is a function that throws a clear error.
 * - If a server action is imported on the client, the export is a function that throws a clear error.
 *
 * This ensures that implementation details are never leaked across boundaries and errors are easy to debug.
 */
import type { Program } from "./types.js";
import type { DirectiveInfo } from "./findDirectives.js";
import type { handleExports } from "./handleExports.js";
import {
  isReactServerCondition,
} from "../config/getCondition.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { getNodeEnv } from "../getNodeEnv.js";

export type TransformOptions = {
  source: string;
  moduleId: string;
  program?: Program;
}

type ExportReturnValue = ReturnType<typeof handleExports>;

export function transformModuleWithPreservedFunctions(
  source: string,
  moduleId: string,
  directives: DirectiveInfo,
  { exportNames, exports }: Pick<ExportReturnValue, "exportNames" | "exports">,
  isServerFunction: boolean | RegExpMatchArray | null,
  isClientComponent: boolean | RegExpMatchArray | null,
  isServerEnvironment: boolean = isReactServerCondition(),
  {
    importPath,
    registerClientReferenceName,
    registerServerReferenceName,
  } = DEFAULT_CONFIG.RSC_LOADER[getNodeEnv()],
  verbose: boolean = false
) {
  const moduleIdLiteral = JSON.stringify(moduleId);

  if (verbose) {
    console.log(`[transformModuleWithPreservedFunctions] Module: ${moduleId}`);
    console.log(
      `[transformModuleWithPreservedFunctions] Directives:`,
      directives
    );
    console.log(
      `[transformModuleWithPreservedFunctions] isServerFunction:`,
      isServerFunction,
      `isClientComponent:`,
      isClientComponent
    );
  }

  // Only apply transformation for server or client
  if (isServerFunction || isClientComponent) {
    const regName = isServerFunction
      ? registerServerReferenceName
      : registerClientReferenceName;
    const isServer = !!isServerFunction;
    const isClient = !!isClientComponent;

    // Determine which exports to register
    let actionsToRegister = [];
    if (isServer) {
      // File-level: all exported functions/variables/classes
      if (directives.fileLevelServerDirective) {
        for (const name of exportNames) {
          const exportInfo = exports.get(name);
          if (
            exportInfo?.type === "function" ||
            exportInfo?.type === "variable" ||
            exportInfo?.type === "class"
          ) {
            actionsToRegister.push({ name, exportInfo });
          }
        }
      }
      // Function-level: only those with a directive
      for (const d of directives.functionLevelServerDirectives) {
        if (!exports.has(d.name)) {
          // Skip non-exported functions with directives
          continue;
        }
        const exportInfo = exports.get(d.name);
        if (
          exportInfo?.type === "function" ||
          exportInfo?.type === "variable" ||
          exportInfo?.type === "class"
        ) {
          actionsToRegister.push({ name: d.name, exportInfo });
        }
      }
    } else if (isClient || directives.fileLevelClientDirective) {
      if (directives.fileLevelClientDirective) {
        for (const name of exportNames) {
          const exportInfo = exports.get(name);
          if (
            exportInfo?.type === "function" ||
            exportInfo?.type === "variable" ||
            exportInfo?.type === "class"
          ) {
            actionsToRegister.push({ name, exportInfo });
          }
        }
      }
      for (const d of directives.functionLevelClientDirectives) {
        if (!exports.has(d.name)) {
          // Skip non-exported functions with directives
          continue;
        }
        const exportInfo = exports.get(d.name);
        if (
          exportInfo?.type === "function" ||
          exportInfo?.type === "variable" ||
          exportInfo?.type === "class"
        ) {
          actionsToRegister.push({ name: d.name, exportInfo });
        }
      }
    }
    // Remove duplicates
    actionsToRegister = actionsToRegister.filter(
      (v, i, arr) => arr.findIndex((x) => x.name === v.name) === i
    );

    // If this is a client component in server environment, we need to completely rebuild the source
    // to avoid any client-side imports or code
    if (isServerEnvironment && directives.fileLevelClientDirective) {
      const output = [];
      output.push(`import { ${regName} } from "${importPath}";`);
      for (const { name, exportInfo: _ } of actionsToRegister) {
        const registrationName = name === "default" ? "default" : name;
        output.push(
          `export const ${registrationName} = ${regName}(function() { throw new Error("Attempted to call ${registrationName}() from the server but ${registrationName} is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."); }, ${moduleIdLiteral}, ${JSON.stringify(
            registrationName
          )});`
        );
      }
      return output.join("\n");
    }

    // If not in server environment, just remove directives and return code
    if (!isServerEnvironment) {
      return source;
    }

    // For server components/actions in server environment
    const output = [];
    if (actionsToRegister.length > 0) {
      output.unshift(`import { ${regName} } from "${importPath}";`);
    }
    // Ensure we output the code without directives first
    output.push(source);
    // Then register the server functions
    for (const { name, exportInfo } of actionsToRegister) {
      const registrationName = name === "default" ? "default" : name;
      const exportName =
        name === "default" && exportInfo?.localName
          ? exportInfo.localName
          : name;
      output.push(
        `${regName}(${exportName}, ${moduleIdLiteral}, ${JSON.stringify(
          registrationName
        )});`
      );
    }

    const transformedCode = output.join("\n");
    return transformedCode;
  }
  throw new Error(
    `[transformModuleWithPreservedFunctions] Unexpected module: ${moduleId}`
  );
}
