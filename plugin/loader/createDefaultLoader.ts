import { readFileSync } from "fs";
import * as esbuild from "esbuild";
import type { LoaderContext } from "../types.js";
import { transformModuleIfNeeded } from "./transformModuleIfNeeded.js";
import { createMappingsSerializer } from "../source-map/createMappingsSerializer.js";

export interface LoaderResult {
  source: string;
  map: any | null;
}

export interface Loader {
  (id: string, context?: LoaderContext, nextLoad?: any): LoaderResult;
}

/**
 * Creates a default loader function that either uses provided source or reads from file
 */
export function createDefaultLoader(source?: string): Loader {
  if (typeof source === "string") {
    return function load(id: string): LoaderResult {
      // Use esbuild to transform the code
      const result = esbuild.transformSync(source, {
        loader: "tsx",
        format: "esm",
        target: "esnext",
        sourcemap: true,
        sourcefile: id,
      });

      // Transform the code for RSC boundaries
      const transformed = transformModuleIfNeeded(
        result.code,
        id,
        null, // isServerFunction
        null, // isClientComponent
        true // isServerEnvironment
      );

      // Create a new source map with proper mappings
      const map = result.map ? {
        version: 3,
        sources: [id],
        sourcesContent: [transformed],
        mappings: (() => {
          const serializer = createMappingsSerializer();
          let mappings = '';
          
          // Map each line of the transformed code to its corresponding line in the original source
          const transformedLines = transformed.split('\n');
          for (let i = 0; i < transformedLines.length; i++) {
            if (i > 0) mappings += ';';
            // For the import and registration lines, map to the first line of the original source
            if (transformedLines[i].includes('import {') || transformedLines[i].includes('registerServerReference')) {
              mappings += serializer(i + 1, 0, 0, 1, 0, 0);
            } else {
              // For the actual code, map to the corresponding line in the original source
              const originalLine = Math.max(1, i - 1); // Adjust for the import line
              mappings += serializer(i + 1, 0, 0, originalLine, 0, 0);
            }
          }

          return mappings;
        })()
      } : null;

      return {
        source: transformed,
        map
      };
    };
  }
  return function load(
    id: string,
    context?: LoaderContext,
    nextLoad?: any
  ): LoaderResult {
    if (!nextLoad) {
      nextLoad = (id: string) => {
        const source = readFileSync(id, "utf-8");
        // Use esbuild to transform the code
        const result = esbuild.transformSync(source, {
          loader: "tsx",
          format: "esm",
          target: "esnext",
          sourcemap: true,
          sourcefile: id,
        });

        // Transform the code for RSC boundaries
        const transformed = transformModuleIfNeeded(
          result.code,
          id,
          null, // isServerFunction
          null, // isClientComponent
          true // isServerEnvironment
        );

        // Create a new source map with proper mappings
        const map = result.map ? {
          version: 3,
          sources: [id],
          sourcesContent: [transformed],
          mappings: (() => {
            const serializer = createMappingsSerializer();
            let mappings = '';
            
            // Map each line of the transformed code to its corresponding line in the original source
            const transformedLines = transformed.split('\n');
            for (let i = 0; i < transformedLines.length; i++) {
              if (i > 0) mappings += ';';
              // For the import and registration lines, map to the first line of the original source
              if (transformedLines[i].includes('import {') || transformedLines[i].includes('registerServerReference')) {
                mappings += serializer(i + 1, 0, 0, 1, 0, 0);
              } else {
                // For the actual code, map to the corresponding line in the original source
                const originalLine = Math.max(1, i - 1); // Adjust for the import line
                mappings += serializer(i + 1, 0, 0, originalLine, 0, 0);
              }
            }

            return mappings;
          })()
        } : null;

        return {
          source: transformed,
          map
        };
      };
    }
    const result = nextLoad(id, context);
    return {
      ...result,
      map: "map" in result ? result.map : null,
    };
  };
}
