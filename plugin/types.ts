import type { Readable } from "node:stream";
import type { Worker } from "node:worker_threads";
import type React from "react";
import type {
  NormalizedOutputOptions,
  OutputBundle,
  PreRenderedAsset,
  PreRenderedChunk,
} from "rollup";
import type { PassThrough, Transform } from "stream";
import type {
  AliasOptions,
  BuildOptions,
  Connect,
  Logger,
  Manifest,
  ResolveOptions,
  UserConfig,
  ViteDevServer,
} from "vite";
import type { ReactServerDomEsmOptions } from "./worker/types.js";
import type { FragmentProps } from "react";
import type { ExoticComponent } from "react";

export type OnEvent = (event: PluginEvent) => void;

export type CreateInputNormalizerProps = {
  root: string;
  preserveModulesRoot?: string | undefined;
  removeExtension?: boolean | RegExp | string | ((path: string) => boolean);
  moduleBasePath: string | undefined;
};
export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Serializable[]
  | SerializableRecord;
export type SerializableRecord = {
  [key: string]: Serializable | SerializableRecord;
};

// Track HMR state
export type HmrState = {
  timestamp: number;
  invalidated: boolean;
  routes: string[];
};

export type RenderPageResult =
  | {
      type: "skip";
    }
  | {
      type: "error";
      error: Error;
    }
  | {
      type: "success";
      html: PassThrough;
      rsc: PassThrough;
      metrics: {
        rscFull: StreamMetrics;
        rscHeadless: StreamMetrics;
      };
    };

export type AutoDiscoveredFiles = ResolvedBuildPages & {
  workerPaths: Record<string, string>;
  serverEntry: Record<string, string> | null;
  clientEntry: Record<string, string>;
  inputs: Record<string, string>;
  staticManifest: Manifest;
  serverActions: Record<string, string>;
};
export type FileWriterOptions = Pick<
  CreateHandlerOptions,
  "onEvent" | "route" | "build"
>;

// Input can be a string path, React component, tuple, or array
export type NormalizerInput = unknown;

export type InputNormalizer = (input: NormalizerInput) => [string, string];

export interface HtmlContent {
  raw: string;
  transformed?: string;
  assets?: string[];
}

export interface PartialPageData {
  route: string;
  html?: {
    raw: string;
    transformed?: string;
    assets?: string[];
  };
  rsc?: {
    modules: any[];
    content: string;
  };
}

export type InputNormalizerWorker = (
  input: NormalizerInput
) => Promise<[string, string]>;

export type ResolvedUserConfig = Required<
  Pick<UserConfig, "root" | "mode" | "build" | "resolve">
