import type { ComponentType } from "react";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import type { PreRenderedChunk } from "rollup";
import type { PreRenderedAsset } from "rollup";
import type {
  UserConfig,
  BuildOptions,
  InlineConfig,
  AliasOptions,
  Connect,
  ResolveOptions,
} from "vite";
import type { PipeableStreamOptions } from "./worker/types.js";

// Input can be a string path, React component, tuple, or array
export type NormalizerInput = unknown;

export type InputNormalizer = (input: NormalizerInput) => [string, string];

export type InputNormalizerWorker = (
  input: NormalizerInput
) => Promise<[string, string]>;

export type ResolvedUserConfig = Required<
  Pick<UserConfig, "root" | "mode" | "build" | "resolve">
> &
  Omit<UserConfig, "root" | "mode" | "build" | "resolve"> & {
    resolve: {alias:AliasOptions} & ResolveOptions;
  } & {
    build: NonNullable<
      Required<
        Pick<
          BuildOptions,
          | "target"
          | "outDir"
          | "assetsDir"
          | "ssr"
          | "ssrEmitAssets"
          | "ssrManifest"
          | "manifest"
          | "rollupOptions"
        >
      >
    > &
      Omit<
        BuildOptions,
        | "target"
        | "outDir"
        | "assetsDir"
        | "ssr"
        | "ssrEmitAssets"
        | "ssrManifest"
        | "manifest"
      >;
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
    | "htmlWorkerPath"
    | "rscWorkerPath"
    | "loaderPath"
    | "clientEntry"
    | "serverEntry"
    | "moduleBaseExceptions"
    | "pipableStreamOptions"
    | "moduleId"
  >
> & {
  build: NonNullable<Required<StreamPluginOptions["build"]>>;
  autoDiscover: {
    modulePattern: (path: string) => boolean;
    cssPattern: (path: string) => boolean;
    jsonPattern: (path: string) => boolean;
    clientComponents: (path: string) => boolean;
    propsPattern: (path: string) => boolean;
    pagePattern: (path: string) => boolean;
    serverFunctions: (path: string) => boolean;
    cssModulePattern: (path: string) => boolean;
    vendorPattern: (path: string) => boolean;
  };
};

export type createBuildConfigFn<C extends "react-client" | "react-server"> =
  (input: {
    condition: C;
    userOptions: ResolvedUserOptions;
    userConfig: ResolvedUserConfig;
    mode: "production" | "development" | "test";
    inputNormalizer: C extends "react-server"
      ? InputNormalizerWorker
      : InputNormalizerWorker;
  }) => C extends "react-server"
    ? Promise<InlineConfig>
    : Promise<InlineConfig>;

export interface StreamPluginOptions {
  projectRoot?: string;
  moduleBase: string;
  moduleBasePath?: string;
  moduleBaseURL?: string;
  clientEntry?: string;
  serverEntry?: string;
  // Auto-discovery (zero-config)
  autoDiscover?:
    | {
        // default: /\.(m|c)?(j|t)sx?$/
        modulePattern?: string | RegExp | ((path: string) => boolean);
        // default: [Pp]age.tsx
        pagePattern?: string | RegExp | ((path: string) => boolean);
        // default: [Pp]rops.ts
        propsPattern?: string | RegExp | ((path: string) => boolean);
        // default: "use client" and .client./\.(m|c)?(j|t)sx?$/
        clientComponents?: string | RegExp | ((path: string) => boolean);
        // default: "use server" and .server./\.(m|c)?(j|t)sx?$/
        serverFunctions?: string | RegExp | ((path: string) => boolean);
        // default: /\.css$/
        cssPattern?: string | RegExp | ((path: string) => boolean);
        // default: /\.json$/
        jsonPattern?: string | RegExp | ((path: string) => boolean);
        // default: /\.html$/
        htmlPattern?: string | RegExp | ((path: string) => boolean);
        // default: /\.css\.js/
        cssModulePattern?: string | RegExp | ((path: string) => boolean);
        // default: /node_modules|(_virtual)/
        vendorPattern?: string | RegExp | ((path: string) => boolean);
      }
    | undefined;
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
  pipableStreamOptions?: PipeableStreamOptions;
  moduleId?: (id: string, ssr: boolean) => string;
}

export interface CreateHandlerOptions<T = any> {
  loader: (id: string) => Promise<T>;
  clientManifest?: import("vite").Manifest;
  serverManifest?: import("vite").Manifest;
  moduleGraph?: import("vite").ModuleGraph;
  cssFiles?: string[];
  onCssFile?: (path: string, parentUrl: string) => void;
  logger?: import("vite").Logger;
  pipableStreamOptions?: PipeableStreamOptions;
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
  htmlProps: any;
  route: string;
  url: string;
  pipableStreamOptions?: PipeableStreamOptions;
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
  assetsDir?: string;
  client?: string; // Output directory for client files
  server?: string; // Output directory for server files
  static?: string; // Output directory for static environment - works in both
  api?: string; // Output directory for API files
  outDir?: string;
  hash?: string;
  preserveModulesRoot?: boolean;
  entryFile?: (n: PreRenderedChunk) => string;
  chunkFile?: (n: PreRenderedChunk) => string;
  assetFile?: (n: PreRenderedAsset) => string;
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
  propsMap: Map<string, string>;
  propsSet: Set<string>;
  pageMap: Map<string, string>;
  pageSet: Set<string>;
  urlMap: Map<string, {props: string, page: string}>;
  errors: string[];
};

// Add strict type checking for worker messages
export type WorkerMessage =
  | { type: "READY" }
  | { type: "ERROR"; error: string | Error }
  | { type: "RSC_CHUNK"; id: string; chunk: Buffer }
  | { type: "RSC_END"; id: string }
  | { type: "SHUTDOWN" };

// Add branded types for safety
export type ModuleId = string & { readonly __brand: unique symbol };
export type PagePath = string & { readonly __brand: unique symbol };

export type HtmlProps = {
  pageProps: any;
  route: string;
  url: string;
  cssFiles: string[];
};
