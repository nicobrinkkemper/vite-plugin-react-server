import type { ComponentType } from 'react';
import type { 
  UserConfig,
  BuildOptions,
  InlineConfig,
  AliasOptions,
  Connect,
} from 'vite';

// Input can be a string path, React component, tuple, or array
export type NormalizerInput = string | ComponentType<any> | [string, string] | string[];

export type InputNormalizer = (input: NormalizerInput) => [string, string];

export type InputNormalizerWorker = (input: NormalizerInput) => Promise<[string, string]>;

export type ResolvedUserConfig = Required<Pick<UserConfig, "root" | "mode" | "build">> &
  Omit<UserConfig, "root" | "mode" | "build"> & {
    build: NonNullable<Required<Pick<BuildOptions, 
      "target" | 
      "outDir" | 
      "assetsDir" | 
      "ssr" | 
      "ssrEmitAssets" | 
      "ssrManifest" | 
      "manifest" | 
      "rollupOptions"
    >>> &
    Omit<BuildOptions, 
      "target" | 
      "outDir" | 
      "assetsDir" | 
      "ssr" | 
      "ssrEmitAssets" | 
      "ssrManifest" | 
      "manifest"
    > 
  };

// Client plugin options
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
    | "htmlWorkerPath"
    | "rscWorkerPath"
    | "loaderPath"
    | "clientEntry"
    | "serverEntry"
    | "moduleBaseExceptions"
  >
> & {
  build: NonNullable<Required<StreamPluginOptions["build"]>>;
  autoDiscover: NonNullable<Required<StreamPluginOptions["autoDiscover"]>>;
};

export type createBuildConfigFn<C extends "react-client" | "react-server"> = (input: {
  condition: C;
  userOptions: ResolvedUserOptions;
  userConfig: ResolvedUserConfig;
  mode: "production" | "development" | "test";
  inputNormalizer: C extends "react-server" ? InputNormalizerWorker : InputNormalizerWorker;
}) => C extends "react-server" ? Promise<InlineConfig> : Promise<InlineConfig>;

export interface StreamPluginOptions {
  projectRoot?: string;
  assetsDir?: string;
  moduleBase: string;
  moduleBasePath?: string;
  moduleBaseURL?: string;
  clientEntry?: string;
  serverEntry?: string;
  // Auto-discovery (zero-config)
  autoDiscover?: {
    // default: [Pp]age.tsx
    pagePattern?: RegExp;
    // default: [Pp]rops.ts
    propsPattern?: RegExp;
    // default: "use client" and .client./\.(m|c)?(j|t)sx?$/
    clientComponents?: RegExp;
    // default: "use server" and .server./\.(m|c)?(j|t)sx?$/
    serverFunctions?: RegExp;
  } | undefined;
  // Manual configuration
  Page: string | ((url: string) => string);
  props?: undefined | string | ((url: string) => string);
  // Escape hatches
  htmlWorkerPath?: string;
  rscWorkerPath?: string;
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
  moduleId?: (id: string) => string;
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

export type ModuleLoader = (
  url: string,
  context?: any,
  defaultLoad?: any
) => Promise<Record<string, any>>;

export interface BaseProps {
  manifest: import("vite").Manifest;
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
  logger?: Console | import("vite").Logger;
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
  static?: string; // Output directory for static environment - works in both
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


export type CheckFilesExistReturn = {
  propsMap: Map<string,string>,
  propsSet: Set<string>
  pageMap: Map<string,string>,
  pageSet: Set<string>
}