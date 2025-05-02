import { join } from "node:path";
import type {
  InputNormalizer,
  ResolvedUserConfig,
  ResolvedUserOptions,
} from "../../server.js";
import type { Manifest } from "vite";
import { getModuleRef } from "../moduleRefs.js";
import { createTemporaryReferenceSet } from "react-server-dom-esm/server.node";
import { readFile } from "node:fs/promises";

export interface BuildLoaderOptions {
  userConfig: ResolvedUserConfig;
  userOptions: ResolvedUserOptions;
  serverManifest: Manifest;
  clientManifest: Manifest;
}

let temporaryReferences: WeakMap<any, any> | undefined;

/**
 * Creates a loader function for handling module resolution during build.
 *
 * The loader handles the following strategy:
 *  - When we load a page or props, we eagerly load the css modules before we load the props & page
 *  - Any loaded module will be added to temporaryReferences
 *  - If we have already loaded a module, we return the cached module from temporaryReferences
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
export async function createBuildLoader({
  userOptions,
  serverManifest,
}: BuildLoaderOptions) {
  temporaryReferences = temporaryReferences ?? createTemporaryReferenceSet();
  const manifestKeys = Object.keys(serverManifest);
  if(!manifestKeys.length) {
    throw new Error("Server manifest is empty");
  }
  return async function buildLoader(id: string) {

    const [withoutQuery, query] = id.split("?", 2);
    const [, normalizedValue] = userOptions.normalizer(withoutQuery);
    const moduleRef = getModuleRef(id);
    // Check if we have a temporary reference (cached module)
    if (temporaryReferences?.has(moduleRef)) {
      const mod = temporaryReferences.get(moduleRef);
      if (typeof mod === "function") {
        return mod;
      } else if (typeof mod === "object" && mod !== null && "error" in mod) {
        // ignore it
      } else {
        throw new Error(`Module is not a function. ${JSON.stringify(mod)}`);
      }
    }

    try {
      // For inline modules, handle them directly
      if (query === "inline") {
        if (normalizedValue.endsWith(".css")) {
          const cssPath = join(
            userOptions.projectRoot,
            userOptions.build.outDir,
            userOptions.build.server,
            normalizedValue
          );
          const content = await readFile(cssPath, "utf-8");
          return { default: content };
        } else {
          const content = await readFile(
            join(userOptions.projectRoot, normalizedValue),
            "utf-8"
          );
          return { default: content };
        }
      }

      // Try to resolve the module using Vite's resolution
      const resolvedId = serverManifest[normalizedValue]; 
      if (!resolvedId) {
        throw new Error(`Module ${normalizedValue} not found`);
      }

      // Load the module
      const module = await import(join(
        userOptions.projectRoot,
        userOptions.build.outDir,
        userOptions.build.server,
        resolvedId.file
      ));
      temporaryReferences?.set(moduleRef, module);
      return module;
    } catch (error) {
      if (process.env["NODE_ENV"] !== "production") {
        console.error(`Error @ ${normalizedValue}`, error);
      }
      const emptyExports = {
        error: error instanceof Error ? error : new Error(String(error)),
        id: id,
      };
      temporaryReferences?.set(moduleRef, emptyExports);
      return emptyExports;
    }
  };
}
