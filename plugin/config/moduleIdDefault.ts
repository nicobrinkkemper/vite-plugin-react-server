import { normalizePath } from "vite";
import { DEFAULT_CONFIG } from "./defaults.js";

export const moduleIdDefault =
  ({
    projectRoot,
    output: _,
    isProduction,
  }: {
    isProduction: boolean;
    projectRoot: string;
    output: { dir: string };
  }) =>
  (moduleId: string) => {
    const normalized = normalizePath(moduleId);
    const noRoot = normalized.startsWith(projectRoot)
      ? normalized.slice(projectRoot.length)
      : normalized;
    if (!isProduction) {
      return noRoot;
    }
    return noRoot.replace(DEFAULT_CONFIG.FILE_REGEX, ".js");
  };