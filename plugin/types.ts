import type {
  NormalizedOutputOptions,
  OutputBundle,
  PreRenderedChunk,
} from "rollup";
import type { PreRenderedAsset } from "rollup";
import type {
  UserConfig,
  BuildOptions,
  InlineConfig,
  AliasOptions,
  Connect,
  ResolveOptions,
  Manifest,
  Logger,
} from "vite";
import type { ReactServerDomEsmOptions } from "./worker/types.js";
import type React from "react";
import type { PassThrough, Transform } from "stream";
import type { MessagePort } from "node:worker_threads";
type OnEvent = (event: PluginEvent) => void;

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
      html: string;
      rsc: string;
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
  cssFiles: Map<string, CssContent>;
  staticManifest: Manifest;
};
export interface FileWriterOptions {
  outDir: string;
  fileType: "html" | "rsc";
  htmlOutputRoot: string;
  htmlOutputPath: string;
  onEvent?: OnEvent;
}

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

export type ResolvedUserOptions<
  InlineCSS extends boolean | undefined = boolean | undefined
> = Required<
  Pick<
    StreamPluginOptions,
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
    | "moduleBaseExceptions"
    | "pipeableStreamOptions"
    | "onMetrics"
    | "onEvent"
    | "css"
    | "normalizer"
  >
