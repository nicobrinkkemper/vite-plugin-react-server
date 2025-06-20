import { join } from "node:path";
import type {
  ResolvedUserOptions,
} from "../types.js";
import { replaceExtension } from "./extMap.js";
import { getNodeEnv } from "../getNodeEnv.js";

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
    "moduleBase" | "moduleBasePath" | "autoDiscover" | "build"
  >,
  mode = getNodeEnv()
) => {
  const { moduleBase, moduleBasePath, build } = options;
  const isProd = mode === "production";

  const preserve =
    options.build.preserveModulesRoot

  return (id: string) => {
    // in the case the moduleBase comes after the base path, remove it
    if (preserve && id.startsWith("/" + moduleBase)) {
      id = id.slice(moduleBase.length + 1);
    } else if (preserve && id.startsWith(moduleBase)) {
      id = id.slice(moduleBase.length);
    }
    if (!id.startsWith(moduleBasePath)) {
      id = join(moduleBasePath, id);
    }
    // these paths will generally start with a /, simply ensure they always do
    if (!id.startsWith("/")) {
      id = "/" + id;
    }
    if (isProd) {
      // generally it will work if we just use the .js extension for modules
      return replaceExtension(id, {
        build: { extensionMap: build.extensionMap },
      });
    }
    return id;
  };
};
