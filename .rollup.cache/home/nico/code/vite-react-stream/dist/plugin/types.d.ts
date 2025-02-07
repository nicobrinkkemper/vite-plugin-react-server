export type UserConfig = Vite.UserConfig;
export type BuildOptions = Vite.BuildOptions;
export type InlineConfig = Vite.InlineConfig;
export type AliasOptions = Vite.AliasOptions;
export type ResolvedUserConfig = Required<Pick<UserConfig, "root" | "mode" | "build">> & Omit<UserConfig, "root" | "mode" | "build"> & {
    build: NonNullable<Required<Pick<BuildOptions, "target" | "outDir" | "assetsDir" | "ssr" | "ssrEmitAssets" | "ssrManifest" | "manifest" | "rollupOptions">>> & Omit<BuildOptions, "target" | "outDir" | "assetsDir" | "ssr" | "ssrEmitAssets" | "ssrManifest" | "manifest" | "rollupOptions"> & {
        rollupOptions: {
            input: Record<string, string>;
        } & Omit<NonNullable<BuildOptions['rollupOptions']>, "input">;
    };
};
export interface StreamPluginOptionsClient {
    outDir?: string;
    build?: BuildConfig;
    assetsDir?: string;
    projectRoot?: string;
    moduleBase?: string;
    moduleBasePath?: string;
    moduleBaseURL?: string;
    clientComponents?: AliasOptions;
    cssFiles?: AliasOptions;
}
export type ResolvedUserOptions = Required<Pick<StreamPluginOptions, "moduleBase" | "moduleBasePath" | "moduleBaseURL" | "projectRoot" | "build" | "Page" | "props" | "Html" | "pageExportName" | "propsExportName" | "collectCss" | "collectAssets" | "assetsDir" | "workerPath" | "loaderPath" | "clientEntry" | "serverOutDir" | "clientOutDir" | "moduleBaseExceptions">> & {
    build: NonNullable<Required<StreamPluginOptions["build"]>>;
    autoDiscover: NonNullable<Required<StreamPluginOptions["autoDiscover"]>>;
};
export type createBuildConfigFn = <C extends "react-client" | "react-server">(input: {
    condition: C;
    root: string;
    input: Record<string, string>;
    userOptions: ResolvedUserOptions;
    userConfig: ResolvedUserConfig;
    moduleBaseExceptions: string[];
    pluginRoot: string;
    nodeRoot: string;
    temporaryReferences: WeakMap<WeakKey, string>;
    moduleBase: string;
}) => C extends "react-server" ? InlineConfig : UserConfig;
export interface StreamPluginOptions {
    projectRoot?: string;
    assetsDir?: string;
    moduleBase?: string;
    moduleBasePath?: string;
    moduleBaseURL?: string;
    clientEntry?: string;
    serverOutDir?: string;
    clientOutDir?: string;
    autoDiscover?: {
        pagePattern?: string;
        propsPattern?: string;
    };
    Page: string | ((url: string) => string);
    props?: undefined | string | ((url: string) => string);
    workerPath?: string;
    loaderPath?: string;
    pageExportName?: string;
    propsExportName?: string;
    Html?: React.FC<{
        manifest: import("vite").Manifest;
        pageProps: any;
        route: string;
        url: string;
        children: React.ReactNode;
    }>;
    collectCss?: boolean;
    collectAssets?: boolean;
    build?: BuildConfig;
    moduleBaseExceptions?: string[];
}
export interface CreateHandlerOptions<T = any> {
    loader: (id: string) => Promise<T>;
    manifest?: import("vite").Manifest;
    moduleGraph?: import("vite").ModuleGraph;
    cssFiles?: string[];
    onCssFile?: (path: string) => void;
    logger?: import("vite").Logger;
    pipableStreamOptions?: any;
}
export type ModuleLoader = (url: string, context?: any, defaultLoad?: any) => Promise<Record<string, any>>;
export interface BaseProps {
    manifest: import("vite").Manifest;
    children?: React.ReactNode;
    assets?: {
        css?: string[];
    };
}
export type StreamResult = {
    type: "success";
    stream: any;
    assets?: {
        css?: string[];
    };
} | {
    type: "error";
    error: unknown;
} | {
    type: "skip";
};
export interface RscStreamOptions {
    Page: React.ComponentType;
    props: any;
    Html: any;
    logger?: Console | import("vite").Logger;
    cssFiles?: string[];
    route: string;
    url: string;
    pipableStreamOptions?: any;
    moduleBasePath: string;
}
export interface RouteConfig {
    path: string;
    pattern?: {
        page?: string;
        props?: string;
    };
    paths?: {
        page: string;
        props: string;
    };
}
export interface BuildOutput {
    dir?: string;
    rsc?: string;
    ext?: string;
}
export interface BuildConfig {
    pages: string[] | (() => Promise<string[]> | string[]);
    client?: string;
    server?: string;
}
export interface RscResolver {
    /**
     * Get RSC data for static generation
     * @param path - Route path (e.g. "/", "/about")
     */
    getRscData: (path: string) => Promise<{
        Page: React.ComponentType;
        props: any;
    }>;
}
export interface Options {
    include?: RegExp;
    projectRoot?: string;
    moduleBase: string;
    moduleBasePath?: string;
    Html?: React.ComponentType<React.PropsWithChildren<{
        manifest: import("vite").Manifest;
    }>>;
    Page: string | ((url: string) => string);
    props?: string | ((url: string) => string);
    pageExportName?: string;
    propsExportName?: string;
    collectCss?: boolean;
    collectAssets?: boolean;
    emitCss?: boolean;
    moduleLoader?: (server: import("vite").ViteDevServer) => ModuleLoader;
    build?: BuildConfig;
    outDir?: string;
    /**
     * Configure static asset copying
     * - true: Copy all assets
     * - false: Don't copy assets
     * - Function: Custom filter for which files to copy
     */
    copyAssets?: boolean | ((file: string) => boolean);
}
export type RequestHandler = import("vite").Connect.NextHandleFunction;
export interface SsrStreamOptions {
    url: string;
    controller: AbortController;
    loader: (id: string) => Promise<any>;
    Html: any;
    options: StreamPluginOptions;
    pageExportName: string;
    propsExportName: string;
    moduleGraph: any;
    bootstrapModules?: string[];
    importMap?: Record<string, string[]>;
    clientComponents?: boolean;
    onlyClientComponents?: boolean;
}
export type RscServerConfig = {
    /** How to get RSC data (e.g. HTTP, direct import, etc) */
    getRscComponent: (url: string) => React.Usable<React.ReactNode>;
    /** Base URL for client assets */
    clientBase?: string;
    /** SSR stream rendering options */
    ssrOptions?: SsrStreamOptions;
};
export interface RscServerModule {
    /**
     * Get RSC data for a route
     * @param path - Route path (e.g. "/", "/about")
     * @returns Page component and props
     */
    getRscData: (path: string) => Promise<{
        /** Page component to render */
        Page: React.ComponentType;
        /** Props to pass to the page */
        props: any;
    }>;
}
export interface RegisterComponentMessage {
    type: "REGISTER_COMPONENT";
    id: string;
    code: string;
}
export type RscBuildResult = string[];
export interface ReactStreamPluginMeta {
    timing: BuildTiming;
}
export interface BuildTiming {
    start: number;
    configResolved?: number;
    buildStart?: number;
    buildEnd?: number;
    renderStart?: number;
    renderEnd?: number;
    total?: number;
}
//# sourceMappingURL=types.d.ts.map