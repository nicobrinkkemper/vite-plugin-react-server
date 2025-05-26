import { join, toNamespacedPath } from "node:path";
import type {
  InlineCssOpt,
  PagePropOpt,
  ResolvedUserConfig,
  ResolvedUserOptions,
} from "../../server.js";
import type { Manifest } from "vite";
import { getModuleRef } from "../helpers/moduleRefs.js";
import { readFile } from "node:fs/promises";
import type { OutputBundle } from "rollup";
import { temporaryReferences } from "./temporaryReferences.js";
import { toError } from "../error/toError.js";

export interface BuildLoaderOptions<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
> {
  userConfig: ResolvedUserConfig;
  userOptions: ResolvedUserOptions<T, InlineCSS>;
  serverManifest: Manifest;
  clientManifest: Manifest;
  staticManifest: Manifest;
}

/**
 * Creates a loader function for handling module resolution during build.
 *
 * The loader handles the following strategy:
 *  - For client components: Use client manifest and client.browser.js
 *  - For server components: Use server manifest and server.js
 *  - For static assets: Use static manifest
 */
export async function createBuildLoader<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
>(
  {
    userOptions,
    serverManifest,
    clientManifest,
    staticManifest,
  }: BuildLoaderOptions<T, InlineCSS>,
  bundle: OutputBundle
) {
  const manifestKeys = Object.keys(serverManifest);
  if (!manifestKeys.length) {
    throw new Error("Server manifest is empty");
  }

  return async function buildLoader(id: string) {
    const [withoutQuery, query] = id.split("?", 2);
    const [normalizedKey, normalizedValue] = userOptions.normalizer(withoutQuery);
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
            if(userOptions.autoDiscover.jsonPattern(normalizedValue)) {
              const jsonContent = serverChunk.source;
              if (typeof jsonContent === 'string') {
                return { default: JSON.parse(jsonContent) };
              }
            } else if (userOptions.autoDiscover.cssPattern(normalizedValue)) {
              try {
                const cssContent = serverChunk.source;
                if (typeof cssContent === 'string') {
                  return { default: cssContent };
                }
              } catch (error) {
                console.warn("Error processing CSS file:", error);
                return null;
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
      const isClientComponent = userOptions.autoDiscover.clientComponents(normalizedValue);
      const isServerAction = userOptions.autoDiscover.serverFunctions(normalizedValue);
      const isPage = userOptions.autoDiscover.pagePattern(normalizedValue);
      const isProps = userOptions.autoDiscover.propsPattern(normalizedValue);

      // For client components, use client manifest
      if (isClientComponent) {
        const clientEntry = clientManifest[normalizedValue];
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
            console.warn("Error loading client module:", error);
            temporaryReferences?.delete(moduleRef);
            throw error;
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
            return module;
          } catch (error) {
            console.warn("Error loading server module:", error);
            temporaryReferences?.delete(moduleRef);
            throw error;
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
          return module;
        } catch (error) {
          console.warn("Error loading static module:", error);
          temporaryReferences?.delete(moduleRef);
          throw error;
        }
      }

      throw new Error(`Module ${normalizedValue} not found during build`);
    } catch (error) {
      const emptyExports = {
        error: error instanceof Error ? error : new Error(String(error)),
        id: id,
      };
      temporaryReferences?.set(moduleRef, emptyExports);
      return emptyExports;
    }
  };
}
