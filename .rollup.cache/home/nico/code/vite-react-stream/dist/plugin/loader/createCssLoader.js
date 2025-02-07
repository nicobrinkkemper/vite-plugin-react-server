import { createLogger, ModuleGraph } from "vite";
import { collectManifestCss, collectModuleGraphCss, } from "../collect-css-manifest.js";
import { resolvePage } from "../resolvePage.js";
import { resolveProps } from "../resolveProps.js";
/**
 * create a loader that can be used to load css files from a manifest or a moduleGraph
 * @param options
 * @returns
 */
export async function createCssLoader(options) {
    const root = process.cwd();
    const cssModules = new Set();
    if (!(options.manifest || options.moduleGraph))
        throw new Error("Missing manifest or moduleGraph, pass it to options.");
    const getCss = options.manifest
        ? (id) => collectManifestCss(options.manifest, root, id, options.onCssFile)
        : (id) => collectModuleGraphCss(options.moduleGraph, id, options.onCssFile);
    const loadWithCss = async (id) => {
        if (!id)
            return {};
        try {
            const mod = await options.loader(id);
            const pageCss = await Promise.resolve(getCss(id));
            Array.from(pageCss.keys()).forEach((css) => cssModules.add(css));
            return mod;
        }
        catch (e) {
            if (e.message?.includes("module runner has been closed")) {
                return { type: "skip" };
            }
            else {
                return { type: "error", error: e };
            }
        }
    };
    return loadWithCss;
}
//# sourceMappingURL=createCssLoader.js.map