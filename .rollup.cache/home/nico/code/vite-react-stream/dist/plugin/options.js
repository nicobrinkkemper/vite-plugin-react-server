import path from "node:path";
import { mergeInputs } from "./build/mergeInputs.js";
// Default configuration values
export const DEFAULT_CONFIG = {
    FILE_REGEX: /\.(m|c)?(j|t)sx?$/,
    CLIENT_ASSETS_DIR: "assets",
    RSC_DIR: "rsc",
    MODULE_BASE: "src",
    MODULE_BASE_PATH: "/src",
    MODULE_BASE_URL: "/src",
    PAGE: "/src/page/page.tsx",
    PROPS: "/src/page/props.ts",
    CLIENT_ENTRY: "/src/client.tsx",
    PAGE_EXPORT: "Page",
    PROPS_EXPORT: "props",
    // Just to make sure the paths are correct for the plugin user
    WORKER_PATH: "/node_modules/vite-plugin-react-server/dist/plugin/worker/worker.js",
    LOADER_PATH: "/node_modules/vite-plugin-react-server/dist/plugin/loader/loader.js",
    RSC_EXTENSION: ".rsc",
    HTML: ({ children }) => children,
    COLLECT_CSS: true,
    COLLECT_ASSETS: true,
    // TODO, not used yet
    PAGE_PATTERN: "/src/page/**/*.page.tsx",
    PROPS_PATTERN: "/src/page/**/*.props.ts",
    DEV_PORT: 5173,
    PREVIEW_PORT: 4173,
    DEV_HOST: "localhost",
    PREVIEW_HOST: "localhost",
    ENV_PREFIX: "VITE_",
    BUILD: {
        pages: () => ["/"],
        client: "dist/client",
        server: "dist/server",
    },
    // TODO, not used yet
    AUTO_DISCOVER: {
        pagePattern: "**/*.page.tsx",
        propsPattern: "**/*.props.ts",
    },
};
export function validateResolvedConfig(config) {
    if (typeof config === "object" &&
        config != null &&
        "build" in config &&
        typeof config.build === "object" &&
        config.build != null &&
        "rollupOptions" in config.build &&
        typeof config.build.rollupOptions === "object" &&
        config.build.rollupOptions != null &&
        "input" in config.build.rollupOptions &&
        typeof config.build.rollupOptions.input === "object" &&
        config.build.rollupOptions.input != null) {
        return undefined;
    }
    throw new Error("Invalid config");
}
;
export const resolveUserConfig = (condition, config, configEnv, userOptions) => {
    const isReactServer = condition === "react-server";
    const isViteServer = configEnv.command === "serve";
    const isVitePreview = configEnv.isPreview;
    if (isReactServer && configEnv.command === "build") {
        if (!config.build?.rollupOptions?.input) {
            config = {
                ...config,
                build: {
                    ...config.build,
                    rollupOptions: {
                        ...config.build?.rollupOptions,
                    },
                },
            };
        }
    }
    if (typeof config.build?.assetsDir === "string" &&
        userOptions.assetsDir !== config.build?.assetsDir) {
        return {
            type: "error",
            error: new Error(`assetsDir cannot be changed after the config has been resolved, before: ${userOptions.assetsDir}, after: ${config.build?.assetsDir}`),
        };
    }
    if (isReactServer) {
        if (configEnv.command === "build") {
            if (!configEnv.isSsrBuild) {
                return {
                    type: "error",
                    error: new Error("ssr must be true when using the server plugin, NODE_OPTIONS='--conditions react-server' vite build --ssr"),
                };
            }
        }
        else if (!isViteServer) {
            return {
                type: "error",
                error: new Error(isViteServer
                    ? `react-server condition was not set. Please use \`NODE_OPTIONS='--conditions react-server' vite${isVitePreview ? " preview" : ""}\``
                    : "react-server condition was not set. Please use `NODE_OPTIONS='--conditions react-server' vite build --ssr`"),
            };
        }
        else if (!configEnv.isSsrBuild && configEnv.command !== "serve") {
            return {
                type: "error",
                error: new Error("Vite was run with the react-server condition, but is making a client build."),
            };
        }
    }
    const { root: configRoot, mode: configMode, ...configRest } = config;
    const { outDir: configOutDir, assetsDir: configAssetsDir, ssr: configSsr, manifest: configManifest, ssrManifest: configSsrManifest, ssrEmitAssets: configSsrEmitAssets, target: configTarget, rollupOptions: configRollupOptions, ...configBuildRest } = config.build ?? {};
    if (!configRollupOptions?.input) {
        console.warn("No rollup options input was provided, using default input");
    }
    return {
        type: "success",
        userConfig: {
            ...configRest,
            appType: isReactServer ? "mpa" : "spa",
            root: configRoot ?? userOptions.projectRoot ?? process.cwd(),
            mode: configMode ?? process.env["NODE_ENV"] ?? "production",
            build: {
                ...configBuildRest,
                rollupOptions: {
                    ...configRollupOptions,
                    input: {
                        'index': '/index.html'
                    },
                },
                ssr: typeof configSsr !== "undefined" ? configSsr : isReactServer,
                manifest: typeof configManifest !== "undefined" ? configManifest : true,
                ssrManifest: typeof configSsrManifest !== "undefined" ? configSsrManifest : true,
                ssrEmitAssets: typeof configSsrEmitAssets !== "undefined"
                    ? configSsrEmitAssets
                    : true,
                target: configTarget ?? "es2020",
                outDir: typeof configOutDir === "string"
                    ? configOutDir
                    : isReactServer
                        ? userOptions.build.server
                        : userOptions.build.client,
                assetsDir: typeof configAssetsDir === "string"
                    ? configAssetsDir
                    : isReactServer
                        ? ""
                        : DEFAULT_CONFIG.CLIENT_ASSETS_DIR,
            },
        },
    };
};
export const resolveOptions = (options, condition) => {
    const { workerPath: optionsWorkerPath, loaderPath: optionsLoaderPath, projectRoot: optionsProjectRoot, moduleBase: optionsModuleBase, moduleBasePath: optionsModuleBasePath, moduleBaseURL: optionsModuleBaseURL, build: optionsBuild, Page: optionsPage, props: optionsProps, Html: optionsHtml, pageExportName: optionsPageExportName, propsExportName: optionsPropsExportName, collectCss: optionsCollectCss, collectAssets: optionsCollectAssets, assetsDir: optionsAssetsDir, clientEntry: optionsClientEntry, serverOutDir: optionsServerOutDir, clientOutDir: optionsClientOutDir, autoDiscover: optionsAutoDiscover, moduleBaseExceptions: optionsModuleBaseExceptions, ...restOptions } = options;
    const projectRoot = optionsProjectRoot ?? process.cwd();
    /** the module base can be assumed to not have a leading slash */
    const moduleBase = typeof optionsModuleBase === "string"
        ? optionsModuleBase.startsWith(path.sep)
            ? optionsModuleBase.slice(path.sep.length)
            : optionsModuleBase
        : DEFAULT_CONFIG.MODULE_BASE;
    if (typeof optionsModuleBase === "string" &&
        optionsModuleBase !== moduleBase) {
        return {
            type: "error",
            error: new Error(`moduleBase ${optionsModuleBase} is invalid, should be like ${moduleBase}`),
        };
    }
    const moduleBasePath = typeof optionsModuleBasePath === "string"
        ? !optionsModuleBasePath.startsWith(path.sep)
            ? `${path.sep}${optionsModuleBasePath}`
            : optionsModuleBasePath
        : `${path.sep}${moduleBase}`;
    if (!moduleBasePath.includes(moduleBase)) {
        return {
            type: "error",
            error: new Error(`moduleBasePath ${moduleBasePath} is invalid, should include moduleBase ${moduleBase}`),
        };
    }
    const moduleBaseURL = typeof optionsModuleBaseURL === "string"
        ? !optionsModuleBaseURL.endsWith(moduleBasePath)
            ? path.join(optionsModuleBaseURL, moduleBasePath)
            : optionsModuleBaseURL
        : moduleBasePath;
    if (!moduleBaseURL.includes(moduleBasePath)) {
        return {
            type: "error",
            error: new Error(`moduleBaseURL ${moduleBaseURL} is invalid, should include moduleBasePath ${moduleBasePath}`),
        };
    }
    if (typeof optionsModuleBaseURL === "string" &&
        optionsModuleBaseURL !== moduleBaseURL) {
        return {
            type: "error",
            error: new Error(`moduleBaseURL ${optionsModuleBaseURL} is invalid, should be like ${moduleBaseURL}`),
        };
    }
    const build = optionsBuild
        ? {
            client: optionsBuild.client ?? DEFAULT_CONFIG.BUILD.client,
            pages: optionsBuild.pages ?? DEFAULT_CONFIG.BUILD.pages,
            server: optionsBuild.server ?? DEFAULT_CONFIG.BUILD.server,
        }
        : DEFAULT_CONFIG.BUILD;
    const autoDiscover = typeof optionsAutoDiscover === "object"
        ? {
            pagePattern: typeof optionsAutoDiscover.pagePattern === "string"
                ? optionsAutoDiscover.pagePattern
                : DEFAULT_CONFIG.AUTO_DISCOVER.pagePattern,
            propsPattern: typeof optionsAutoDiscover.propsPattern === "string"
                ? optionsAutoDiscover.propsPattern
                : DEFAULT_CONFIG.AUTO_DISCOVER.propsPattern,
        }
        : DEFAULT_CONFIG.AUTO_DISCOVER;
    const workerPath = typeof optionsWorkerPath === "string"
        ? optionsWorkerPath
        : DEFAULT_CONFIG.WORKER_PATH;
    const loaderPath = typeof optionsLoaderPath === "string"
        ? optionsLoaderPath
        : DEFAULT_CONFIG.LOADER_PATH;
    const moduleBaseExceptions = condition !== "react-server"
        ? ["index", ...(optionsModuleBaseExceptions ?? [])]
        : [workerPath, loaderPath, ...(optionsModuleBaseExceptions ?? [])];
    return {
        type: "success",
        userOptions: {
            ...restOptions,
            moduleBase,
            moduleBasePath,
            moduleBaseURL,
            build,
            Page: optionsPage ?? DEFAULT_CONFIG.PAGE,
            props: optionsProps ?? DEFAULT_CONFIG.PROPS,
            Html: optionsHtml ?? DEFAULT_CONFIG.HTML,
            pageExportName: optionsPageExportName ?? DEFAULT_CONFIG.PAGE_EXPORT,
            propsExportName: optionsPropsExportName ?? DEFAULT_CONFIG.PROPS_EXPORT,
            collectCss: optionsCollectCss ?? DEFAULT_CONFIG.COLLECT_CSS,
            collectAssets: optionsCollectAssets ?? DEFAULT_CONFIG.COLLECT_ASSETS,
            projectRoot: projectRoot,
            assetsDir: optionsAssetsDir ?? DEFAULT_CONFIG.CLIENT_ASSETS_DIR,
            workerPath: workerPath,
            loaderPath: loaderPath,
            clientEntry: optionsClientEntry ?? DEFAULT_CONFIG.CLIENT_ENTRY,
            serverOutDir: optionsServerOutDir ?? DEFAULT_CONFIG.BUILD.server,
            clientOutDir: optionsClientOutDir ?? DEFAULT_CONFIG.BUILD.client,
            autoDiscover: autoDiscover,
            moduleBaseExceptions: moduleBaseExceptions,
        },
    };
};
export async function resolvePages(pages) {
    if (!pages) {
        return {
            type: "success",
            pages: [],
        };
    }
    if (typeof pages === "function") {
        try {
            return resolvePages(await Promise.resolve(pages()));
        }
        catch (error) {
            return {
                type: "error",
                error: error instanceof Error
                    ? error
                    : new Error(`build.pages must be a array of strings, or a (async) function that returns a string or an array of strings. Got "${JSON.stringify(pages)}"`, {
                        cause: error,
                    }),
            };
        }
    }
    try {
        const result = pages;
        const awaited = "then" in result ? await result : result;
        if (typeof awaited === "string") {
            return {
                type: "success",
                pages: [awaited],
            };
        }
        if (Array.isArray(awaited)) {
            if (awaited.every((page) => typeof page === "string")) {
                return {
                    type: "success",
                    pages: awaited,
                };
            }
            else {
                return {
                    type: "error",
                    error: new Error(`build.pages must be a array of strings, or a (async) function that returns a string or an array of strings. Got "${JSON.stringify(awaited.find((page) => typeof page !== "string"))}"`, {
                        cause: awaited,
                    }),
                };
            }
        }
        return {
            type: "error",
            error: new Error(`build.pages must be a array of strings, or a (async) function that returns a string or an array of strings. Got "${JSON.stringify(pages)}"`, {
                cause: pages,
            }),
        };
    }
    catch (error) {
        return {
            type: "error",
            error: error instanceof Error
                ? error
                : new Error(`build.pages must be a array of strings, or a (async) function that returns a string or an array of strings. Got "${JSON.stringify(error)}"`, {
                    cause: error,
                }),
        };
    }
}
//# sourceMappingURL=options.js.map