> &
  Omit<UserConfig, "root" | "mode" | "build" | "resolve"> & {
    resolve: ResolveOptions;
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
          | "modulePreload"
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

export type SerializedUserConfig = Extract<
  ResolvedUserConfig,
  SerializableRecord
>;

export type SerializedUserOptions = Extract<
  ResolvedUserOptions,
  SerializableRecord
>;

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

export type ResolvedUserOptions<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
> = Required<
  Pick<
    StreamPluginOptions<T, InlineCSS>,
    | "moduleBase"
    | "moduleBasePath"
    | "moduleBaseURL"
    | "moduleRootPath"
    | "projectRoot"
    | "build"
    | "Page"
    | "Html"
    | "CssCollector"
    | "pageExportName"
    | "propsExportName"
    | "htmlWorkerPath"
    | "rscWorkerPath"
    | "loaderPath"
    | "clientEntry"
    | "serverEntry"
    // | "moduleBaseExceptions"
    | "pipeableStreamOptions"
    | "onMetrics"
    | "onEvent"
    | "css"
    | "normalizer"
    | "moduleID"
    | "publicOrigin"
    | "verbose"
  >
> & {
  props:
    | undefined
    | string
    | ((url: string) => string)
    | ((url: string) => Promise<string>);
  build: NonNullable<Required<StreamPluginOptions<T, InlineCSS>["build"]>>;
  css: NonNullable<Required<StreamPluginOptions<T, InlineCSS>["css"]>> & {
    inlineCss: InlineCSS;
  };
  autoDiscover: {
    moduleExtension: RegExp;
    serverDirective: RegExp;
    clientDirective: RegExp;
    cssExtension: string;
    jsonExtension: string;
    htmlExtension: string;
    rscExtension: string;
    jsExtension: string;
    modulePattern: (path: string) => boolean;
    cssPattern: (path: string) => boolean;
    jsonPattern: (path: string) => boolean;
    clientComponents: (path: string) => boolean;
    propsPattern: (path: string) => boolean;
    pagePattern: (path: string) => boolean;
    htmlPattern: (path: string) => boolean;
    rscPattern: (path: string) => boolean;
    serverFunctions: (path: string) => boolean;
    cssModulePattern: (path: string) => boolean;
    vendorPattern: (path: string) => boolean;
    nodeOnly: (path: string) => boolean;
    dotFiles: (path: string) => boolean;
    virtualPattern: (path: string) => boolean;
    isServerFunctionCode: (code: string) => boolean;
    isClientComponentCode: (code: string) => boolean;
  };
};

export interface StreamMetrics {
  chunks: number;
  bytes: number;
  backpressureCount: number;
  drainCount: number;
  errorCount: number;
  duration: number;
  startTime: number;
}

export interface RenderMetrics {
  route: string;
  htmlSize: number;
  rscSize: number;
  processingTime: number;
  chunks: number;
  chunkRate: number;
  memoryUsage: NodeJS.MemoryUsage;
  streamMetrics: StreamMetrics;
  htmlSizes: Map<string, number>;
  rscSizes: Map<string, number>;
}

export interface CssCollectorOptions<
  InlineCSS extends InlineCssOpt = InlineCssOpt
> {
  inlineCss?: InlineCSS;
  inlineThreshold?: number;
  inlinePatterns?: RegExp[];
  linkPatterns?: RegExp[];
}

export type CssContent<InlineCSS extends InlineCssOpt = InlineCssOpt> =
  InlineCSS extends true
    ? StyleCssProps
    : InlineCSS extends false
    ? LinkCssProps
    : InlineCSS extends undefined | boolean
    ? StyleCssProps | LinkCssProps
    : never;

/**
 * Boxed component type for the CssCollector
 */
export type CssCollectorBoxedType<
  _T extends PagePropOpt = PagePropOpt,
  _InlineCSS extends InlineCssOpt = InlineCssOpt,
  _As extends AsOpt = AsOpt
> = <
  T extends _T = _T,
  InlineCSS extends _InlineCSS = _InlineCSS,
  As extends _As = _As
>(
  props: CssCollectorProps<T, InlineCSS, As>
) => React.ReactElement;

export type CssCollectorProps<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt,
  As extends AsOpt = AsOpt
> = {
  as: As;
  cssFiles?: Map<string, CssContent<InlineCSS>>;
  pageProps?: T;
  Page: PageComponentType<T>;
  id?: string;
} & React.ComponentPropsWithoutRef<As>;

export type CssCollectorComponent = (
  props: CssCollectorProps
) => React.ReactElement;

/**
 * Boxed component type for the Html component
 */
export type HtmlBoxedType<
  _T extends PagePropOpt = PagePropOpt,
  _InlineCSS extends InlineCssOpt = InlineCssOpt,
  _As extends AsOpt = "div"
> = <
  T extends _T = _T,
  InlineCSS extends _InlineCSS = _InlineCSS,
  As extends _As = _As
>(
  props: HtmlProps<T, InlineCSS, As> & { key?: string }
) => React.ReactNode;

export type FileWriteEvent = {
  type: "file.write";
  data: {
    path: string;
    fileType: "html" | "rsc";
    route: string;
    stream: Readable;
    onComplete: () => Promise<void>;
  };
};

export type FileWriteDoneEvent = {
  type: "file.write.done";
  data: {
    route: string;
    fileType: "html" | "rsc";
    content: string;
  };
};

export type RouteProcessEvent = {
  type: "route.process";
  data: {
    route: string;
    pagePath: string;
    propsPath?: string | undefined;
  };
};

export type RouteErrorEvent = {
  type: "route.error";
  data: {
    route: string;
    error: any;
  };
};

export type RoutePostponeEvent = {
  type: "route.postpone";
  data: {
    route: string;
    reason: string;
  };
};

export type PropsLoadEvent = {
  type: "props.load";
  data: {
    route: string;
    propsPath: string;
    props: any;
  };
};

export type CssProcessEvent = {
  type: "css.process";
  data: CssContent;
};

export type BuildStartEvent = {
  type: "build.start";
  data: {
    pages: string[];
    files: AutoDiscoveredFiles;
  };
};

export type BuildWriteBundleEventServer = {
  type: "build.writeBundle.server";
  data: {
    pages: string[];
    options: NormalizedOutputOptions;
    bundle: OutputBundle;
  };
};

export type BuildWriteBundleEventClient = {
  type: "build.writeBundle.client";
  data: {
    pages: string[];
    options: NormalizedOutputOptions;
    bundle: OutputBundle;
  };
};

export type BuildWriteBundleEventStaticClient = {
  type: "build.writeBundle.static-client";
  data: {
    pages: string[];
    options: NormalizedOutputOptions;
    bundle: OutputBundle;
  };
};

export type BuildWriteBundleEventStaticServer = {
  type: "build.writeBundle.static-server";
  data: {
    pages: string[];
    options: NormalizedOutputOptions;
    bundle: OutputBundle;
  };
};

export type BuildWriteBundleEvent =
  | BuildWriteBundleEventServer
  | BuildWriteBundleEventClient
  | BuildWriteBundleEventStaticClient
  | BuildWriteBundleEventStaticServer;

export type PluginEvent =
  | FileWriteEvent
  | FileWriteDoneEvent
  | RouteProcessEvent
  | RouteErrorEvent
  | RoutePostponeEvent
  | PropsLoadEvent
  | CssProcessEvent
  | BuildStartEvent
  | BuildWriteBundleEvent;

export type PluginEventType = PluginEvent["type"];

export interface StreamPluginOptions<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
> {
  projectRoot?: string; // defaults to process.cwd()
  moduleBase: string; // defaults to 'src'
  moduleBasePath?: string; // defaults to '/'
  moduleBaseURL?: string; // defaults to '/'
  moduleRootPath?: string; // defaults to client's dist folder
  publicOrigin?: string; // defaults to window.location.origin in client & http://localhost:port in development
  clientEntry?: string;
  serverEntry?: string;
  // Auto-discovery (zero-config)
  autoDiscover?:
    | {
        // default: /\.(m|c)?(j|t)sx?$/
        moduleExtension?: RegExp;
        // default: /^"use server"[\s;]*\n?/m
        serverDirective?: RegExp;
        // default: /^"use client"[\s;]*\n?/m
        clientDirective?: RegExp;
        // css extension
        cssExtension?: string;
        // json extension
        jsonExtension?: string;
        // html extension
        htmlExtension?: string;
        // rsc extension
        rscExtension?: string;
        // .js extension
        jsExtension?: string;
        // default: /\.(m|c)?(j|t)sx?$/
        modulePattern?: RegExpOpt;
        // default: [Pp]age.tsx
        pagePattern?: RegExpOpt;
        // default: [Pp]rops.ts
        propsPattern?: RegExpOpt;
        // default: "use client" and .client./\.(m|c)?(j|t)sx?$/
        clientComponents?: RegExpOpt;
        // default: "use server" and .server./\.(m|c)?(j|t)sx?$/
        serverFunctions?: RegExpOpt;
        // default: /\.css$/
        cssPattern?: RegExpOpt;
        // default: /\.json$/
        jsonPattern?: RegExpOpt;
        // default: /\.html$/
        htmlPattern?: RegExpOpt;
        // default: /\.css\.js/
        cssModulePattern?: RegExpOpt;
        // default: /node_modules|(_virtual)/
        vendorPattern?: RegExpOpt;
        // default: /\.node\.js$/
        nodeOnly?: RegExpOpt;
        // default: /\.node\.js$/
        dotFiles?: RegExpOpt;
        // default: /^\/_virtual\//
        virtualPattern?: RegExpOpt;
        // default: /\.rsc$/
        rscPattern?: RegExpOpt;
        // default serverDirective regex
        isServerFunction?: RegExpOpt;
        // default clientDirective regex
        isClientComponent?: RegExpOpt;
      }
    | undefined;
  // Manual configuration
  Page: string | ((url: string) => string) | ((url: string) => Promise<string>);
  props?:
    | undefined
    | string
    | ((url: string) => string)
    | ((url: string) => Promise<string>);
  // Escape hatches
  htmlWorkerPath?: string;
  rscWorkerPath?: string;
  loaderPath?: string;
  pageExportName?: string;
  propsExportName?: string;
  Html?: React.FC<HtmlProps<T, InlineCSS>>;
  CssCollector?: CssCollectorBoxedType<T, InlineCSS>;
  build?: BuildConfig;
  css?: CssCollectorOptions<InlineCSS>;
  // moduleBaseExceptions?: string[];
  pipeableStreamOptions?: ReactServerDomEsmOptions;
  onMetrics?: (metrics: RenderMetrics) => void;
  onEvent?: (event: PluginEvent) => void;
  normalizer?: InputNormalizer;
  moduleID?: (id: string) => string;
  verbose?: boolean;
}

export type MultiPageHandlerOptions<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
> = Omit<
  CreateHandlerOptions<T, InlineCSS>,
  | "pagePath"
  | "route"
  | "cssFiles"
  | "propsPath"
  | "pageProps"
  | "PageComponent"
>;

export type CreateHandlerOptions<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt
> = Pick<
  ResolvedUserOptions<T, InlineCSS>,
  | "autoDiscover"
  | "css"
  | "pageExportName"
  | "propsExportName"
  | "Html"
  | "CssCollector"
  | "moduleBase"
  | "moduleRootPath"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "publicOrigin"
  | "pipeableStreamOptions"
  | "onEvent"
  | "onMetrics"
  | "projectRoot"
  | "normalizer"
  | "moduleID"
> & {
  logger: Logger;
  loader: ModuleLoader;
  pagePath: string;
  propsPath?: string;
  pageProps?: T;
  PageComponent?: PageComponentType<T>;
  route: string;
  manifest: Manifest;
  worker?: Worker;
  server?: ViteDevServer;
  importedCss?: Set<string>;
  cssFiles: Map<string, CssContent<InlineCSS>>;
  globalCss: Map<string, CssContent<InlineCSS>>;
  build: Pick<
    ResolvedUserOptions<T, InlineCSS>["build"],
    | "outDir"
    | "pages"
    | "server"
    | "static"
    | "client"
    | "rscOutputPath"
    | "htmlOutputPath"
  >;
};

export interface ResolvePageOptions {
  pagePath: string;
  pageExportName: string;
  url: string;
}

export interface ResolvePropsOptions {
  propsPath: string;
  propsExportName: string;
  url: string;
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
  pages: string[] | (() => Promise<string[]> | string[]) | Promise<string[]>;
  assetsDir?: string;
  client?: string; // Output directory for client files
  server?: string; // Output directory for server files
  static?: string; // Output directory for static environment - works in both
  api?: string; // Output directory for API files
  outDir?: string;
  hash?: string;
  preserveModulesRoot?: boolean;
  rscOutputPath?: string; // defaults: `index.rsc`
  htmlOutputPath?: string; // defaults: `index.html`
  entryFile?: (n: PreRenderedChunk, ssr: boolean) => string;
  chunkFile?: (n: PreRenderedChunk, ssr: boolean) => string;
  assetFile?: (n: PreRenderedAsset, ssr: boolean) => string;
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
  closeBundle?: number;
  render?: number;
  total?: number;
}

export type ResolvedBuildPages = {
  propsMap: Map<string, string>;
  pageMap: Map<string, string>;
  /**
   * ## routeMap
   *
   * Maps props & page paths to routes
   *
   * @example
   * const routeMap = new Map<string, string[]>();
   * routeMap.set("src/page/home/page.tsx", ["/", "/home"]);
   */
  routeMap: Map<string, string[]>;
  /**
   * ## urlMap
   *
   * Maps urls to props & page paths
   *
   * @example
   * ```ts
   * const urlMap = new Map<string, { props?: string; page: string }>();
   * urlMap.set("/", { props: "/props", page: "/page" });
   * ```
   */
  urlMap: Map<string, { props?: string; page: string }>;
  errors: Error[];
};

// Add branded types for safety
export type ModuleId = string & { readonly __brand: unique symbol };
export type PagePath = string & { readonly __brand: unique symbol };

export type InlineCssOpt = undefined | boolean;
export type PagePropOpt = Record<string, unknown> | undefined;
export type RegExpOpt = RegExp | string | ((path: string) => boolean);

export type AsOpt =
  | ExoticComponent<FragmentProps>
  | Exclude<keyof React.JSX.IntrinsicElements, "symbol" | "object">;
export type PageComponentType<T extends PagePropOpt = PagePropOpt> =
  React.ComponentType<T & React.PropsWithChildren<{}>>;

export type HtmlProps<
  T extends PagePropOpt = PagePropOpt,
  InlineCSS extends InlineCssOpt = InlineCssOpt,
  As extends AsOpt = AsOpt
> = {
  pageProps?: T;
  Page: PageComponentType<T>;
  route: string;
  url: string;
  projectRoot: string;
  moduleBase: string;
  moduleBaseURL: string;
  moduleBasePath: string;
  moduleRootPath: string;
  cssFiles: Map<string, CssContent<InlineCSS>>;
  manifest: Manifest;
  CssCollector: CssCollectorBoxedType<T, InlineCSS, As>;
  globalCss: Map<string, CssContent<InlineCSS>>;
  children?: React.ReactNode;
  as: As;
};

export interface PageAsset {
  type: "css" | "js";
  path: string;
  parentUrl: string;
}

type BaseCssProps = {
  as: string;
  id: string;
};

export type LinkCssProps = BaseCssProps & {
  as: "link";
  type?: never;
  children?: never;
  id: string;
  href: string;
  rel: "stylesheet";
  precedence?: string;
};

export type StyleCssProps = BaseCssProps & {
  as: "style";
  type: "text/css";
  children?: React.ReactNode;
  precedence?: never;
  rel?: never;
  href?: never;
};

export type CssCollectorElementsProps<
  InlineCSS extends InlineCssOpt = InlineCssOpt
> = {
  cssFiles: Map<string, CssContent<InlineCSS>>;
};

export interface HtmlRenderState {
  id: string;
  rscStream: PassThrough;
  htmlStream: PassThrough;
  progressStream: PassThrough;
  errorTransform: Transform;
  htmlChunks: string[];
  pipeableStreamOptions: Omit<
    ReactServerDomEsmOptions,
    "onError" | "onPostpone"
  >;
  streamState: StreamMetrics;
}

export type RenderPagesResult =
  | {
      type: "error";
      error: Error;
      failedRoutes: Set<string>;
      completedRoutes: Set<string>;
      htmlSizes: Map<string, number>;
      rscSizes: Map<string, number>;
      streamMetrics: StreamMetrics;
      results: Map<
        string,
        {
          html: PassThrough;
          rsc: PassThrough;
          metrics: {
            rscFull: StreamMetrics;
            rscHeadless: StreamMetrics;
          };
        }
      >;
    }
  | {
      type: "success";
      completedRoutes: Set<string>;
      failedRoutes?: never;
      htmlSizes: Map<string, number>;
      rscSizes: Map<string, number>;
      streamMetrics: StreamMetrics;
      results: Map<
        string,
        {
          html: PassThrough;
          rsc: PassThrough;
          metrics: {
            rscFull: StreamMetrics;
            rscHeadless: StreamMetrics;
          };
        }
      >;
    };

export type HandlerAssets<InlineCSS extends InlineCssOpt = InlineCssOpt> = {
  css: CssContent<InlineCSS>[];
  js: string[];
  bootstrapModules: string[];
};

export type CreateHandlerResult<InlineCSS extends InlineCssOpt = InlineCssOpt> =

    | {
        type: "success";
        controller: AbortController;
        stream: any;
        assets: {
          css: CssContent<InlineCSS>[];
          js: string[];
          bootstrapModules: string[];
        };
        route: string;
        metrics: StreamMetrics;
      }
    | { type: "error"; error: Error }
    | { type: "skip" };

export type ReactStaticEvent =
  | FileWriteEvent
  | {
      type: "build.start";
      data: {
        pages: string[];
        files: Array<[string, { page: string; props?: string }]>;
      };
    };

// Define LoaderContext interface locally
export interface LoaderContext {
  format?: string;
  importAttributes?: Record<string, string>;
  conditions?: string[];
  env?: {
    targetEnvironment?: "client" | "server" | "browser";
  };
  url: string;
  userOptions?: any; // Add userOptions to the context
}
// Add type declaration for import.meta.cssModules
declare global {
  interface ImportMeta {
    cssModules?: Record<string, Record<string, string>>;
  }
}
