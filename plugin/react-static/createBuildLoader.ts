import { join } from "node:path";
import type {
  InlineCssOpt,
  BuildModuleLoader,
  PageName,
  PagePropOpt,
  PropsName,
  ResolvedUserConfig,
  ResolvedUserOptions,
  AsOpt,
} from "../../server.js";
import type { Manifest } from "vite";
import { getModuleRef } from "../helpers/moduleRefs.js";
import type { OutputBundle } from "rollup";
import { temporaryReferences } from "./temporaryReferences.js";
import { toError } from "../error/toError.js";

export type CreateBuildLoaderFn = (props: {
  userConfig: ResolvedUserConfig;
  userOptions: ResolvedUserOptions;
  serverManifest: Manifest;
  clientManifest: Manifest;
  staticManifest: Manifest;
}, bundle: OutputBundle) => BuildModuleLoader;

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
    if(userOptions.verbose) {
      console.log("buildLoader", id);
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
      const isServerAction =
        userOptions.autoDiscover.serverPattern.test(normalizedValue);
      const isPage = userOptions.autoDiscover.pagePattern.test(normalizedValue);
      const isProps =
        userOptions.autoDiscover.propsPattern.test(normalizedValue);

      // For client components, use client manifest
      if (isClientComponent) {
        const clientEntry = clientManifest[normalizedValue];
        if(userOptions.verbose) {
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

      // For server components and actions, use server manifest
      if (isServerAction || isPage || isProps) {
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
            if(exportName && !(exportName in module)) {
              throw new Error(`Export ${exportName} not found in module ${normalizedValue}`);
            }
            return module;
          } catch (error) {
            const err = toError(error);
            console.warn("Error loading server module:", err);
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
          if(exportName && !(exportName in module)) {
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

