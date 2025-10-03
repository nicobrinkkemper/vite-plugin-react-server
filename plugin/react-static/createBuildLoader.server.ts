import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
        logger.info(`[buildLoader] Starting lookup for: ${id}`);
      }
      const [withoutQuery, query] = id.split("?", 2);
      const [moduleId, exportName] = withoutQuery.split("#", 2);
      const [normalizedKey, normalizedValue] = userOptions.normalizer(moduleId);
      // Use the normalized value (which preserves src/ when preserveModulesRoot is true) for manifest lookups
      const manifestKey = normalizedValue;
      if (userOptions.verbose) {
        logger.info(
          `[buildLoader] moduleId: ${moduleId}, normalizedKey: ${normalizedKey}, normalizedValue: ${normalizedValue}, manifestKey: ${manifestKey}`
        );
        logger.info(
          `[buildLoader] Bundle keys: ${Object.keys(bundle)
            .slice(0, 10)
            .join(", ")}...`
        );
        logger.info(
          `[buildLoader] Looking for: withoutQuery=${withoutQuery}, normalizedValue=${normalizedValue}`
        );
      }
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
          if (userOptions.verbose) {
            logger.info(
              `[buildLoader] Looking for inline module: ${normalizedValue}`
            );
          }

          // For CSS files, try to resolve the hashed filename to the actual bundle filename
          let resolvedValue = normalizedValue;
          if (
            normalizedValue.startsWith("assets/") &&
            normalizedValue.endsWith(".css")
          ) {
            // Extract the base path without hash
            const basePath = normalizedValue.replace(
              /-[a-zA-Z0-9]+\.css$/,
              ".css"
            );
            if (userOptions.verbose) {
              logger.info(
                `[buildLoader] CSS file detected, trying to resolve ${normalizedValue} to ${basePath}`
              );
            }
            // Try the base path first
            if (bundle[basePath]) {
              resolvedValue = basePath;
              if (userOptions.verbose) {
                logger.info(
                  `[buildLoader] Resolved CSS file to: ${resolvedValue}`
                );
              }
            }
          }

          // First try to find the module without the export name
          if (userOptions.verbose) {
            logger.info(
              `[buildLoader] Trying bundle[moduleId]: bundle["${moduleId}"] = ${!!bundle[
                moduleId
              ]}`
            );
            logger.info(
              `[buildLoader] Trying bundle[normalizedValue]: bundle["${normalizedValue}"] = ${!!bundle[
                normalizedValue
              ]}`
            );
            logger.info(
              `[buildLoader] Trying bundle[resolvedValue]: bundle["${resolvedValue}"] = ${!!bundle[
                resolvedValue
              ]}`
            );
          }
          const serverChunk =
            bundle[moduleId] ??
            bundle[normalizedValue] ??
            bundle[resolvedValue] ??
            bundle[serverManifest[manifestKey]?.file] ??
            bundle[staticManifest[manifestKey]?.file] ??
            bundle[serverManifest[normalizedKey]?.file] ??
            bundle[staticManifest[normalizedKey]?.file] ??
            Object.entries(bundle).find(
              ([, value]) => value.name === normalizedValue
            )?.[1];

          if (userOptions.verbose && serverChunk) {
            logger.info(`[buildLoader] Found serverChunk: ${serverChunk.type}`);
          }

          if (serverChunk) {
            if (serverChunk.type === "asset") {
              // For CSS files, ensure we're in the React Server environment
              if (userOptions.autoDiscover.jsonPattern.test(normalizedValue)) {
                const jsonContent = serverChunk.source;
                if (typeof jsonContent === "string") {
                  if (userOptions.verbose) {
                    logger.info(
                      `[buildLoader] Returning JSON content for: ${normalizedValue}`
                    );
                  }
                  return { default: JSON.parse(jsonContent) };
                }
              } else if (
                userOptions.autoDiscover.cssPattern.test(normalizedValue)
              ) {
                const cssContent = serverChunk.source;
                if (typeof cssContent === "string") {
                  if (userOptions.verbose) {
                    logger.info(
                      `[buildLoader] Returning CSS content for: ${normalizedValue}, length: ${cssContent.length}`
                    );
                  }
                  return { default: cssContent };
                } else {
                  if (userOptions.verbose) {
                    logger.info(
                      `[buildLoader] CSS source is not string: ${typeof cssContent}`
                    );
                  }
                }
              }
              if (userOptions.verbose) {
                logger.info(
                  `[buildLoader] Returning default asset source for: ${normalizedValue}`
                );
              }
              return { default: serverChunk.source };
            } else if ("code" in serverChunk) {
              if (userOptions.verbose) {
                logger.info(
                  `[buildLoader] Returning code for: ${normalizedValue}`
                );
              }
              return { default: serverChunk.code };
            }
          }
          const panicError = handleError({
            error: new Error(
              `Could not find inline module for: ${normalizedValue}`
            ),
            logger,
            log: true,
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
            const filePath = join(
              userOptions.projectRoot,
              userOptions.build.outDir,
              userOptions.build.server,
              withoutQuery
            );
            const fileUrl = pathToFileURL(filePath).href;
            const module = await import(fileUrl);
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
            const filePath = join(
              userOptions.projectRoot,
              userOptions.build.outDir,
              userOptions.build.static,
              staticEntry.file
            );
            const fileUrl = pathToFileURL(filePath).href;
            const module = await import(fileUrl);
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
        // Try direct bundle lookup first, then fall back to manifest
        let serverEntry =
          serverManifest[manifestKey] ?? serverManifest[normalizedKey];

        // If not found and preserveModulesRoot is false, try with the moduleBase prefix
        if (
          !serverEntry &&
          userOptions.build.preserveModulesRoot === false &&
          normalizedValue.startsWith(userOptions.moduleBase + "/")
        ) {
          const withoutModuleBase = normalizedValue.replace(
            userOptions.moduleBase + "/",
            ""
          );
          serverEntry = serverManifest[withoutModuleBase];
        }

                if (serverEntry) {
          try {
            const modulePath = join(
              userOptions.projectRoot,
              userOptions.build.outDir,
              userOptions.build.server,
              serverEntry.file
            );
            
            const module = await import(modulePath);
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
        const builtFilePath = join(
          userOptions.projectRoot,
          userOptions.build.outDir,
          userOptions.build.server,
          moduleId
        );

        if (existsSync(builtFilePath)) {
          if (userOptions.verbose) {
            logger.info(`[buildLoader] Loading built file: ${builtFilePath}`);
            logger.info(`[buildLoader] NODE_OPTIONS: ${process.env.NODE_OPTIONS}`);
            logger.info(`[buildLoader] execArgv: ${process.execArgv.join(' ')}`);
            
            // Import condition detection functions
            const { getCurrentCondition, hasReactServerCondition } = await import("../config/getCondition.js");
            logger.info(`[buildLoader] getCurrentCondition(): ${getCurrentCondition()}`);
            logger.info(`[buildLoader] hasReactServerCondition(): ${hasReactServerCondition()}`);
          }
          
          // Load the built file with proper URL format
          const fileUrl = pathToFileURL(builtFilePath).href;
          const module = await import(fileUrl);
          temporaryReferences?.set(moduleRef, module);
          if (exportName && !(exportName in module)) {
            throw new Error(
              `Export ${exportName} not found in module ${withoutQuery}`
            );
          }
          return module;
        }

        // For React imports, use the vendor system instead of direct imports
        // Use static vendor for static generation (has static.node instead of server.node)
        if (moduleId === "react" || moduleId.startsWith("react/")) {
          throw new Error("You're not supposed to load react using the build loader. Simply use import React from 'react'.");
        }
        
        const modPath = resolve(
          userOptions.projectRoot,
          userOptions.build.outDir,
          userOptions.build.server,
          moduleId
        );
        const mod = await import(pathToFileURL(modPath).href);
        if (typeof mod === "object" && mod !== null && !(exportName in mod)) {
          throw new Error(
            `Export ${exportName} not found in module ${moduleId}`
          );
        }
        return mod;
      } catch (error) {
        // Enhance React Server DOM errors with import context
        let enhancedError = error instanceof Error ? error : new Error(String(error));
        if (enhancedError.message.includes('React Server Writer cannot be used outside a react-server environment')) {
          const filePath = resolve(
            userOptions.projectRoot,
            userOptions.build.outDir,
            userOptions.build.server,
            moduleId
          );
          enhancedError = new Error(
            `${enhancedError.message}\n` +
            `  → Imported from: ${moduleId}\n` +
            `  → Export: ${exportName}\n` +
            `  → File path: ${filePath}\n` +
            `  → NODE_OPTIONS: ${process.env.NODE_OPTIONS || 'not set'}\n` +
            `  → execArgv: ${process.execArgv.join(' ') || 'not set'}`
          );
          throw enhancedError;
        }
        
        const emptyExports = {
          error: enhancedError,
          id: id,
        };
        temporaryReferences?.delete(moduleRef);
        return emptyExports;
      }
    };
  };
