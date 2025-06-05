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
import type { Program } from './types.js';
import type { DirectiveInfo } from './findDirectives.js';
import { createSourceMap, stripSourceMap } from './sourceMap.js';
import { handleExports } from './handleExports.js';
import { removeDirectives } from './removeDirectives.js';
import { getCondition } from '../config/getCondition.js';

export interface TransformOptions {
  source: string;
  moduleId: string;
  program?: Program;
}

export function transformModuleWithPreservedFunctions(
  source: string,
  moduleId: string,
  program: Program,
  directives: DirectiveInfo,
  sourceMapInfo: { url: string | null; start: number; end: number; lines: number; originalSourceMap?: any },
  isServerFunction: boolean | RegExpMatchArray | null,
  isClientComponent: boolean | RegExpMatchArray | null,
  isServerEnvironment: boolean = getCondition() === "react-server",
  importPath: string,
  registerClientReferenceName: string,
  registerServerReferenceName: string,
  verbose: boolean = false
): string {
  // Remove the old source map if present
  let sourceWithoutMap = source;
  if (sourceMapInfo && sourceMapInfo.start > 0) {
    sourceWithoutMap = stripSourceMap(source);
  }

  // Get export names and create module ID literal
  const { exportNames, exports } = handleExports(
    sourceWithoutMap,
    program,
    isServerFunction,
    isClientComponent
  );
  const moduleIdLiteral = JSON.stringify(moduleId);

  if (verbose) {
    console.log(`[transformModuleWithPreservedFunctions] Module: ${moduleId}`);
    console.log(`[transformModuleWithPreservedFunctions] Directives:`, directives);
    console.log(`[transformModuleWithPreservedFunctions] isServerFunction:`, isServerFunction, `isClientComponent:`, isClientComponent);
  }

  // Only apply transformation for server or client
  if (isServerFunction || isClientComponent) {
    const regName = isServerFunction ? registerServerReferenceName : registerClientReferenceName;
    const isServer = !!isServerFunction;
    const isClient = !!isClientComponent;

    // Collect all directive ranges to remove
    const allDirectiveRanges = [
      ...directives.directiveRanges,
      ...(isServer ? directives.functionLevelServerDirectives : []),
      ...(isClient ? directives.functionLevelClientDirectives : [])
    ];

    // Remove all directives using helper
    const codeWithoutDirectives = removeDirectives(sourceWithoutMap, allDirectiveRanges);

    // Throw if any illegal directive remains as a directive (not just as a string literal)
    // We'll use a regex to check for directive statements at the start of a line (optionally with whitespace)
    const illegalDirectiveRegex = /^\s*"use (server|client)";?/mg;
    const matches = [...codeWithoutDirectives.matchAll(illegalDirectiveRegex)];
    if (matches.length > 0) {
      console.error(`[transformModuleWithPreservedFunctions] WARNING: Found remaining directives after supposed removal in module: ${moduleId}`);
      matches.forEach((match, idx) => {
        const start = match.index;
        const end = start !== undefined ? start + match[0].length : undefined;
        console.error(`  [${idx}] Directive: '${match[0]}' at position ${start} to ${end}`);
        const endNum = (typeof end === 'number') ? end : (typeof start === 'number' ? start : 0);
        if (start !== undefined) {
          const context = codeWithoutDirectives.slice(Math.max(0, start - 20), Math.min(codeWithoutDirectives.length, endNum + 20));
          console.error(`      Context: ...${context}...`);
        }
      });
      // Don't throw, just log a warning
    }

    // Determine which exports to register
    let actionsToRegister = [];
    if (isServer) {
      // File-level: all exported functions/variables/classes
      if (directives.fileLevelServerDirective) {
        for (const name of exportNames) {
          const exportInfo = exports.get(name);
          if (exportInfo?.type === 'function' || exportInfo?.type === 'variable' || exportInfo?.type === 'class') {
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
        if (exportInfo?.type === 'function' || exportInfo?.type === 'variable' || exportInfo?.type === 'class') {
          actionsToRegister.push({ name: d.name, exportInfo });
        }
      }
    } else if (isClient || directives.fileLevelClientDirective) {
      if (directives.fileLevelClientDirective) {
        for (const name of exportNames) {
          const exportInfo = exports.get(name);
          if (exportInfo?.type === 'function' || exportInfo?.type === 'variable' || exportInfo?.type === 'class') {
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
        if (exportInfo?.type === 'function' || exportInfo?.type === 'variable' || exportInfo?.type === 'class') {
          actionsToRegister.push({ name: d.name, exportInfo });
        }
      }
    }
    // Remove duplicates
    actionsToRegister = actionsToRegister.filter((v, i, arr) => arr.findIndex(x => x.name === v.name) === i);

    // If this is a client component in server environment, we need to completely rebuild the source
    // to avoid any client-side imports or code
    if (isServerEnvironment && directives.fileLevelClientDirective) {
      const output = [];
      output.push(`import { ${regName} } from "${importPath}";`);
      for (const { name, exportInfo: _ } of actionsToRegister) {
        const registrationName = name === "default" ? "default" : name;
        output.push(`export const ${registrationName} = ${regName}(function() { throw new Error("Attempted to call ${registrationName}() from the server but ${registrationName} is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."); }, ${moduleIdLiteral}, ${JSON.stringify(registrationName)});`);
      }
      return createSourceMap(output.join("\n"), sourceWithoutMap, moduleId);
    }

    // If not in server environment, just remove directives and return code
    if (!isServerEnvironment) {
      return createSourceMap(codeWithoutDirectives, sourceWithoutMap, moduleId);
    }

    // For server components/actions in server environment
    const output = [];
    if (actionsToRegister.length > 0) {
      output.unshift(`import { ${regName} } from "${importPath}";`);
    }
    output.push(codeWithoutDirectives);
    for (const { name, exportInfo } of actionsToRegister) {
      const registrationName = name === "default" ? "default" : name;
      const exportName = name === "default" && exportInfo?.localName ? exportInfo.localName : name;
      output.push(`${regName}(${exportName}, ${moduleIdLiteral}, ${JSON.stringify(registrationName)});`);
    }

    const transformedCode = output.join('\n');
    return createSourceMap(transformedCode, sourceWithoutMap, moduleId);
  }
  throw new Error(`[transformModuleWithPreservedFunctions] Unexpected module: ${moduleId}`);
}