> & {
  props:
    | undefined
    | string
    | ((url: string) => string)
    | ((url: string) => Promise<string>);
  build: NonNullable<Required<StreamPluginOptions<InlineCSS>["build"]>>;
  css: NonNullable<Required<StreamPluginOptions<InlineCSS>["css"]>>;
  autoDiscover: {
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
  totalChunks: number;
}

export interface CssCollectorOptions {
  inlineCss?: boolean;
  purgeCss?: boolean;
  inlineThreshold?: number;
  inlinePatterns?: RegExp[];
  linkPatterns?: RegExp[];
}

export type PluginEvent =
  | FileWriteEvent
  | {
      // This is emitted when a route process is setup
      type: "route.process";
      data: {
        route: string;
        pagePath: string;
        propsPath?: string | undefined;
      };
    }
  | {
      type: "route.error";
      data: {
        route: string;
        error: any;
      };
    }
  | {
      type: "route.postpone";
      data: {
        route: string;
        reason: string;
      };
    }
  | {
      type: "props.load";
      data: {
        route: string;
        propsPath: string;
        props: any;
      };
    }
  | {
      type: "css.process";
      data: CssContent;
    }
  | {
      type: "build.start";
      data: {
        pages: string[];
        files: AutoDiscoveredFiles;
      };
    }
  | {
      type: "build.writeBundle";
      data: {
        pages: string[];
        options: NormalizedOutputOptions;
        bundle: OutputBundle;
        manifest: Manifest | undefined;
      };
    };

export interface StreamPluginOptions<
  InlineCSS extends boolean | undefined = boolean | undefined
> {
  projectRoot?: string;
  moduleBase: string;
  moduleBasePath?: string;
  moduleBaseURL?: string;
  moduleRootPath?: string;
  clientEntry?: string;
  serverEntry?: string;
  // Auto-discovery (zero-config)
  autoDiscover?:
    | {
        moduleExtension?: RegExp;
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
        // default: /\.node\.js$/
        nodeOnly?: string | RegExp | ((path: string) => boolean);
        // default: /\.node\.js$/
        dotFiles?: string | RegExp | ((path: string) => boolean);
        // default: /^\/_virtual\//
        virtualPattern?: string | RegExp | ((path: string) => boolean);
        // default: /\.rsc$/
        rscPattern?: string | RegExp | ((path: string) => boolean);
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
  Html?: React.FC<{
    manifest: import("vite").Manifest;
    pageProps: any;
    route: string;
    url: string;
    children: React.ReactNode;
  }>;
  CssCollector?: InlineCSS extends true
    ? React.FC<React.PropsWithChildren<InlineCssCollectorProps>>
    : React.FC<React.PropsWithChildren<CssCollectorProps>>;
  build?: BuildConfig;
  css?: CssCollectorOptions;
  moduleBaseExceptions?: string[];
  pipeableStreamOptions?: ReactServerDomEsmOptions;
  onMetrics?: (metrics: RenderMetrics) => void;
  onEvent?: (event: PluginEvent) => void;
  normalizer?: InputNormalizer;
}

export type CreateHandlerOptions<
  T = unknown,
  C extends React.ComponentType<T> = React.ComponentType<T>,
  InlineCSS extends boolean | undefined = undefined
> = Pick<
  ResolvedUserOptions<InlineCSS>,
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
  | "pipeableStreamOptions"
  | "onEvent"
  | "onMetrics"
  | "projectRoot"
> & {
  logger: Logger;
  loader: ModuleLoader;
  pagePath: string;
  propsPath?: string;
  pageProps?: T;
  PageComponent?: C;
  route: string;
  manifest: Manifest;
  worker?: any;
  htmlOutputPath: string;
  htmlOutputRoot?: string;
  rscOutputPath: string;
  rscOutputRoot?: string;
  importedCss?: Set<string>;
  cssFiles: Map<string, CssContent>;
  build: Pick<
    ResolvedUserOptions["build"],
    "outDir" | "pages" | "server" | "static" | "client"
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
  routeMap: Map<string, string[]>;
  urlMap: Map<string, { props?: string; page: string }>;
  errors: Error[];
};

// Add strict type checking for worker messages
export type WorkerMessage =
  | { type: "READY" }
  | { type: "ERROR"; error: string | Error }
  | { type: "RSC_CHUNK"; id: string; chunk: Buffer }
  | { type: "RSC_END"; id: string }
  | { type: "SHUTDOWN"; id: string }
  | { type: "SHUTDOWN_COMPLETE" }
  | { type: "CHUNK_PROCESSED"; id: string; success: boolean }
  | { type: "CHUNK_ERROR"; id: string; error: string }
  | { type: "METRICS"; metrics: StreamMetrics };

// Add branded types for safety
export type ModuleId = string & { readonly __brand: unique symbol };
export type PagePath = string & { readonly __brand: unique symbol };

export type HtmlProps = {
  pageProps: any;
  route: string;
  url: string;
  rscOutputPath: string;
  htmlOutputPath: string;
  projectRoot: string;
  moduleBase: string;
  moduleBaseURL: string;
  moduleBasePath: string;
  moduleRootPath: string;
  cssFiles: Map<string, CssContent>;
  manifest: Manifest;
};

export interface PageAsset {
  type: "css" | "js";
  path: string;
  parentUrl: string;
}

export interface PageData {
  route: string;
  clientComponents?: string[];
  html: {
    raw: string;
    transformed: string;
    assets: string[];
  };
  rsc: {
    modules: string[];
    content: string;
  };
  htmlComplete: boolean;
  rscComplete: boolean;
  cssFiles: Map<string, CssContent>;
  usedClasses: Set<string>;
  projectRoot: string;
  moduleBase: string;
  moduleBaseURL: string;
  moduleBasePath: string;
  moduleRootPath: string;
  rscOutputPath: string;
  htmlOutputPath: string;
  Page: React.ComponentType;
  props: unknown;
}

type BaseCssProps = {
  type: string;
  as: string;
  id: string;
};

type CssProps = BaseCssProps & {
  as: "link";
  children?: InlineCssProps extends false ? never : React.ReactNode;
  id: string;
  href: string;
  rel: "stylesheet";
  precedence?: string;
};
type InlineCssProps = BaseCssProps & {
  as: "style";
  children?: React.ReactNode;
  precedence?: never;
  rel?: never;
  href?: never;
};

export type CssContent<
  InlineCSS extends boolean | undefined = boolean | undefined
> = InlineCSS extends true
  ? InlineCssProps
  : InlineCSS extends false
  ? CssProps
  : CssProps | InlineCssProps;

export interface JsContent {
  type?: string;
  content: string;
  key?: string;
  path: string;
  id?: string;
}

export type CssCollectorProps = {
  moduleBaseURL: string;
  moduleBasePath: string;
  moduleRootPath: string;
  route?: string;
  inlineCss?: boolean;
  purgeCss?: boolean;
  children?: React.ReactNode;
  /** A map containing all the css files imported by the route and their proxy values
   * - when inlineCss is true, will contain the `content` property
   * - when prugeCss is true, will contain the module proxy which includes a `userClasses`
   * @example ```tsx
   * import styles from './styles.module.css';
   * export const Page = () => {
   *  return <div className={styles.userClass}>Hello World</div>
   * }
   * ```
   * then the module will basically contain whatever `styles` exported here. But how does it track css class usages
   * during streaming?
   *
   * const tags = Array.from(importedCss?.values() ?? []).map(cssFile => {
   *  return <link rel="stylesheet" href={cssFile.path} />
   * })
   * ```
   *
   *
   * */

  cssFiles?: Map<string, CssContent>;
};

export interface InlineCssCollectorProps {
  cssFiles: Map<string, CssContent>;
  moduleBaseURL: string;
  moduleRootPath: string;
  moduleBasePath: string;
  route?: string;
  purgeCss?: boolean;
  children?: React.ReactNode;
}

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
      totalChunks: number;
      streamMetrics: StreamMetrics;
      results: Map<
        string,
        {
          html: string;
          rsc: string;
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
      totalChunks: number;
      streamMetrics: StreamMetrics;
      results: Map<
        string,
        {
          html: string;
          rsc: string;
          metrics: {
            rscFull: StreamMetrics;
            rscHeadless: StreamMetrics;
          };
        }
      >;
    };

export type HandlerAssets = {
  css: CssContent[];
  js: string[];
  bootstrapModules: string[];
};

export type CreateHandlerResult =
  | {
      type: "success";
      controller: AbortController;
      stream: any;
      assets: {
        css: CssContent[];
        js: string[];
        bootstrapModules: string[];
      };
      route: string;
      metrics: StreamMetrics;
    }
  | { type: "error"; error: Error }
  | { type: "skip" };

export type FileWriteEvent = {
  type: "file.write";
  data: {
    route: string;
    fileType: "html" | "rsc";
    content: string;
    onComplete: () => Promise<void>;
  };
};

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
  data?: { port?: MessagePort };
}
// Add type declaration for import.meta.cssModules
declare global {
  interface ImportMeta {
    cssModules?: Record<string, Record<string, string>>;
  }
}
