import * as acorn from "acorn-loose";
import type { LoaderContext } from "../types.js";
import {
  parseExportNamesInto,
  transformModuleWithPreservedFunctions,
  handleExports,
  handleServerActionImports,
} from "./moduleParser.js";
import type { ModuleInfo } from "rollup";
import type { Program as EstreeProgram } from "estree";
import type { Program } from "./moduleParser.js";
import type { RawSourceMap } from "source-map-js";

let stashedResolve: any = null;

export interface LoaderOptions {
  id: string;
  resolveDependencies?: boolean;
  format?: string;
  conditions?: string[];
  importAssertions?: Record<string, any>;
  importAttributes?: Record<string, any>;
  source: string;
}

export type LoaderFunction = (options: LoaderOptions) => Promise<ModuleInfo>;

/**
 * Transforms modules in the server environment.
 *
 * This loader handles BOTH:
 * 1. Server modules (marked with "use server")
 *    - Registers server actions for RSC boundaries
 *    - Preserves server-side functionality
 *    - Handles server action imports
 *
 * 2. Client modules (marked with "use client")
 *    - Registers client components for RSC boundaries
 *    - Creates server-side references for client components
 *    - Ensures proper server-side rendering
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
 * Server Module:
 * ```ts
 * // Original
 * "use server"
 * export async function add(a: number, b: number) { ... }
 *
 * // Transformed
 * "use server"
 *
 * // Register server actions
 * if (typeof add === "function") {
 *   const serverReference = registerServerReference(add, "url", "add", {...});
 *   add = serverReference;
 * }
 *
 * export async function add(a: number, b: number) { ... }
 * ```
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
 * The transformation also handles:
 * 1. Server action imports from .server files
 * 2. Client component registration
 * 3. Proper metadata for RSC boundaries
 * 4. Environment-specific transformations
 */
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
      sourceMap: null,
    };
  }

  // Use the shared transformation function
  return transformModuleWithPreservedFunctions(
    source,
    id,
    program,
    isServerEnvironment, // isServerEnvironment
    isClientEnvironment, // isClientEnvironment
    isServerFunction,
    isClientComponent
  );
}

export function transformClientModule(
  source: string,
  url: string,
  isServerEnvironment: boolean = true,
  isClientEnvironment: boolean,
  isServerFunction: RegExpMatchArray | null,
  isClientComponent: RegExpMatchArray | null,
  sourceMap?: RawSourceMap | null,
  ast?: Program
): { source: string; sourceMap: RawSourceMap | null } {
  // Use provided AST or parse if not available
  const program =
    ast ||
    (acorn.parse(source, {
      sourceType: "module",
      ecmaVersion: "latest",
    }) as Program);

  // Use the shared transformation function
  const transformed = transformModuleWithPreservedFunctions(
    source,
    url,
    program,
    isServerEnvironment,
    isClientEnvironment,
    isServerFunction,
    isClientComponent
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

  return { source: transformed.source, sourceMap: newSourceMap || null };
}

export async function load(url: string, context: LoaderContext, nextLoad: any) {
  const { format } = context;

  if (format === "module") {
    const result = await nextLoad(url, context);
    const isServerEnvironment = true;
    const isClientEnvironment = false;
    const isServerFunction = result.source.match(/^"use server"[\s;]*\n?/m);
    const isClientComponent = result.source.match(/^"use client"[\s;]*\n?/m);
    const transformed = await transformServerModule(
      result.source,
      url,
      isServerEnvironment,
      isClientEnvironment,
      isServerFunction,
      isClientComponent,
      result.ast
    );
    return { source: transformed };
  }

  return nextLoad(url, context);
}

export async function resolve(
  specifier: string,
  context: any,
  nextResolve: any
) {
  stashedResolve = nextResolve;
  return nextResolve(specifier, context);
}

export const reactLoaderServer = {
  load,
  resolve,
};

export async function transformModuleIfNeeded(
  source: string,
  url: string,
  isServerEnvironment: boolean = true,
  isClientEnvironment: boolean = false,
  isServerFunction: RegExpMatchArray | null = source?.match(
    /^"use server"[\s;]*\n?/m
  ),
  isClientComponent: RegExpMatchArray | null = source?.match(
    /^"use client"[\s;]*\n?/m
  ),
  loader: (id: string) => string = (id: string) => "",
  parser: (source: string) => Program = (source: string) =>
    acorn.parse(source, {
      sourceType: "module",
      ecmaVersion: "latest",
    })
) {
  if (!source) {
    source = String(await loader(url));
  }
  // Do a quick check for the exact string. If it doesn't exist, don't
  // bother parsing.
  if (!isServerFunction && !isClientComponent) {
    return {
      source,
      sourceMap: null,
    };
  }

  // Parse the AST once
  const ast = parser(source);

  if (isClientComponent) {
    return transformClientModule(
      source,
      url,
      isServerEnvironment,
      isClientEnvironment,
      isServerFunction,
      isClientComponent,
      null,
      ast
    );
  }

  return await transformServerModule(
    source,
    url,
    true,
    false,
    source.match(/^"use server"[\s;]*\n?/m),
    source.match(/^"use client"[\s;]*\n?/m),
    ast
  );
}
