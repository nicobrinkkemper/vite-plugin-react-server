import { join } from "node:path";
import { extMap } from "./extMap.js";
import type { ResolvedUserOptions } from "../types.js";

export const createDefaultModuleID = (options: {
  moduleBase: ResolvedUserOptions["moduleBase"];
  moduleBasePath: ResolvedUserOptions["moduleBasePath"];
  autoDiscover: Pick<
    ResolvedUserOptions["autoDiscover"],
    | "moduleExtension"
    | "jsExtension"
    | "cssExtension"
    | "jsonExtension"
    | "htmlExtension"
    | "rscExtension"
  >;
  build: Pick<ResolvedUserOptions["build"], "preserveModulesRoot">;
}) => {
  const { moduleBase, moduleBasePath, autoDiscover } = options;
  const isProd =
    process.env["NODE_ENV"] === "production" ||
    process.env["VITE_PROD"] === "true" ||
    process.env["VITE_PROD"] === "1";
  const prodModuleBase =
    isProd && options.build?.preserveModulesRoot === true
      ? options.moduleBase
      : undefined;
  const mapExtension = extMap(autoDiscover);

  return (id: string) => {
    if (prodModuleBase && id.startsWith(moduleBase)) {
      id = id.slice(moduleBase.length);
    }
    if (!id.startsWith(moduleBasePath)) {
      id = join(moduleBasePath, id);
    }
    // in the case the moduleBase comes after the base path, remove it
    if (prodModuleBase && id.startsWith("/" + moduleBase)) {
      id = id.slice(moduleBase.length + 1);
    }
    // these paths will generally start with a /, simply ensure they always do
    if (!id.startsWith("/")) {
      id = "/" + id;
    }
    if (isProd) {
      // generally it will work if we just use the .js extension for modules
      return mapExtension(id);
    }
    return id;
  };
};
