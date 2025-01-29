import type {
  AliasOptions,
  Connect,
  Logger,
  Manifest,
  ModuleGraph,
  ViteDevServer,
} from "vite";

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

export type ResolvedUserOptions = Required<
  Pick<
    StreamPluginOptions,
    | "moduleBase"
    | "moduleBasePath"
    | "moduleBaseURL"
    | "projectRoot"
    | "build"
    | "Page"
    | "props"
    | "Html"
    | "pageExportName"
    | "propsExportName"
    | "collectCss"
    | "collectAssets"
    | "assetsDir"
  >
> & { build: NonNullable<Required<StreamPluginOptions["build"]>> };

export interface StreamPluginOptions {
  projectRoot?: string;
  assetsDir?: string;
  moduleBase?: string;
  moduleBasePath?: string;
  moduleBaseURL?: string;
  clientEntry?: string;
  serverOutDir?: string;
  clientOutDir?: string;
  // Auto-discovery (zero-config)
  autoDiscover?: {
    pagePattern?: string;
    propsPattern?: string;
  };
  // Manual configuration
  Page: string | ((url: string) => string);
  props?: undefined | string | ((url: string) => string);
  // Escape hatches
  workerPath?: string;
  loaderPath?: string;
  pageExportName?: string;
  propsExportName?: string;
  Html?: React.FC<{
    manifest: Manifest;
    pageProps: any;
    route: string;
    url: string;
    children: React.ReactNode;
  }>;
  collectCss?: boolean;
  collectAssets?: boolean;
  build?: BuildConfig;
}

export interface CreateHandlerOptions<T = any> {
  loader: (id: string) => Promise<T>;
  manifest?: Manifest;
  moduleGraph?: ModuleGraph;
  cssFiles?: string[];
  onCssFile?: (path: string) => void;
  logger?: Logger;
  pipableStreamOptions?: any;
}

export type ModuleLoader = (
  url: string,
  context?: any,
  defaultLoad?: any
) => Promise<Record<string, any>>;

export interface BaseProps {
  manifest: Manifest;
  children?: React.ReactNode;
  assets?: {
    css?: string[];
  };
}

export type StreamResult =
  | {
      type: "success";
      stream: any;
      assets?: {
        css?: string[];
      };
    }
  | { type: "error"; error: unknown }
  | { type: "skip" };

export interface RscStreamOptions {
  Page: React.ComponentType;
  props: any;
  Html: any;
  logger?: Console | Logger;
  cssFiles?: string[];
  route: string;
  url: string;
  pipableStreamOptions?: any;
  moduleBasePath: string;
}

export interface RouteConfig {
  path: string;
  // Define page/props paths using patterns
  pattern?: {
    page?: string; // e.g. "page/_theme/[route]/page"
    props?: string; // e.g. "page/_theme/[route]/props"
  };
  // Or use explicit paths
  paths?: {
    page: string; // e.g. "page/home/page"
    props: string; // e.g. "page/home/props"
  };
}

export interface BuildOutput {
  dir?: string;
  rsc?: string;
  ext?: string;
}

export interface BuildConfig {
  pages: string[] | (() => Promise<string[]> | string[]);
  client?: string; // Output directory for client files
  server?: string; // Output directory for server files
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
  // can be inferred from moduleBase, will add / to moduleBase by default (if not already present)
  moduleBasePath?: string;
  Html?: React.ComponentType<React.PropsWithChildren<{ manifest: Manifest }>>;
  Page: string | ((url: string) => string);
  props?: string | ((url: string) => string);
  pageExportName?: string;
  propsExportName?: string;
  collectCss?: boolean;
  collectAssets?: boolean;
  emitCss?: boolean;
  moduleLoader?: (server: ViteDevServer) => ModuleLoader;
  build?: BuildConfig;
  outDir?: string; // defaults to 'dist'
  /**
   * Configure static asset copying
   * - true: Copy all assets
   * - false: Don't copy assets
   * - Function: Custom filter for which files to copy
   */
  copyAssets?: boolean | ((file: string) => boolean);
}

export type RequestHandler = Connect.NextHandleFunction;

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
