import { createLogger } from "vite";
import { collectManifestCss, collectModuleGraphCss, } from "../collect-css-manifest.js";
import { DEFAULT_CONFIG } from "../options.js";
import { resolvePage } from "../resolvePage.js";
import { resolveProps } from "../resolveProps.js";
import { createRscStream } from "./createRscStream.js";
export async function createHandler(url, pluginOptions, streamOptions) {
    const root = pluginOptions.projectRoot ?? process.cwd();
    const Html = pluginOptions.Html ?? DEFAULT_CONFIG.HTML;
    const pageExportName = pluginOptions.pageExportName ?? DEFAULT_CONFIG.PAGE_EXPORT;
    const propsExportName = pluginOptions.propsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT;
    const controller = new AbortController();
    const cssFiles = streamOptions.cssFiles;
    const propsPath = typeof pluginOptions.props === "function"
        ? pluginOptions.props(url)
        : pluginOptions.props;
    const pagePath = typeof pluginOptions.Page === "function"
        ? pluginOptions.Page(url)
        : pluginOptions.Page;
    const cssModules = new Set();
    if (!(streamOptions.manifest || streamOptions.moduleGraph))
        throw new Error("Missing manifest or moduleGraph, pass it to options.");
    const getCss = streamOptions.manifest
        ? (id) => collectManifestCss(streamOptions.manifest, root, id, streamOptions.onCssFile)
        : (id) => collectModuleGraphCss(streamOptions.moduleGraph, id);
    const loadWithCss = async (id) => {
        if (!id)
            return {};
        try {
            const mod = await streamOptions.loader(id);
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
    const PropsModule = await resolveProps({
        propsModule: await loadWithCss(propsPath ?? pagePath),
        path: String(propsPath ?? pagePath),
        exportName: propsExportName,
        url,
    });
    if (PropsModule.type === "error")
        return { type: PropsModule.type, error: PropsModule?.error };
    if (PropsModule.type === "skip")
        return { type: PropsModule.type };
    const props = PropsModule[propsExportName];
    if (props?.type === "error")
        return { type: props.type, error: props.error };
    if (props?.type === "skip")
        return { type: props.type };
    const PageModule = await resolvePage({
        pageModule: await loadWithCss(pagePath),
        path: pagePath,
        exportName: pageExportName,
        url,
    });
    if (PageModule.type === "error")
        return { type: PageModule.type, error: PageModule.error };
    if (PageModule.type === "skip")
        return { type: PageModule.type };
    const Page = PageModule[pageExportName];
    if (Page?.type === "error")
        return { type: Page.type, error: Page.error };
    if (Page?.type === "skip")
        return { type: Page.type };
    if (!(typeof Page === "function")) {
        return {
            type: "error",
            error: new Error("Invalid Page component: " + pagePath, {
                cause: Page,
            }),
        };
    }
    if (!(typeof props === "object")) {
        return {
            type: "error",
            error: new Error("Invalid props: " + propsPath, {
                cause: props,
            }),
        };
    }
    // Add any additional CSS files
    if (streamOptions.cssFiles) {
        streamOptions.cssFiles.forEach((css) => cssModules.add(css));
    }
    const stream = createRscStream({
        Html: Html,
        Page: Page,
        props: props,
        moduleBasePath: pluginOptions.moduleBasePath, // eg /src
        logger: streamOptions.logger ?? createLogger(),
        cssFiles: Array.from(cssModules),
        route: url,
        url,
        pipableStreamOptions: streamOptions.pipableStreamOptions,
    });
    if (!stream) {
        return { type: "skip" };
    }
    return {
        type: "success",
        controller,
        stream,
        assets: {
            css: cssFiles,
        },
    };
}
//# sourceMappingURL=createHandler.js.map