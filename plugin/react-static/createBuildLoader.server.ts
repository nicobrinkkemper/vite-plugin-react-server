import { join } from "node:path";
import { getModuleRef } from "../helpers/moduleRefs.js";
import { toError } from "../error/toError.js";
import { handleError } from "../error/handleError.js";

import { existsSync } from "fs";
import type { CreateBuildLoaderFn } from "./types.js";
import { createLogger } from "vite";

/**
 * Creates a loader function for handling module resolution during build.
 *
 * The loader handles the following strategy:
 *  - For inline modules: Handle them using bundle
 */
export const createBuildLoader: CreateBuildLoaderFn =
  function _createBuildLoader(
    { userOptions, serverManifest, staticManifest },
    bundle,
    temporaryReferences,
    logger = createLogger()
  ) {
    const manifestKeys = Object.keys(serverManifest);
    if (!manifestKeys.length) {
      throw new Error("Server manifest is empty");
    }

    return async function buildLoader(id) {
      if (userOptions.verbose) {
        logger.info(`[buildLoader] id: ${id}`);
      }
      const [withoutQuery, query] = id.split("?", 2);
      const [moduleId, exportName] = withoutQuery.split("#", 2);
      const [, normalizedValue] = userOptions.normalizer(moduleId);
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
          const serverChunk =
            bundle[serverManifest[normalizedValue]?.file] ??
            bundle[staticManifest[normalizedValue]?.file] ??
            bundle[withoutQuery] ??
            bundle[normalizedValue] ??
            Object.entries(bundle).find(
              ([, value]) => value.name === normalizedValue
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
          const panicError = handleError({
            error: new Error(
              `Could not find inline module for: ${normalizedValue}`
            ),
            logger,
            panicThreshold: userOptions.panicThreshold,
            context: "Build Loader Error (inline)",
          });
          if (panicError != null) {
            throw panicError;
          }
          return null;
        }

        // check the bundle manifest for a direct match
        const bundleEntry = bundle[withoutQuery];
        if (bundleEntry) {
          try {
            const module = await import(
              join(
                userOptions.projectRoot,
                userOptions.build.outDir,
                userOptions.build.server,
                withoutQuery
              )
            );
            temporaryReferences?.set(moduleRef, module);
            return module;
          } catch (error) {
            const panicError = handleError({
              error: error,
              logger,
              panicThreshold: userOptions.panicThreshold,
              context: "Build Loader Error (bundle)",
            });
            temporaryReferences?.delete(moduleRef);
            if (panicError != null) {
              throw panicError;
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
              throw new Error(
                `Export ${exportName} not found in module ${normalizedValue}`
              );
            }
            return module;
          } catch (error) {
            const panicError = handleError({
              error: error,
              logger,
              panicThreshold: userOptions.panicThreshold,
              context: "Build Loader Error (static)",
            });
            temporaryReferences?.delete(moduleRef);
            if (panicError != null) {
              throw panicError;
            }
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
              throw new Error(
                `Export ${exportName} not found in module ${normalizedValue}`
              );
            }
            return module;
          } catch (error) {
            const err = toError(error);
            const panicError = handleError({
              error: err,
              logger,
              panicThreshold: userOptions.panicThreshold,
              context: "Build Loader Error (server)",
            });
            temporaryReferences?.delete(moduleRef);
            if (panicError != null) {
              throw panicError;
            }
          }
        }

        // Try to load the built file from server directory
        const builtFilePath = moduleId.startsWith(userOptions.moduleBase)
          ? join(userOptions.projectRoot, moduleId)
          : join(
              userOptions.projectRoot,
              userOptions.build.outDir,
              userOptions.build.server,
              moduleId
            );

        if (existsSync(builtFilePath)) {
          if (userOptions.verbose) {
            logger.info(`[buildLoader] Loading built file: ${builtFilePath}`);
          }
          const module = await import(builtFilePath);
          temporaryReferences?.set(moduleRef, module);
          if (exportName && !(exportName in module)) {
            throw new Error(
              `Export ${exportName} not found in module ${withoutQuery}`
            );
          }
          return module;
        }

        throw new Error(`Module ${withoutQuery} not found during build`);
      } catch (error) {
        const emptyExports = {
          error: error instanceof Error ? error : new Error(String(error)),
          id: id,
        };
        temporaryReferences?.delete(moduleRef);
        return emptyExports;
      }
    };
  };
