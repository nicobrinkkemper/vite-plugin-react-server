import * as acorn from "acorn-loose";
import { parseExportNamesInto, transformModuleWithPreservedFunctions, handleExports } from "./moduleParser.js";
import { createMappingsSerializer, createSourceMap, readMappings, updateSourceMap } from "../helpers/sourceMap.js";
import type { LoaderContext } from "../types.js";
import type { LoaderOptions } from "./react-loader.server.js";
import type { Program as EstreeProgram } from 'estree';
import type { Program } from "./moduleParser.js";
import { basename } from 'path';
import type { RawSourceMap } from 'source-map-js';
import type { ModuleInfo, ProgramNode } from 'rollup';

export type LoaderFunction = (
  source: string,
  url: string,
  isServerEnvironment: boolean,
  isServerModule: boolean,
  isClientModule: boolean,
  loader: (id: string) => Promise<string | null>
) => Promise<string>;

/**
 * Transforms modules in the client environment.
 * 
 * This loader handles BOTH:
 * 1. Client modules (marked with "use client")
 *    - Registers client components for RSC boundaries
 *    - Preserves client-side functionality
 * 
 * 2. Server modules (marked with "use server")
 *    - Transforms server actions into client-side references
 *    - Creates proxies for server function calls
 *    - Handles server action imports
 * 
 * Key aspects of the transformation:
 * 1. Uses AST to find the first export declaration
 * 2. Splits source into before/after exports
 * 3. Adds appropriate registration code based on module type
 * 4. Preserves original exports
 * 
 * This approach ensures:
 * - Imports stay at the top
 * - Registration code is added in the right place
 * - Original exports are preserved
 * - No duplicate exports
 * 
 * Example transformations:
 * 
 * Client Module:
 * ```ts
 * // Original
 * "use client"
 * import { useState } from 'react';
 * export function Counter() { ... }
 * 
 * // Transformed
 * "use client"
 * import { useState } from 'react';
 * 
 * // Register client components
 * if (typeof Counter === "function") {
 *   const clientReference = registerClientReference(Counter, "url", "Counter", {...});
 *   Counter = clientReference;
 * }
 * 
 * export function Counter() { ... }
 * ```
 * 
 * Server Module:
 * ```ts
 * // Original
 * "use server"
 * export async function add(a: number, b: number) { ... }
 * 
 * // Transformed
 * "use server"
 * 
 * // Transform server action into client reference
 * const add = function(...args) {
 *   const serverReference = registerServerReference("url#add", add);
 *   return serverReference.apply(null, args);
 * };
 * Object.defineProperties(add, {
 *   $$typeof: { value: Symbol.for("react.server.reference") },
 *   $$id: { value: "url#add" },
 *   $$bound: { value: null },
 *   $$name: { value: "add" }
 * });
 * 
 * export { add };
 * ```
 */
export async function transformClientModule(
  source: string,
  url: string,
  isServerEnvironment: boolean,
  isClientEnvironment: boolean,
  isServerFunction: RegExpMatchArray | null,
  isClientComponent: RegExpMatchArray | null,
  sourceMap: RawSourceMap | null,
  ast: Program
): Promise<{ 
  source: string; 
  sourceMap: RawSourceMap | null;
  $$typeof?: symbol;
  $$id?: string;
}> {

  // Extract export names using the same helper
  const exportNames = await parseExportNamesInto(ast.body, url, {
    load: (url: string, context: any) => null,
  });

  // If no exports found, return original
  if (exportNames.length === 0) {
    return { source, sourceMap };
  }

  // Handle React imports
  // Use the shared transformation function
  const transformed = transformModuleWithPreservedFunctions(
    source,
    url,  
    ast,
    isServerEnvironment,
    isClientEnvironment,
    isServerFunction,
    isClientComponent,
  );

  // Create new source map if one was provided
  let newSourceMap = sourceMap;
  if (sourceMap) {
    newSourceMap = {
      file: sourceMap.file,
      mappings: sourceMap.mappings,
      names: sourceMap.names,
      sources: sourceMap.sources,
      sourcesContent: sourceMap.sourcesContent,
      version: sourceMap.version,
    };
  }

  return { source: transformed.source, sourceMap: newSourceMap };
}

export async function load(url: string, context: LoaderContext, nextLoad: any) {
  const { format } = context;

  const isServerEnvironment = false;
  const isClientEnvironment = process.env.VITE_SSR === "false" || process.env.VITE_SSR === undefined || process.env.VITE_SSR === "0";
  const isServerFunction = url.match(/^['"]use server['"]$/);
  const isClientComponent = url.match(/^['"]use client['"]$/);
  if (format === "module") {
    const result = await nextLoad(url, context);
    return transformClientModule(result.source, url, isServerEnvironment, isClientEnvironment, isServerFunction, isClientComponent, result.sourceMap, result.ast);
  }

  return nextLoad(url, context);
}

export async function resolve(
  specifier: string,
  context: any,
  nextResolve: any
) {
  return nextResolve(specifier, context);
}

export async function transformServerModule(
  source: string,
  id: string,
  isServerEnvironment: boolean,
  isClientEnvironment: boolean,
  isServerFunction: RegExpMatchArray | null,
  isClientComponent: RegExpMatchArray | null,
  ast?: Program
) {

  // Use provided AST or parse if not available
  const program =
    ast ||
    (acorn.parse(source, {
      sourceType: "module",
      ecmaVersion: "latest",
    }) as Program);

  const exportNames = await parseExportNamesInto(program.body, id, {
    load: (url: string, context: any) => null,
  });

  // If no exports, return as is
  if (exportNames.length === 0) {
    return {
      source,
      sourceMap: null
    }
  }

  // Use the shared transformation function
  return transformModuleWithPreservedFunctions(
    source,
    id,
    program,
    true, // isServerEnvironment
    false, // isClientEnvironment
    isServerFunction,
    isClientComponent,
  );
}


export async function transformModuleIfNeeded(
  source: string,
  url: string,
  isServerEnvironment: boolean = false,
  isClientEnvironment: boolean = true,
  isServerFunction: RegExpMatchArray | null = source?.match(/^"use server"[\s;]*\n?/m),
  isClientComponent: RegExpMatchArray | null = source?.match(/^"use client"[\s;]*\n?/m),
  loader: (id: string) => string | null = (id: string) => '',
  parser: (source: string) => Program = (source: string) => acorn.parse(source, {
    sourceType: "module",
    ecmaVersion: "latest",
  }) as Program
) {
  if(!source || source.length === 0) {
    source = String(loader(url));
  }
  // Do a quick check for the exact string. If it doesn't exist, don't
  // bother parsing.
  if (!isServerFunction && !isClientComponent) {
    return {
      source: null,
      sourceMap: null
    }
  }

  // Parse the AST once
  const ast = parser(source);

  if (isClientComponent) {
    const result = await transformClientModule(
      source,
      url,
      isServerEnvironment,
      isClientEnvironment,
      isServerFunction,
      isClientComponent,
      null,
      ast
    );
    return {
      source:   result.source,
      sourceMap: result.sourceMap
    }
  }
  return await transformServerModule(source, url, 
    true,
    false,
    source.match(/^['"]use server['"]$/),
    source.match(/^['"]use client['"]$/),
    ast
  );
}


export const reactLoaderClient = {
  load,
  resolve,
};

