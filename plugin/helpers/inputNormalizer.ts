import { normalizePath } from "vite";
import type {
  CreateInputNormalizerProps,
  InputNormalizer,
  NormalizerInput,
} from "../types.js";
import path, { join, relative, resolve, sep } from "path";
import { DEFAULT_CONFIG } from "../config/defaults.js";

let stashedNormalizer: InputNormalizer | null = null;

const resolveExtensionOptions = (
  removeExtension: CreateInputNormalizerProps["removeExtension"]
) => {
  if (typeof removeExtension === "boolean") {
    if (removeExtension) {
      return (path: string) => {
        // if extension is client or server, don't remove it
        if (path.endsWith(".client") || path.endsWith(".server")) {
          return path;
        }
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
      if (path.endsWith(".client") || path.endsWith(".server")) {
        return path;
      }
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
    root,
    preserveModulesRoot,
    handleExtension,
    moduleBasePath,
    moduleBaseURL,
  }: {
    root: string;
    preserveModulesRoot: string | undefined;
    handleExtension: (path: string) => string;
    moduleBasePath: string | undefined;
    moduleBaseURL: string | undefined;
  }) =>
  (key: string) => {
    if (key.includes("?")) {
      key = key.split("?")[0];
    }

    // Handle virtual modules first
    const virtualPrefix = key.match(/^\0+/) ?? "";
    const actualKey = virtualPrefix ? key.slice(virtualPrefix[0].length) : key;

    let moduleId = normalizePath(actualKey);

    // Only treat as file system path if it actually contains the root path
    // URL paths like "/" should not be resolved relative to file system root
    if(moduleId.startsWith("/") && moduleId.startsWith(root)) {
      moduleId = relative(root, moduleId);
    } else if (moduleId.startsWith(".")) {
      moduleId = relative(root, resolve(root, moduleId));
    } else if (moduleId.startsWith("/")) {
      // This is a URL path like "/" or "/about", remove leading slash for consistency
      moduleId = moduleId.slice(1);
    } 
    if(moduleBaseURL && moduleBaseURL !== "/" && moduleBaseURL !== "" && moduleId.startsWith(moduleBaseURL)) {
      moduleId = moduleId.slice(moduleBaseURL.length);
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
    while (moduleId.endsWith("/") || moduleId.startsWith(".")) {
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
    moduleBaseURL,
  }: {
    root: string;
    preserveModulesRoot: string | undefined;
    moduleBasePath: string | undefined;
    moduleBaseURL: string | undefined;
  }) =>
  (path: string) => {
    if (typeof path !== "string") {
      throw new Error(`Invalid path: ${JSON.stringify(path)}`);
    }
    if (path.includes("?")) {
      path = path.split("?")[0];
    }
    let normalPath = normalizePath(path);
    
    // Only treat as file system path if it actually contains the root path
    // URL paths like "/" should not be resolved relative to file system root
    if(normalPath.startsWith("/") && normalPath.startsWith(root)) {
      normalPath = relative(root, normalPath);
    } else if (normalPath.startsWith(".")) {
      normalPath = relative(root, normalPath);
    } else if (normalPath.startsWith("/")) {
      // This is a URL path like "/" or "/about", remove leading slash for consistency
      normalPath = normalPath.slice(1);
    }
    
    if(moduleBaseURL && moduleBaseURL !== "/" && moduleBaseURL !== "" && normalPath.startsWith(moduleBaseURL)) {
      normalPath = normalPath.slice(moduleBaseURL.length);
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
  moduleBasePath = DEFAULT_CONFIG.MODULE_BASE_PATH,
  moduleBaseURL = DEFAULT_CONFIG.MODULE_BASE_URL,
  preserveModulesRoot = undefined,
  removeExtension = DEFAULT_CONFIG.AUTO_DISCOVER.modulePattern,
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
    moduleBaseURL,
  });
  const normalizeEntryPath = createPathNormalizer({
    root: root,
    preserveModulesRoot: relativeRoot,
    moduleBasePath,
    moduleBaseURL,
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
    
    
    const virtualPrefix = key.match(/^\0+/) ?? "";
    // If key has virtual prefix, ensure path has it too
    const finalPath = virtualPrefix
      ? virtualPrefix.length && path.startsWith(virtualPrefix[0])
        ? path
        : virtualPrefix.length
        ? virtualPrefix[0] + path
        : path
      : path;
    return [key, finalPath];
  };
  return stashedNormalizer;
}
