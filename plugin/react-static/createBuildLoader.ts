import { join } from "node:path";
import { getModuleRef } from "../helpers/moduleRefs.js";
import { temporaryReferences } from "./temporaryReferences.js";
import { toError } from "../error/toError.js";
import { readFile, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import type { CreateBuildLoaderFn } from "./types.js";

/**
 * Creates a loader function for handling module resolution during build.
 *
 * The loader handles the following strategy:
 *  - For client components: Use client manifest and client.browser.js
 *  - For server components: Use server manifest and server.js
 *  - For static assets: Use static manifest
 */
export const createBuildLoader: CreateBuildLoaderFn = function _createBuildLoader(
  {
    userOptions,
    serverManifest,
    clientManifest,
    staticManifest,
  },
  bundle
) {
  const manifestKeys = Object.keys(serverManifest);
  if (!manifestKeys.length) {
    throw new Error("Server manifest is empty");
  }

  return async function buildLoader(id) {
    if (userOptions.verbose) {
      console.log("[buildLoader] id: ", id);
    }
    const [withoutQuery, query] = id.split("?", 2);
    const [moduleId, exportName] = withoutQuery.split("#", 2);
    const [normalizedKey, normalizedValue] = userOptions.normalizer(moduleId);
    const moduleRef = getModuleRef(id);

    // Check if we have a temporary reference (cached module)
    if (temporaryReferences?.has(moduleRef)) {
      const mod = temporaryReferences.get(moduleRef);
      if (typeof mod === "object" && mod !== null && "error" in mod) {
        // ignore it
      } else {
        return mod;
      }
    }



    try {


      // For inline modules, handle them directly
      if (query === "inline") {
        const startsWithMarker = normalizedKey.split("-")[0];
        const serverChunk =
          bundle[serverManifest[normalizedValue]?.file] ??
          bundle[staticManifest[normalizedValue]?.file] ??
          bundle[clientManifest[normalizedValue]?.file] ??
          bundle[withoutQuery] ??
          bundle[normalizedValue] ??
          Object.entries(bundle).find(
            ([, value]) => value.name === normalizedValue
          )?.[1] ??
          Object.entries(bundle).find(([_key]) =>
            _key.startsWith(startsWithMarker)
          )?.[1];

        if (serverChunk) {
          if (serverChunk.type === "asset") {
            // For CSS files, ensure we're in the React Server environment
            if (userOptions.autoDiscover.jsonPattern.test(normalizedValue)) {
              const jsonContent = serverChunk.source;
              if (typeof jsonContent === "string") {
                return { default: JSON.parse(jsonContent) };
              }
            } else if (
              userOptions.autoDiscover.cssPattern.test(normalizedValue)
            ) {
              const cssContent = serverChunk.source;
              if (typeof cssContent === "string") {
                return { default: cssContent };
              }
            }
            return { default: serverChunk.source };
          } else if ("code" in serverChunk) {
            return { default: serverChunk.code };
          }
        }
        console.warn("Could not find inline module for: " + normalizedValue);
        return null;
      }

      // Determine if this is a client component
      const isClientComponent =
        userOptions.autoDiscover.clientPattern.test(normalizedValue);

      // For client components, use client manifest
      if (isClientComponent) {
        const clientEntry = clientManifest[normalizedValue];
        if (userOptions.verbose) {
          console.log("clientEntry", clientEntry);
        }
        if (clientEntry) {
          try {
            const module = await import(
              join(
                userOptions.projectRoot,
                userOptions.build.outDir,
                userOptions.build.client,
                clientEntry.file
              )
            );
            temporaryReferences?.set(moduleRef, module);
            return module;
          } catch (error) {
            const err = toError(error);
            console.warn("Error loading client module:", err);
            temporaryReferences?.delete(moduleRef);
            throw err;
          }
        }
      }

      // For static assets, use static manifest
      const staticEntry = staticManifest[normalizedValue];
      if (staticEntry) {
        try {
          const module = await import(
            join(
              userOptions.projectRoot,
              userOptions.build.outDir,
              userOptions.build.static,
              staticEntry.file
            )
          );
          temporaryReferences?.set(moduleRef, module);
          // If we have an export name, make sure it's a key
          if (exportName && !(exportName in module)) {
            throw new Error(`Export ${exportName} not found in module ${normalizedValue}`);
          }
          return module;
        } catch (error) {
          const err = toError(error);
          console.warn("Error loading static module:", err);
          temporaryReferences?.delete(moduleRef);
          throw err;
        }
      }

      // Check server manifest for any remaining modules (including Html/Root components)
      const serverEntry = serverManifest[normalizedValue];

      if (serverEntry) {
        try {
          const module = await import(
            join(
              userOptions.projectRoot,
              userOptions.build.outDir,
              userOptions.build.server,
              serverEntry.file
            )
          );
          temporaryReferences?.set(moduleRef, module);
          // If we have an export name, make sure it's a key
          if (exportName && !(exportName in module)) {
            throw new Error(`Export ${exportName} not found in module ${normalizedValue}`);
          }
          return module;
        } catch (error) {
          const err = toError(error);
          if(userOptions.panicThreshold === "critical_errors") {
            console.warn("Error loading server module:", err);
            temporaryReferences?.delete(moduleRef);
          } else {
            console.error("Error loading server module:", err);
            throw err;
          }
        }
      }

      // For source files (like custom Root/Html components), try to load directly from filesystem
      const sourceFilePath = join(userOptions.projectRoot, normalizedValue);
      if (userOptions.verbose) {
        console.log("[buildLoader] Checking source file:", sourceFilePath, "exists:", existsSync(sourceFilePath));
      }
      if (existsSync(sourceFilePath)) {
        try {
          if (userOptions.verbose) {
            console.log("[buildLoader] Loading source file:", sourceFilePath);
          }

          // For TypeScript/TSX files, first check if there's a built version in dist
          if (sourceFilePath.endsWith('.tsx') || sourceFilePath.endsWith('.ts') || sourceFilePath.endsWith('.mts')) {
            // Try to find the built module first - check both static and server directories
            const relativePath = normalizedValue.replace(/^src\//, '');
            const staticBuiltPath = join(
              userOptions.projectRoot,
              userOptions.build.outDir,
              userOptions.build.static,
              relativePath.replace(/\.(tsx?|mts)$/, '.js')
            );
            const serverBuiltPath = join(
              userOptions.projectRoot,
              userOptions.build.outDir,
              userOptions.build.server,
              relativePath.replace(/\.(tsx?|mts)$/, '.js')
            );

            // Check static directory first, then server directory
            let builtModulePath: string | null = null;
            if (existsSync(staticBuiltPath)) {
              builtModulePath = staticBuiltPath;
            } else if (existsSync(serverBuiltPath)) {
              builtModulePath = serverBuiltPath;
            }

            if (builtModulePath) {
              if (userOptions.verbose) {
                console.log("[buildLoader] Found built module:", builtModulePath);
              }
              const module = await import(builtModulePath);
              temporaryReferences?.set(moduleRef, module);
              // If we have an export name, make sure it's a key
              if (exportName && !(exportName in module)) {
                throw new Error(`Export ${exportName} not found in module ${normalizedValue}`);
              }
              return module;
            }

            // If no built module found, try to compile the source file
            if (userOptions.verbose) {
              console.log("[buildLoader] No built module found, trying to compile source file");
            }

            // Use esbuild to compile the TypeScript/TSX file
            const { transformWithEsbuild } = await import('vite');
            const sourceCode = await readFile(sourceFilePath, 'utf-8');
            const result = await transformWithEsbuild(sourceCode, sourceFilePath, {
              format: 'esm',
              sourcemap: false,
            });

            // Create a temporary file with the compiled code
            const tempFilePath = sourceFilePath.replace(/\.(tsx?|mts)$/, '.temp.js');
            await writeFile(tempFilePath, result.code);

            try {
              const module = await import(tempFilePath);
              temporaryReferences?.set(moduleRef, module);
              // If we have an export name, make sure it's a key
              if (exportName && !(exportName in module)) {
                throw new Error(`Export ${exportName} not found in module ${normalizedValue}`);
              }
              return module;
            } finally {
              // Clean up temporary file
              try {
                await unlink(tempFilePath);
              } catch (cleanupError) {
                // Ignore cleanup errors
                if (userOptions.verbose) {
                  console.warn("[buildLoader] Failed to cleanup temp file:", cleanupError);
                }
              }
            }
          } else {
            // For other files, read as text
            const content = await readFile(sourceFilePath, 'utf-8');
            return { default: content };
          }
        } catch (error) {
          const err = toError(error);
          console.warn("Error loading source file:", err);
          temporaryReferences?.delete(moduleRef);
          throw err;
        }
      }

      throw new Error(`Module ${normalizedValue} not found during build`);
    } catch (error) {
      const emptyExports = {
        error: error instanceof Error ? error : new Error(String(error)),
        id: id,
      };
      temporaryReferences?.delete(moduleRef);
      return emptyExports;
    }
  };
}

