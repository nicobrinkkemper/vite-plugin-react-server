import { normalizePath } from "vite";
import type { InputNormalizer, NormalizerInput } from "../types.js";
import path, { join, sep } from "path";
import { DEFAULT_CONFIG } from "../config/defaults.js";

let stashedNormalizer: InputNormalizer | null = null;

type CreateInputNormalizerProps = {
  root: string;
  preserveModulesRoot?: string | undefined;
  removeExtension?: boolean | RegExp | string | ((path: string) => boolean);
  moduleBasePath?: string | undefined;
};

const resolveExtensionOptions = (
  removeExtension: CreateInputNormalizerProps["removeExtension"]
) => {
  if (typeof removeExtension === "boolean") {
    if (removeExtension) {
      return (path: string) => {
        const extensionIndex = path.lastIndexOf(".");
        return extensionIndex !== -1 ? path.slice(0, extensionIndex) : path;
      };
    }
    return (path: string) => path;
  }
  if (typeof removeExtension === "string") {
    return (path: string) => path.replace(removeExtension, "");
  }
  if (removeExtension instanceof RegExp) {
    return (path: string) =>
      removeExtension.test(path) ? path.replace(removeExtension, "") : path;
  }
  if (typeof removeExtension === "function") {
    return (path: string) => {
      const extIndex = path.lastIndexOf(".");
      if (extIndex !== -1) {
        const extension = path.slice(extIndex);
        if (removeExtension(extension)) {
          return path.slice(0, extIndex);
        }
      }
      return path;
    };
  }
  return (path: string) => path;
};

const resolveRootOption = (
  root: CreateInputNormalizerProps["root"],
  preserveModulesRoot: CreateInputNormalizerProps["preserveModulesRoot"]
) => {
  if (typeof preserveModulesRoot === "string" && typeof root === "string") {
    const normalizedPreserveModulesRoot = normalizePath(preserveModulesRoot);
    if (root !== "" && normalizedPreserveModulesRoot.startsWith(root)) {
      return normalizedPreserveModulesRoot.slice(root.length + 1);
    }
    return "";
  } else if (
    typeof preserveModulesRoot === "string" &&
    typeof root !== "string"
  ) {
    return normalizePath(preserveModulesRoot);
  }
  return "";
};
const createKeyNormalizer =
  ({
    root: normalizedRoot,
    preserveModulesRoot,
    handleExtension,
    moduleBasePath,
  }: {
    root: string;
    preserveModulesRoot: string | undefined;
    handleExtension: (path: string) => string;
    moduleBasePath: string | undefined;
  }) =>
  (key: string) => {
    if (key.includes("?")) {
      key = key.split("?")[0];
    }

    // Handle virtual modules first
    const virtualPrefix = key.match(/^\0+/) ?? "";
    const actualKey = virtualPrefix ? key.slice(virtualPrefix[0].length) : key;

    let moduleId = normalizePath(actualKey);

    // Normalize root path to handle both absolute and relative paths
    const normalizedRootPath = normalizePath(normalizedRoot);
    if (moduleId.startsWith(normalizedRootPath)) {
      moduleId = moduleId.slice(normalizedRootPath.length);
    }
    if (
      typeof moduleBasePath === "string" &&
      moduleBasePath !== "" &&
      moduleBasePath !== "/"
    ) {
      moduleId = moduleId.startsWith(
        moduleBasePath.endsWith(sep) ? moduleBasePath : moduleBasePath + sep
      )
        ? moduleId.slice(
            moduleBasePath.length +
              (moduleBasePath.endsWith(sep) ? 0 : sep.length)
          )
        : moduleId;
    }

    moduleId = handleExtension(moduleId);
    while (moduleId.startsWith("/") || moduleId.startsWith(".")) {
      moduleId = moduleId.slice(1);
    }
    while (moduleId.endsWith("/")) {
      moduleId = moduleId.slice(0, -1);
    }
    if (typeof preserveModulesRoot === "string" && preserveModulesRoot !== "") {
      moduleId = moduleId.startsWith(preserveModulesRoot)
        ? moduleId.slice(preserveModulesRoot.length + path.sep.length)
        : moduleId;
    }

    // Add virtual prefix back
    return virtualPrefix + moduleId;
  };

