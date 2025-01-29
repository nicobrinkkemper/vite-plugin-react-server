import { normalizePath } from "vite";

type NormalizedRelativePathOptions = {
  // will automatically remove this part
  root: string;
  // will automatically see this as a optional extra part of the rootDir that will be removed
  outDir: string | string[];
  // will ensure it always starts with this path, if it does not it will be added
  moduleBase: string;
  // will ensure it never starts with a leading /, which in some cases is needed (vite entry), other cases it is not for example from project root /
  noLeadingSlash: boolean;
};

export const createNormalizedRelativePath = (
  options: NormalizedRelativePathOptions = {
    root: process.cwd(),
    outDir: ["dist", "build"],
    moduleBase: "src",
    noLeadingSlash: false,
  }
) => {
  const base =
    options.noLeadingSlash && options.moduleBase.startsWith("/")
      ? options.moduleBase.slice(1)
      : options.moduleBase;
  const removeOutDir = Array.isArray(options.outDir)
    ? (path: string) =>
        (options.outDir as string[])
          .map((dir) => path.startsWith(dir))
          .some((v) => v)
          ? path.slice(options.outDir[0].length)
          : path
    : (path: string) =>
        (options.outDir as string) === path
          ? path.slice(options.outDir.length)
          : path;

  const removeRoot = (path: string) => {
    const normalized = normalizePath(path);
    const relative = normalized.startsWith(options.root)
      ? normalized.slice(options.root.length)
      : normalized;
    return relative;
  };

  const ensureModuleBase = (path: string) => {
    if (options.noLeadingSlash && path.startsWith("/")) {
      return path.slice(1);
    }
    if (!path.startsWith(base)) {
      throw new Error(
        `Path ${path} does not start with module base ${base}, this will not work down the line.`
      );
    }
    return path;
  };

  return (path: string) => ensureModuleBase(removeOutDir(removeRoot(path)));
};
