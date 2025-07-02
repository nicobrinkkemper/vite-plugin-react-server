import type { ResolvedUserOptions } from "../types.js";
import { replaceExtension } from "./extMap.js";
import { getNodeEnv } from "../getNodeEnv.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { ConfigEnv } from "vite";
import { sep } from "node:path";

export type ModuleIDKey =
  | "modulePattern"
  | "cssPattern"
  | "jsonPattern"
  | "htmlPattern"
  | "rscPattern"
  | "nodeOnly"
  | "cssModulePattern"
  | "vendorPattern"
  | "virtualPattern"
  | "dotFiles";

export const createDefaultModuleID = (
  options: Pick<
    ResolvedUserOptions,
    "moduleBase" | "moduleBasePath" | "autoDiscover" | "build" | "moduleBaseURL"
  >,
  configEnv?: ConfigEnv,
  mode = getNodeEnv()
) => {
  const { moduleBase, moduleBasePath, build, moduleBaseURL } = options;
  const assetsDir = build.assetsDir || DEFAULT_CONFIG.BUILD.assetsDir;
  const isBuild = configEnv?.command === "build";
  const isProd = mode === "production" || isBuild;
  const removeModuleBase =
    isProd || isBuild || options.build.preserveModulesRoot;
  return (id: string) => {
    
    // Step 1: Handle assets directory paths - remove src from within assets path
    // Transform: assets/src/page/file.css -> assets/page/file.css
    if (id.startsWith(assetsDir + sep + moduleBase + sep)) {
      id = assetsDir + sep + id.slice((assetsDir + sep + moduleBase + sep).length);
    }
    
    // Step 2: Remove moduleBaseURL if present (for incoming IDs that already have base URL)
    if (moduleBaseURL && moduleBaseURL !== "/" && id.startsWith(moduleBaseURL)) {
      id = id.slice(moduleBaseURL.length);
    }
    
    // Step 3: Remove src after the moduleBasePath if present
    if (moduleBasePath && moduleBasePath !== "/" && id.startsWith(moduleBasePath + moduleBase)) {
      // slice inbetween the moduleBasePath and moduleBase
      id = moduleBasePath + id.slice((moduleBasePath + moduleBase).length);
    }
    
    // Step 4: Remove moduleBase (typically "src/") from the beginning
    if (removeModuleBase && id.startsWith(moduleBase + sep)) {
      id = id.slice(moduleBase.length + sep.length);
    }

    // Step 5: Ensure paths start with a moduleBasePath
    if (!id.startsWith(moduleBasePath)) {
      id = moduleBasePath + id;
    }
    
    // Step 6: Apply extension mapping for build
    if (isBuild) {
      id = replaceExtension(id, {
        build: { extensionMap: build.extensionMap },
      });
    }
    
    return id;
  };
};
