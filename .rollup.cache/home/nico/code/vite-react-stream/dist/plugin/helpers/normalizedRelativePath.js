import { normalizePath } from "vite";
export const createNormalizedRelativePath = (options = {
    root: process.cwd(),
    outDir: "dist",
    moduleBase: "src",
    noLeadingSlash: false,
    noTrailingSlash: false,
    moduleBaseExceptions: [],
}) => {
    let base = options.noLeadingSlash && options.moduleBase.startsWith("/")
        ? options.moduleBase.slice(1)
        : options.moduleBase;
    if (options.noTrailingSlash && base.endsWith("/")) {
        base = base.slice(0, -1);
    }
    const removeOutDir = (path) => options.outDir === path
        ? path.slice(options.outDir.length)
        : path;
    const removeRoot = (path) => {
        const relative = path.startsWith(options.root)
            ? path.slice(options.root.length)
            : path;
        return relative;
    };
    const ensureModuleBase = (path) => {
        let transformed = path;
        if (options.noLeadingSlash && path.startsWith("/")) {
            transformed = path.slice(1);
        }
        if (options.noTrailingSlash && transformed.endsWith("/")) {
            transformed = transformed.slice(0, -1);
        }
        return transformed;
    };
    return (path) => ensureModuleBase(removeOutDir(removeRoot(normalizePath(path))));
};
//# sourceMappingURL=normalizedRelativePath.js.map