const createPathNormalizer =
  ({
    root,
    preserveModulesRoot,
    moduleBasePath,
  }: {
    root: string;
    preserveModulesRoot: string | undefined;
    moduleBasePath: string | undefined;
  }) =>
  (path: string) => {
    if (typeof path !== "string") {
      throw new Error(`Invalid path: ${JSON.stringify(path)}`);
    }
    if (path.includes("?")) {
      path = path.split("?")[0];
    }
    let normalPath = normalizePath(path);
    if (normalPath.startsWith(root)) {
      normalPath = normalPath.slice(root.length);
    }
    if (
      typeof moduleBasePath === "string" &&
      moduleBasePath !== "" &&
      moduleBasePath !== "/"
    ) {
      normalPath = normalPath.startsWith(
        moduleBasePath.endsWith(sep) ? moduleBasePath : moduleBasePath + sep
      )
        ? normalPath.slice(
            moduleBasePath.length +
              (moduleBasePath.endsWith(sep) ? 0 : sep.length)
          )
        : normalPath;
    }
    if (typeof preserveModulesRoot === "string" && preserveModulesRoot !== "") {
      normalPath = normalPath.startsWith(preserveModulesRoot)
        ? normalPath.slice(preserveModulesRoot.length)
        : normalPath;
    }
    while (normalPath.endsWith("/")) {
      normalPath = normalPath.slice(0, -1);
    }
    return normalPath;
  };
/**
 * @description Create a function that normalizes the input
 * @param root - The root of the project
 * @param preserveModulesRoot - The root of the preserve modules
 * @param removeExtension - Whether to remove the extension of the file
 * @returns A function that normalizes the input
 */
export function createInputNormalizer({
  root,
  moduleBasePath,
  preserveModulesRoot = undefined,
  removeExtension = DEFAULT_CONFIG.MODULE_EXTENSION,
}: CreateInputNormalizerProps): InputNormalizer {
  if (stashedNormalizer) {
    return stashedNormalizer;
  }
  const relativeRoot = resolveRootOption(root, preserveModulesRoot);
  const handleExtension = resolveExtensionOptions(removeExtension);
  const normalizeEntryKey = createKeyNormalizer({
    root: root,
    preserveModulesRoot: preserveModulesRoot,
    handleExtension,
    moduleBasePath,
  });
  const normalizeEntryPath = createPathNormalizer({
    root: root,
    preserveModulesRoot: relativeRoot,
    moduleBasePath,
  });
  function normalizeInput(id: NormalizerInput): [string, string] {
    // Normalize both paths to use POSIX separators
    if (Array.isArray(id)) {
      const [key, path] = id;
      if (typeof key === "string" && Array.isArray(path) && path.length === 2) {
        const isNumber = !isNaN(Number(key));
        if (isNumber) {
          // ignore it
          return normalizeInput([path[0], path[1]]);
        }
        return normalizeInput([join(key, path[0]), path[1]]);
      }
      if (typeof key !== "string" || typeof path !== "string") {
        throw new Error(`Invalid input: ${JSON.stringify(id)}`);
      }
      return [normalizeEntryKey(key), normalizeEntryPath(path)];
    } else if (typeof id === "string") {
      // Return both the normalized ID and original normalized path
      return [normalizeEntryKey(id), normalizeEntryPath(id)];
    } else if (
      typeof id === "object" &&
      id !== null &&
      "$$typeof" in id &&
      "$$id" in id &&
      typeof id.$$id === "string"
    ) {
      const normalized: [string, string] = [
        normalizeEntryKey(id.$$id),
        normalizeEntryPath(id.$$id),
      ];
      return normalized;
    }
    throw new Error(`Invalid input type: ${typeof id}`);
  }

  stashedNormalizer = (input: NormalizerInput): [string, string] => {
    const [key, path] = normalizeInput(input);
    // Apply the same normalization to both key and path
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const virtualPrefix = key.match(/^\0+/) ?? "";
    // If key has virtual prefix, ensure path has it too
    const finalPath = virtualPrefix
      ? virtualPrefix.length && normalizedPath.startsWith(virtualPrefix[0])
        ? normalizedPath
        : virtualPrefix.length
        ? virtualPrefix[0] + normalizedPath
        : normalizedPath
      : normalizedPath;

    return [key, finalPath];
  };
  return stashedNormalizer;
}
