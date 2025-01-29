import { resolve as resolvePath } from "node:path";
import { load } from "react-server-dom-esm/node-loader";
import {
  registerClientReference,
  registerServerReference,
} from "react-server-dom-esm/server.node";
import { createNormalizedRelativePath } from "../helpers/normalizedRelativePath.js";

type CreatePageLoaderOptions = {
  manifest: Record<string, { file: string }>;
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
  return async (url: string) =>
    Object.fromEntries(Object.entries(await import(url)).map(mapper));
};

export const createPageLoader = ({
  manifest,
  root,
  outDir,
  moduleBase,
  registerServer,
  registerClient,
  alwaysRegisterServer,
  alwaysRegisterClient,
}: CreatePageLoaderOptions) => {
  const pathNormalizer = createNormalizedRelativePath({
    root,
    outDir,
    moduleBase,
    noLeadingSlash: true,
  });
  return async (id: string) => {
    const normalizedId = pathNormalizer(id);
    const entry =
      normalizedId in manifest
        ? manifest[normalizedId]
        : Object.values(manifest).find((entry) => entry.file === normalizedId);
    if (!entry) {
      throw new Error(
        `Could not find manifest entry for ${id}, ${normalizedId} from ${root}`
      );
    }
    const loaderResult = await load(
      resolvePath(root, outDir, entry.file),
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
};
