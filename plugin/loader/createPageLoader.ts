import { resolve as resolvePath } from "node:path";

import { 
  load
  // @ts-ignore
} from "react-server-dom-esm/node-loader";

import {
  registerClientReference,
  registerServerReference,
  // @ts-ignore
} from "react-server-dom-esm/server.node";
import { createNormalizedRelativePath } from "../helpers/normalizedRelativePath.js";

type CreatePageLoaderOptions = {
  manifest: Record<string, { file: string; src?: string }>;
  root: string;
  outDir: string;
  moduleBase: string;
  registerServer?: string[];
  registerClient?: string[];
  alwaysRegisterServer?: boolean;
  alwaysRegisterClient?: boolean;
};

type CreateDefaultLoaderOptions = {
  id: string;
  registerServer?: string[];
  registerClient?: string[];
  alwaysRegisterServer?: boolean;
  alwaysRegisterClient?: boolean;
};

export const createDefaultLoader = ({
  id,
  registerServer,
  registerClient,
  alwaysRegisterServer = false,
  alwaysRegisterClient = false,
}: CreateDefaultLoaderOptions) => {
  const mapper = ([key, value]: [string, any]) => {
    try {
      if (
        registerClient?.includes(key) ||
        (alwaysRegisterClient && typeof value === "function")
      ) {
        return [key, registerClientReference(value, id, key)];
      }
      if (
        registerServer?.includes(key) ||
        (alwaysRegisterServer && typeof value === "function")
      ) {
        return [key, registerServerReference(value, id, key)];
      }
      return [key, value];
    } catch (e) {
      console.error("[RSC] Error registering reference:", key, value, e);
      return [key, value];
    }
  };
  return async (url: string) => {
    console.log("[createDefaultLoader] Loading:", url);
    const result = await import(url);
    console.log("[createDefaultLoader] Result:", result);
    return Object.fromEntries(Object.entries(result).map(mapper));
  };
};

export function createPageLoader({
  manifest,
  root,
  outDir,
  moduleBase,
  alwaysRegisterServer,
  alwaysRegisterClient,
  registerServer,
  registerClient,
}: CreatePageLoaderOptions) {
  return async function loader(id: string) {
    console.log("[pageLoader] Loading:", {
      id,
      manifest: Object.keys(manifest),
      outDir,
      moduleBase
    });
    console.log("[pageLoader] Manifest:", manifest);
    // Try to find the entry directly or by source file
    const manifestEntry = manifest[id] || 
                         Object.values(manifest).find(entry => entry.src === id);

    if (!manifestEntry) {
      throw new Error(
        `Could not find manifest entry for ${id} from ${root}. Available entries: ${Object.keys(manifest).join(', ')}`
      );
    }

    const loaderResult = await load(
      resolvePath(root, outDir, manifestEntry.file),
      { format: "module" },
      createDefaultLoader({
        id,
        registerServer,
        registerClient,
        alwaysRegisterServer,
        alwaysRegisterClient,
      })
    );
    return loaderResult;
  };
}
