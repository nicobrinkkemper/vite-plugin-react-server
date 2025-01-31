import { normalizePath } from "vite";

type NormalizedRelativePathOptions = {
  // will automatically remove this part
  root: string;
  // will automatically see this as a optional extra part of the rootDir that will be removed
  outDir: string;
  // will ensure it always starts with this path, if it does not it will be added
  moduleBase: string;
  // will ensure it never starts with a leading /, which in some cases is needed (vite entry), other cases it is not for example from project root /
  noLeadingSlash: boolean;
  // will ensure it never ends with a trailing /
  noTrailingSlash: boolean;
  // allowed exception to moduleBase rules
  moduleBaseExceptions: string[];
};

export const createNormalizedRelativePath = (
  options: NormalizedRelativePathOptions = {
    root: process.cwd(),
    outDir: "dist",
    moduleBase: "src",
    noLeadingSlash: false,
    noTrailingSlash: false,
    moduleBaseExceptions: [],
  }
) => {
  let base =
    options.noLeadingSlash && options.moduleBase.startsWith("/")
      ? options.moduleBase.slice(1)
      : options.moduleBase;
  if (options.noTrailingSlash && base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  const removeOutDir = (path: string) =>
    (options.outDir as string) === path
      ? path.slice(options.outDir.length)
      : path;

  const removeRoot = (path: string) => {
    const relative = path.startsWith(options.root)
      ? path.slice(options.root.length)
      : path;
    return relative;
  };

  const ensureModuleBase = (path: string) => {
    let transformed = path;
    if (options.noLeadingSlash && path.startsWith("/")) {
      transformed = path.slice(1);
    }
    if (options.noTrailingSlash && transformed.endsWith("/")) {
      transformed = transformed.slice(0, -1);
    }
    return transformed;
  };

  return (path: string) => ensureModuleBase(removeOutDir(removeRoot(normalizePath(path))));
};
