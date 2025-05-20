import { join } from "node:path";
import type { ResolvedUserConfig, ResolvedUserOptions } from "../../server.js";
import type { Manifest } from "vite";
import { getModuleRef } from "../helpers/moduleRefs.js";
import { readFile } from "node:fs/promises";
import type { OutputBundle } from "rollup";
import { temporaryReferences } from "./temporaryReferences.js";

export interface BuildLoaderOptions<T = unknown, InlineCSS extends boolean | undefined = undefined> {
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
 *  - Just load any file from any manifest we can find in the order of client, server, static
 *  - Ideally the buildLoader is only used form loading pages, props and inline css modules
 *  -
 *
 * During build:
 * - We use the manifest information to get module exports
 * - The manifest contains the transformed modules with their exports
 * - We store the module in temporaryReferences for later use
 *
 * @param options.root - The project root directory
 * @param options.pluginContext - The Rollup plugin context
 * @param options.userConfig - Resolved user configuration
 * @param options.userOptions - Resolved user options
 * @param options.serverManifest - Vite server manifest
 * @param options.clientManifest - Vite client manifest
 * @param options.options - Additional options including temporaryReferences
 *
 * @returns A loader function that resolves module paths to their exports
 */
export async function createBuildLoader<T = unknown, InlineCSS extends boolean | undefined = undefined>(
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
    const [, normalizedValue] = userOptions.normalizer(withoutQuery);
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
        // Then check server manifest
        const serverChunk =
          bundle[serverManifest[normalizedValue]?.file] ??
          bundle[staticManifest[normalizedValue]?.file] ??
          bundle[clientManifest[normalizedValue]?.file] ??
          bundle[withoutQuery];
        if (serverChunk) {
          if (serverChunk.type === "asset") {
            return { default: serverChunk.source };
          } else if ("code" in serverChunk) {
            return { default: serverChunk.code };
          } else {
            console.warn("Could not find inline module for: " + normalizedValue);
          }
        }

        // If not found in either manifest, try reading the file directly
        const module = {
          default: await readFile(
            join(
              userOptions.projectRoot,
              userOptions.build.outDir,
              userOptions.build.static,
              normalizedValue
            ),
            "utf-8"
          ),
        };
        temporaryReferences?.set(moduleRef, module);
        return module;
      }
      const clientEntry = clientManifest[normalizedValue];
      if (clientEntry) {
        const module = await import(
          join(
            userOptions.projectRoot,
            userOptions.build.outDir,
            userOptions.build.client,
            clientEntry.file
          )
        );
        console.warn(
          "client module used in buildLoader, consider making this available in the server manifest",
          module
        );
        temporaryReferences?.set(moduleRef, module);
        return module;
      }
      const bundleEntry = bundle[withoutQuery];
      if (bundleEntry) {
        // Load the module
        const module = await import(
          join(
            userOptions.projectRoot,
            userOptions.build.outDir,
            userOptions.build.server,
            bundleEntry.fileName
          )
        );
        temporaryReferences?.set(moduleRef, module);
      }
      // Try to resolve the module using Vite's resolution
      const serverEntry = serverManifest[normalizedValue];
      if (serverEntry) {
        // Load the module
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
      }
      // try static manifest
      const staticEntry = staticManifest[normalizedValue];
      if (staticEntry) {
        const module = await import(
          join(
            userOptions.projectRoot,
            userOptions.build.outDir,
            userOptions.build.static,
            staticEntry.file
          )
        );
        console.warn(
          "static module used in buildLoader, consider making this available in the server manifest",
          module
        );
        temporaryReferences?.set(moduleRef, module);
        return module;
      }
      throw new Error(`Module ${normalizedValue} not found`);
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
