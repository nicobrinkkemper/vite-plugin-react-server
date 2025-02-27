import { createInputNormalizer } from "../helpers/inputNormalizer.js";

export const createModuleIdGenerator = ({
  inputRoot,
  client,
  server,
  moduleBase,
  isProduction,
  preserveModulesRoot,
  imports,
  removeExtension
}: {
  isProduction: boolean;
  inputRoot: string;
  client: string;
  server: string;
  moduleBase: string;
  preserveModulesRoot: boolean;
  removeExtension: ((path: string) => boolean) | string | RegExp;
  imports: Record<string, string>;
}) => {
  const normalizer = createInputNormalizer({
    root: inputRoot,
    removeExtension: removeExtension,
    preserveModulesRoot: preserveModulesRoot === true ? moduleBase : undefined,
  });
  return (moduleIdPath: string, ssr = isProduction) => {
    const [moduleId, modulePath] = normalizer(moduleIdPath);
    const key = preserveModulesRoot ? `${moduleBase}/${moduleId}` : moduleId;
    const hasImports = key in imports;

    if (hasImports) {
      // Return the actual file path from the manifest
      const mappedImport = imports[key];
      const noRoot = mappedImport.startsWith(inputRoot) ? mappedImport.slice(inputRoot.length +1) : mappedImport;
      const noModuleBase = preserveModulesRoot ? noRoot.startsWith(moduleBase) ? noRoot.slice(moduleBase.length) : noRoot : noRoot;
      return noModuleBase;
    } else if (ssr && isProduction) {
      // Only throw in production SSR builds
      const availableImports =
        Object.keys(imports).length > 0
          ? Object.keys(imports).join(", ")
          : "none";
      throw new Error(
        `${availableImports === "none" ? "No imports." : `Module ID ${key}, ${modulePath} is not in imports. Available imports: ${availableImports}`}`
      );
    } else {
      // For development or non-SSR builds, use the module ID
      return moduleId;
    }
  };
};
