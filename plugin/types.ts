import type { Readable } from "node:stream";
import type {
  Worker,
  Serializable as WorkerSerializable,
} from "node:worker_threads";
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
  Plugin,
  ResolveOptions,
  UserConfig,
  ViteDevServer,
} from "vite";
import type {
  serializeResolvedConfig,
  serializeResolvedUserConfig,
} from "./helpers/serializeUserOptions.js";
import type { AllowedDirectives, Program } from "./loader/directives/types.js";
import type { LoaderConfig, TransformOptions } from "./loader/types.js";
import type { RenderMetrics, StreamMetrics } from "./metrics/types.js";
import type { HtmlWorkerOutputMessage } from "./worker/html/types.js";
import type { RscChunkOutputMessage } from "./worker/rsc/types.js";
import type { ReactServerDomEsmOptions } from "./worker/types.js";

export type OnEvent<Interface extends ViteReactServerComponentsPlugin = DefaultInterface> = (
  event: PluginEvent<Interface>
) => void;

export type MessageHandler<
  T extends HtmlWorkerOutputMessage | RscChunkOutputMessage =
    | HtmlWorkerOutputMessage
    | RscChunkOutputMessage
> = (message: T) => void | Promise<unknown>;

export type CreateInputNormalizerProps = {
  root: string;
  preserveModulesRoot?: string | undefined;
  removeExtension?: boolean | RegExp | string | ((path: string) => boolean);
  moduleBasePath: string | undefined;
  moduleBaseURL: string | undefined;
};
export type Serializable =
  | WorkerSerializable
  | Serializable[]
  | SerializableRecord;

export type SerializableRecord = {
  [key: string]: Serializable;
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
  "onEvent" | "route" | "build" | "verbose" | "logger"
>;

// Input can be a string path, React component, tuple, or array
export type NormalizerInput = unknown;

export type InputNormalizer = (input: NormalizerInput) => [string, string];

export type HtmlContent = {
  raw: string;
  transformed?: string;
  assets?: string[];
};

export type PartialPageData = {
  route: string;
  html?: {
    raw: string;
    transformed?: string;
    assets?: string[];
  };
  rsc?: {
    modules: unknown[];
    content: string;
  };
};

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

export type SerializedUserConfig<
  T extends ResolvedUserConfig = ResolvedUserConfig
> = ReturnType<typeof serializeResolvedUserConfig<T>>;

export type SerializedUserOptions = {
  [k in keyof ResolvedUserOptions]: Extract<
    ResolvedUserOptions[k],
    Serializable | Record<string, Serializable>
  > extends infer X
    ? X extends never
      ? undefined
      : X
    : undefined;
};

export type SerializedResolvedConfig = ReturnType<
  typeof serializeResolvedConfig
>;

// Client plugin options
export type StreamPluginOptionsClient = {
  outDir?: string;
  build?: BuildConfig;
  assetsDir?: string;
  projectRoot?: string;
  moduleBase?: string;
  moduleBasePath?: string;
  moduleBaseURL?: string;
  clientComponents?: AliasOptions;
  cssFiles?: AliasOptions;
};

export type StringKeys =
  | "moduleBase"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "moduleRootPath"
  | "projectRoot"
  | "pageExportName"
  | "propsExportName"
  | "htmlWorkerPath"
  | "rscWorkerPath"
  | "loaderPath"
  | "reactLoaderPath"
  | "cssLoaderPath"
  | "envLoaderPath"
  | "clientEntry"
  | "serverEntry"
  | "publicOrigin";

export type NumberKeys =
  | "rscTimeout"
  | "htmlWorkerStartupTimeout"
  | "rscWorkerStartupTimeout";

export type BooleanKeys = "verbose";

export type NestedConfigKeys =
  | "build"
  | "autoDiscover"
  | "loader"
  | "css"
  | "pipeableStreamOptions";

export type EventKeys = "onMetrics" | "onEvent";

export type NormalizerKeys = "normalizer" | "moduleID";

export type ComponentKeys = "Html" | "Root";

export type SourceURLKeys = "Page" | "props";

export type OptKey =
  | StringKeys
  | NumberKeys
  | BooleanKeys
  | EventKeys
  | NormalizerKeys
  | ComponentKeys
  | SourceURLKeys;

export type AutoDiscoverConfig = {
  modulePattern: RegExp;
  serverPattern: RegExp;
  clientPattern: RegExp;
  pagePattern: RegExp;
  propsPattern: RegExp;
  cssPattern: RegExp;
  jsonPattern: RegExp;
  htmlPattern: RegExp;
  cssModulePattern: RegExp;
  vendorPattern: RegExp;
  nodePattern: RegExp;
  dotPattern: RegExp;
  virtualPattern: RegExp;
  rscPattern: RegExp;
};

export type GenericModuleLoader = (
  id: string
) => Promise<Record<string, unknown>>;

export type BuildModuleLoader<
  Opt extends Pick<
    ResolvedUserOptions,
    "pageExportName" | "propsExportName"
  > = Pick<ResolvedUserOptions, "pageExportName" | "propsExportName">,
  T extends PagePropOpt = PagePropOpt
> = <
  STR extends string,
  ID extends string = STR extends `${infer I extends string}${string}${string}`
    ? I
    : never,
  Special extends "?" | "#" | "" = STR extends `${string}${infer X extends
    | "?"
    | "#"}${string}`
    ? X
    : "",
  Extra extends string = STR extends `${string}${string}${infer Y extends string}`
    ? Y
    : ""
>(
  moduleId: STR
) => Promise<
  STR extends `${ID}${Special}${Extra}`
    ? `${Special}${Extra}` extends "?inline"
      ? { default: string }
      : Extra extends Opt["pageExportName"]
      ? {
          [k in Extra]: (props: T) => unknown;
        }
      : Extra extends Opt["propsExportName"]
      ? {
          [k in Extra]: T;
        }
      : Extra extends string
      ? Special extends "#"
        ? { [k in Extra]: unknown }
        : Record<string, unknown>
      : Record<string, unknown>
    : Record<string, unknown>
>;

// Interface-aware version of BuildModuleLoader
export type InterfaceAwareBuildModuleLoader<
  Interface extends ViteReactServerComponentsPlugin = DefaultInterface,
  Opt extends Pick<
    ResolvedUserOptions,
    "pageExportName" | "propsExportName"
  > = Pick<ResolvedUserOptions, "pageExportName" | "propsExportName">
> = BuildModuleLoader<Opt, Interface["PageProps"]>;

export type StreamError = {
  code?: string;
} & Error;

export type ResolvedUserOptions = {
  // Core required properties
  projectRoot: string;
  moduleBase: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  moduleRootPath: string;
  publicOrigin: string;
  pageExportName: string;
  propsExportName: string;
  htmlExportName: string;
  rootExportName: string;
  htmlWorkerPath: string;
  rscWorkerPath: string;
  loaderPath: string;
  reactLoaderPath?: string;
  cssLoaderPath?: string;
  envLoaderPath?: string;
  verbose: boolean;
  rscTimeout: number;
  htmlWorkerStartupTimeout: number;
  rscWorkerStartupTimeout: number;
  panicThreshold: "none" | "critical_errors" | "all_errors";

  // Optional properties
  onEvent?: OnEvent<DefaultInterface>;
  props?: StreamPluginOptions["props"];
  clientEntry?: string;
  serverEntry?: string;

  // Required complex properties
  Page: StreamPluginOptions["Page"];
  Html: StreamPluginOptions["Html"]; // Unresolved: can be string, function
  Root: StreamPluginOptions["Root"]; // Unresolved: can be string, function
  normalizer: InputNormalizer;
  moduleID: ((id: string) => string) | undefined;
  onMetrics: (metrics: RenderMetrics) => void;
  pipeableStreamOptions: ReactServerDomEsmOptions;
  autoDiscover: Required<AutoDiscoverConfig>;
  loader?: Required<LoaderConfig> | undefined;
  build: Required<BuildConfig>;
  css: RootOptions<boolean>;
  components?: StreamPluginOptions["components"]; // Direct component overrides (optional)
};

export type DirectiveOptions = Pick<
  TransformOptions,
  "verbose" | "panicThreshold" | "loader"
> & {
  loader: Pick<
    Required<NonNullable<TransformOptions["loader"]>>,
    | "isServerFunctionCode"
    | "isClientComponentCode"
    | "getDirectiveType"
    | "parse"
  > & {
    allowedDirectives: AllowedDirectives;
  };
  logger?: Logger;
};

export type RootOptions<InlineCSS extends InlineCssOpt = InlineCssOpt> = {
  inlineCss?: InlineCSS;
  inlineThreshold?: number;
  inlinePatterns?: RegExp[];
  linkPatterns?: RegExp[];
};

export type CssContent<InlineCSS extends InlineCssOpt = InlineCssOpt> =
  InlineCSS extends true
    ? StyleCssProps
    : InlineCSS extends false
    ? LinkCssProps
    : InlineCSS extends undefined | boolean
    ? StyleCssProps | LinkCssProps
    : never;

/**
 * Boxed component type for the Root
 */

export type CssComponentType<
  InlineCSS extends InlineCssOpt = InlineCssOpt,
  R = any
> = (props: {
  cssFiles: Map<string, CssContent<InlineCSS>> | CssContent[];
}) => R;

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
    error?: Error | null;
  };
};

export type RoutePostponeEvent = {
  type: "route.postpone";
  data: {
    route: string;
    reason?: string | null;
  };
};

export type PropsLoadEvent = {
  type: "props.load";
  data: {
    route: string;
    propsPath: string;
    props: unknown;
  };
};

export type CssProcessEvent<
  Interface extends ViteReactServerComponentsPlugin = DefaultInterface
> = {
  type: "css.process";
  data: InterfaceAwareCssContent<Interface>;
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

export type PluginEvent<Interface extends ViteReactServerComponentsPlugin = DefaultInterface> =
  | FileWriteEvent
  | FileWriteDoneEvent
  | RouteProcessEvent
  | RouteErrorEvent
  | RoutePostponeEvent
  | PropsLoadEvent
  | CssProcessEvent<Interface>
  | BuildStartEvent
  | BuildWriteBundleEvent;

export type PluginEventType = PluginEvent["type"];

export interface StreamPluginOptions<
  Interface extends ViteReactServerComponentsPlugin = DefaultInterface
> {
  projectRoot?: string; // defaults to process.cwd()
  moduleBase: string; // defaults to 'src'
  moduleBasePath?: string; // defaults to '/'
  moduleBaseURL?: string; // defaults to '/'
  moduleRootPath?: string; // defaults to client's dist folder
  publicOrigin?: string; // defaults to window.location.origin in client & http://localhost:port in development
  clientEntry?: string;
  serverEntry?: string; // Loader configuration
  loader?: {
    importServerPath?: string;
    importClientPath?: string;
    registerClientReferenceName?: string;
    registerServerReferenceName?: string;
    serverDirective?: RegExpOpt;
    clientDirective?: RegExpOpt;
    directivePattern?: RegExpOpt;
    isServerFunctionCode?: (code: string, moduleId?: string) => boolean;
    isClientComponentCode?: (code: string, moduleId?: string) => boolean;
    allowedDirectives?: string[] | AllowedDirectives;
    mode?: "development" | "production" | "test";
    getDirectiveType?: (
      directive: string,
      moduleId?: string
    ) => "client" | "server" | undefined;
    parse?: (source: string) => Promise<{
      ast: Program;
      code: string;
      map?: { url: string; start: number; end: number; lines: number } | null;
    }>;
  };
  // Auto-discovery (zero-config)
  autoDiscover?:
    | {
        // CSS related
        /**
         * Pattern to match CSS files. If not provided, uses default pattern.
         * Provide either a string pattern or RegExp.
         * @example ```ts
         * autoDiscover: {
         *   // String pattern
         *   cssPattern: ".css$",
         *   // Or RegExp pattern
         *   cssPattern: /\.css$/
         * }
         */
        cssPattern?: RegExpOpt;
        /**
         * Pattern to match CSS module files. If not provided, uses default pattern.
         * Provide either a string pattern or RegExp.
         * @example ```ts
         * autoDiscover: {
         *   // String pattern
         *   cssModulePattern: ".css\\.js$",
         *   // Or RegExp pattern
         *   cssModulePattern: /\.css\.js$/
         * }
         */
        cssModulePattern?: RegExpOpt;

        // Client/Server related
        /**
         * Pattern to match client component files. If not provided, uses default pattern.
         * Provide either a string pattern or RegExp.
         * @example ```ts
         * autoDiscover: {
         *   // String pattern
         *   clientPattern: ".client\\.(js|ts|jsx|tsx)$",
         *   // Or RegExp pattern
         *   clientPattern: /\.client\.(js|ts|jsx|tsx)$/
         * }
         */
        clientPattern?: RegExpOpt;
        /**
         * Pattern to match server function files. If not provided, uses default pattern.
         * Provide either a string pattern or RegExp.
         * @example ```ts
         * autoDiscover: {
         *   // String pattern
         *   serverPattern: ".server\\.(js|ts|jsx|tsx)$",
         *   // Or RegExp pattern
         *   serverPattern: /\.server\.(js|ts|jsx|tsx)$/
         * }
         */
        serverPattern?: RegExpOpt;

        // HTML related
        /**
         * Pattern to match HTML files. If not provided, uses default pattern.
         * Provide either a string pattern or RegExp.
         * @example ```ts
         * autoDiscover: {
         *   // String pattern
         *   htmlPattern: ".html$",
         *   // Or RegExp pattern
         *   htmlPattern: /\.html$/
         * }
         */
        htmlPattern?: RegExpOpt;

        // JSON related
        /**
         * Pattern to match JSON files. If not provided, uses default pattern.
         * Provide either a string pattern or RegExp.
         * @example ```ts
         * autoDiscover: {
         *   // String pattern
         *   jsonPattern: ".json$",
         *   // Or RegExp pattern
         *   jsonPattern: /\.json$/
         * }
         */
        jsonPattern?: RegExpOpt;

        // JS/Module related

        /**
         * Pattern to match module files. If not provided, uses default pattern.
         * Provide either a string pattern or RegExp.
         * @example ```ts
         * autoDiscover: {
         *   // String pattern
         *   modulePattern: "\\.(js|ts|jsx|tsx)$",
         *   // Or RegExp pattern
         *   modulePattern: /\.(js|ts|jsx|tsx)$/
         * }
         */
        modulePattern?: RegExpOpt;

        // RSC related
        /**
         * Pattern to match RSC files. If not provided, uses default pattern.
         * Provide either a string pattern or RegExp.
         * @example ```ts
         * autoDiscover: {
         *   // String pattern
         *   rscPattern: ".rsc$",
         *   // Or RegExp pattern
         *   rscPattern: /\.rsc$/
         * }
         */
        rscPattern?: RegExpOpt;

        // Page/Props related
        /**
         * Pattern to match page files. If not provided, uses default pattern.
         * Provide either a string pattern or RegExp.
         * @example ```ts
         * autoDiscover: {
         *   // String pattern
         *   pagePattern: "[Pp]age\\.(js|ts|jsx|tsx)$",
         *   // Or RegExp pattern
         *   pagePattern: /[Pp]age\.(js|ts|jsx|tsx)$/
         * }
         */
        pagePattern?: RegExpOpt;
        /**
         * Pattern to match props files. If not provided, uses default pattern.
         * Provide either a string pattern or RegExp.
         * @example ```ts
         * autoDiscover: {
         *   // String pattern
         *   propsPattern: "[Pp]rops\\.(js|ts|jsx|tsx)$",
         *   // Or RegExp pattern
         *   propsPattern: /[Pp]rops\.(js|ts|jsx|tsx)$/
         * }
         */
        propsPattern?: RegExpOpt;

        // Special patterns
        /**
         * Pattern to match dot files. No interpolation support.
         * @example ```ts
         * autoDiscover: {
         *   dotFiles: /^\.[^/]+$/
         * }
         */
        dotPattern?: RegExpOpt;
        /**
         * Pattern to match Node.js native modules. No interpolation support.
         * @example ```ts
         * autoDiscover: {
         *   nodePattern: /.node/
         * }
         */
        nodePattern?: RegExpOpt;
        /**
         * Pattern to match vendor files. No interpolation support.
         * @example ```ts
         * autoDiscover: {
         *   vendorPattern: /node_modules|_virtual/
         * }
         */
        vendorPattern?: RegExpOpt;
        /**
         * Pattern to match virtual files. No interpolation support.
         * @example ```ts
         * autoDiscover: {
         *   virtualPattern: /^virtual:/
         * }
         */
        virtualPattern?: RegExpOpt;
      }
    | undefined;
  // Manual configuration
  Page?: UrlOpt;
  props?: UrlOpt;
  // Escape hatches
  htmlWorkerPath?: string;
  rscWorkerPath?: string;
  loaderPath?: string;
  reactLoaderPath?: string;
  cssLoaderPath?: string;
  envLoaderPath?: string;
  pageExportName?: Interface["PageExportName"];
  propsExportName?: Interface["PropsExportName"];
  htmlExportName?: Interface["HtmlExportName"];
  rootExportName?: Interface["RootExportName"];
  Html?: UrlOpt;
  Root?: UrlOpt;
  // Direct component overrides (bypasses string resolution)
  components?: {
    Html?: HtmlComponentType<
      Interface["PageProps"],
      Interface["As"],
      Interface["InlineCSS"],
      Interface["ReactType"]
    >;
    Root?: RootComponentType<
      Interface["PageProps"],
      Interface["As"],
      Interface["InlineCSS"],
      Interface["ReactType"]
    >;
    Page?: PageComponentType<
      Interface["PageProps"],
      Interface["ReactType"]
    >;
  };
  build?: BuildConfig;
  css?: RootOptions<Interface["InlineCSS"]>;
  // moduleBaseExceptions?: string[];
  pipeableStreamOptions?: ReactServerDomEsmOptions;
  onMetrics?: (metrics: RenderMetrics) => void;
  onEvent?: OnEvent<Interface>;
  normalizer?: InputNormalizer;
  moduleID?: (id: string) => string;
  verbose?: boolean;
  rscTimeout?: number; // Timeout in milliseconds for RSC operations
  htmlWorkerStartupTimeout?: number; // Timeout in milliseconds for HTML worker startup
  rscWorkerStartupTimeout?: number; // Timeout in milliseconds for RSC worker startup
  panicThreshold?: "none" | "critical_errors" | "all_errors";
}

export type MultiPageHandlerOptions<
  Opt extends ResolvedUserOptions = ResolvedUserOptions
> = Omit<
  CreateHandlerOptions<Opt>,
  | "pagePath"
  | "route"
  | "cssFiles"
  | "propsPath"
  | "rootPath"
  | "htmlPath"
  | "pageProps"
  | "PageComponent"
  | "RootComponent"
  | "HtmlComponent"
>;

export type CreateHandlerOptions<
  Opt extends ResolvedUserOptions = ResolvedUserOptions,
  Interface extends ViteReactServerComponentsPlugin = DefaultInterface,
  R = Interface["ReactType"]
> = Pick<
  Opt,
  | "autoDiscover"
  | "css"
  | "pageExportName"
  | "propsExportName"
  | "rootExportName"
  | "htmlExportName"
  | "moduleBase"
  | "moduleRootPath"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "publicOrigin"
  | "onEvent"
  | "onMetrics"
  | "projectRoot"
  | "normalizer"
  | "moduleID"
  | "verbose"
  | "components"
> & {
  logger: Logger;
  loader: BuildModuleLoader | GenericModuleLoader;
  pagePath: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageProps?: Interface["PageProps"];
  PageComponent: PageComponentType<Interface["PageProps"], R>;
  RootComponent: RootComponentType<
    Interface["PageProps"],
    Interface["As"],
    Interface["InlineCSS"],
    R
  >;
  HtmlComponent: HtmlComponentType<
    Interface["PageProps"],
    Interface["As"],
    Interface["InlineCSS"],
    R
  > | typeof React.Fragment;
  route: string;
  url: string;
  as?: Interface["As"];
  manifest: Manifest;
  worker?: Worker;
  server?: ViteDevServer;
  importedCss?: Set<string>;
  cssFiles: Map<string, InterfaceAwareCssContent<Interface>>;
  globalCss: Map<string, InterfaceAwareCssContent<Interface>>;
  pipeableStreamOptions: ReactServerDomEsmOptions;
  build: Pick<
    ResolvedUserOptions["build"],
    | "outDir"
    | "pages"
    | "server"
    | "static"
    | "client"
    | "rscOutputPath"
    | "htmlOutputPath"
  >;
};

export type ResolvePageOptions = {
  pagePath: string;
  pageExportName: string;
  url: string;
};

export type ResolvePropsOptions = {
  propsPath: string;
  propsExportName: string;
  url: string;
};


export type StreamResult =
  | {
      type: "success";
      stream: PassThrough;
      assets?: {
        css?: string[];
      };
    }
  | { type: "error"; error: unknown }
  | { type: "skip" };

export type RouteConfig = {
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
};

export type BuildOutput = {
  dir?: string;
  rsc?: string;
  ext?: string;
};

export type BuildConfig = {
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
  extensionMap?: Record<string, string>;
  moduleExtension?: string;
  jsExtension?: string;
  cssExtension?: string;
  htmlExtension?: string;
  jsonExtension?: string;
  rscExtension?: string;
  cssModuleExtension?: string;
  nodeExtension?: string;
};

export type RequestHandler = Connect.NextHandleFunction;

export type RscServerModule = {
  /**
   * Get RSC data for a route
   * @param path - Route path (e.g. "/", "/about")
   * @returns Page component and props
   */
  getRscData: (path: string) => Promise<{
    /** Page component to render */
    Page: React.ComponentType;
    /** Props to pass to the page */
    props: unknown;
  }>;
};

export type RegisterComponentMessage = {
  type: "REGISTER_COMPONENT";
  id: string;
  code: string;
};

export type RscBuildResult = string[];

export type ReactStreamPluginMeta = {
  timing: BuildTiming;
};

export type BuildTiming = {
  start: number;
  configResolved?: number;
  buildStart?: number;
  buildEnd?: number;
  renderStart?: number;
  renderEnd?: number;
  closeBundle?: number;
  render?: number;
  total?: number;
};

export type ResolvedBuildPages = {
  propsMap: Map<string, string>;
  pageMap: Map<string, string>;
  rootMap: Map<string, string>;
  htmlMap: Map<string, string>;
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
  urlMap: Map<
    string,
    { props?: string; page: string; root?: string; html?: string }
  >;
  errors: Error[];
};

// Add branded types for safety
export type ModuleId = string & { readonly __brand: unique symbol };
export type PagePath = string & { readonly __brand: unique symbol };

export interface DeserializedRegExp {
  source: string;
  flags: string;
  __isRegExp: boolean;
}

export type RegExpOpt = RegExp | string | DeserializedRegExp;
export type UrlOpt =
  | string
  | ((url: string) => string)
  | ((url: string) => Promise<string>);
export type PageName = "Page";
export type PropsName = "props";
export type HtmlName = "Html";
export type RootName = "Root";

export type HtmlProps<
  PageProps extends ViteReactServerComponentsPlugin["PageProps"] = DefaultInterface["PageProps"],
  InlineCSS extends ViteReactServerComponentsPlugin["InlineCSS"] = DefaultInterface["InlineCSS"],
  As extends ViteReactServerComponentsPlugin["As"] = DefaultInterface["As"],
  R = DefaultInterface["ReactType"]
> = {
  pageProps?: PageProps;
  Page: PageComponentType<PageProps, R>;
  route: string;
  url: string;
  projectRoot: string;
  moduleBase: string;
  moduleBaseURL: string;
  moduleBasePath: string;
  moduleRootPath: string;
  cssFiles: Map<string, CssContent<InlineCSS>>;
  manifest: Manifest;
  Root: RootComponentType<PageProps, As, InlineCSS, R>;
  globalCss: Map<string, CssContent<InlineCSS>>;
  as?: As;
};

export type PageAsset = {
  type: "css" | "js";
  path: string;
  parentUrl: string;
};

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

export type CssProps<InlineCSS extends InlineCssOpt = InlineCssOpt> = {
  cssFiles: Map<string, CssContent<InlineCSS>>;
};

export type HtmlRenderState = {
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
};

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
        stream: PassThrough;
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
export type LoaderContext = {
  format?: string;
  importAttributes?: Record<string, string>;
  conditions?: string[];
  env?: {
    targetEnvironment?: "client" | "server" | "browser";
  };
  url: string;
  userOptions?: SerializedUserOptions; // Add userOptions to the context
};
// Add type declaration for import.meta.cssModules
declare global {
  interface ImportMeta {
    cssModules?: Record<string, Record<string, string>>;
  }
}

export type VendorInteropConfig = {
  react: string; // e.g. "react"
  reactDOMServer: string; // e.g. "react-dom/server"
};

// Client Browser exports:
// - createFromFetch
// - createFromReadableStream
// - createServerReference
// - createTemporaryReferenceSet
// - encodeReply
// - registerServerReference
export type RSCClientBrowserInteropConfig = {
  createFromFetch: string;
  createFromReadableStream: string;
  createServerReference: string;
  createTemporaryReferenceSet: string;
  encodeReply: string;
  registerServerReference: string;
};

// Client Node exports:
// - createFromNodeStream
// - createServerReference
// - registerServerReference
export type RSCClientNodeInteropConfig = {
  createFromNodeStream: string;
  createServerReference: string;
  registerServerReference: string;
};

// Server Node exports:
// - createTemporaryReferenceSet
// - decodeAction
// - decodeFormState
// - decodeReply
// - decodeReplyFromBusboy
// - registerClientReference
// - registerServerReference
// - renderToPipeableStream
// - unstable_prerenderToNodeStream
export type RSCServerInteropConfig = {
  createTemporaryReferenceSet: string;
  decodeAction: string;
  decodeFormState: string;
  decodeReply: string;
  decodeReplyFromBusboy: string;
  registerClientReference: string;
  registerServerReference: string;
  renderToPipeableStream: string;
  unstable_prerenderToNodeStream: string;
};

export type RSCInteropConfig = {
  client: {
    browser: {
      production: string; // e.g. "react-server-dom-esm/client.browser"
      development: string; // e.g. "react-server-dom-esm/client.browser"
      test: string; // e.g. "react-server-dom-esm/client.browser"
      exports: RSCClientBrowserInteropConfig;
    };
    node: {
      production: string; // e.g. "react-server-dom-esm/client"
      development: string; // e.g. "react-server-dom-esm/client.node"
      test: string; // e.g. "react-server-dom-esm/client.node"
      exports: RSCClientNodeInteropConfig;
    };
  };
  server: {
    production: string; // e.g. "react-server-dom-esm/server"
    development: string; // e.g. "react-server-dom-esm/server.node"
    test: string; // e.g. "react-server-dom-esm/server.node"
    exports: RSCServerInteropConfig;
  };
};

export type FlightTarget =
  | "default"
  | "webpack"
  | "nextjs"
  | "react-server-dom-esm"
  | "react-server-dom-webpack"
  | "react-server-dom-parcel";

export type FlightConfig = {
  rsc: RSCInteropConfig;
  vendor: VendorInteropConfig;
};

// Import configuration from separate file

export type VitePluginMainFn = <
  Opt extends StreamPluginOptions<any> = StreamPluginOptions<any>
>(
  options: Opt
) => Plugin<Opt>[];

export type VitePluginFn = <
  Opt extends StreamPluginOptions = StreamPluginOptions
>(
  options: Opt
) => Plugin;

export type ReactStreamHandlerFn<
  Handles extends keyof CreateHandlerOptions,
  ReturnType
> = <
  Opt extends Omit<CreateHandlerOptions, Handles> &
    Partial<Pick<CreateHandlerOptions, Handles>> = Omit<
    CreateHandlerOptions,
    Handles
  > &
    Partial<Pick<CreateHandlerOptions, Handles>>
>(
  options: Opt
) => ReturnType;

export type ReactStreamResolvedOptionsFn<ReturnType = void> = (
  options: ResolvedUserOptions
) => ReturnType;

// re-exorts
export type { RenderMetrics, StreamMetrics };

// Generic React type that can be inferred from user's React import
export type InferReactType<R = React.ReactNode> = R;

// Simple interface override for custom React types
export type CustomInterface<R = React.ReactNode> = {
  ReactType: R;
  PageProps: any;
  As: any;
  PropsExportName: string;
  PageExportName: string;
  RootExportName: string;
  HtmlExportName: string;
  InlineCSS: undefined | boolean;
};

// Core interface types that can be overridden
declare global {
  interface ViteReactServerComponentsPlugin {
    PageProps: any;
    As: any;
    InlineCSS: undefined | boolean;
    ReactType: InferReactType;
    PropsExportName: string;
    PageExportName: string;
    RootExportName: string;
    HtmlExportName: string;
  }
}
// Default interface implementation
export interface DefaultInterface<
  T extends React.ComponentProps<any> = React.ComponentProps<any>,
  As extends React.JSXElementConstructor<any> | keyof React.JSX.IntrinsicElements = React.JSXElementConstructor<any> | keyof React.JSX.IntrinsicElements
> extends ViteReactServerComponentsPlugin {
  ReactType: InferReactType;
  PageProps: T;
  As: As;
  PropsExportName: PropsName;
  PageExportName: PageName;
  RootExportName: RootName;
  HtmlExportName: HtmlName;
}

// Legacy type aliases for backward compatibility
export type PagePropOpt = DefaultInterface["PageProps"];
export type AsOpt = DefaultInterface["As"];
export type InlineCssOpt = DefaultInterface["InlineCSS"];

// Configurable type system that uses the interface
export type PageComponentType<
  PageProps extends ViteReactServerComponentsPlugin["PageProps"] = DefaultInterface["PageProps"],
  R = DefaultInterface["ReactType"]
> = (props: PageProps) => R;

export type RootComponentType<
  PageProps extends ViteReactServerComponentsPlugin["PageProps"] = DefaultInterface["PageProps"],
  As extends ViteReactServerComponentsPlugin["As"] = DefaultInterface["As"],
  InlineCSS extends ViteReactServerComponentsPlugin["InlineCSS"] = DefaultInterface["InlineCSS"],
  R = DefaultInterface["ReactType"]
> = (props: RootProps<PageProps, InlineCSS, As, R>) => R;

export type RootProps<
  PageProps extends ViteReactServerComponentsPlugin["PageProps"] = DefaultInterface["PageProps"],
  InlineCSS extends ViteReactServerComponentsPlugin["InlineCSS"] = DefaultInterface["InlineCSS"],
  As extends ViteReactServerComponentsPlugin["As"] = DefaultInterface["As"],
  R = DefaultInterface["ReactType"]
> = {
  as: As;
  cssFiles?: Map<string, CssContent<InlineCSS>>;
  pageProps?: Omit<PageProps, "children">;
  Page: PageComponentType<Omit<PageProps, "children">, R>;
  id?: string;
};

/**
 * Boxed component type for the Html component
 */
export type HtmlComponentType<
  T extends ViteReactServerComponentsPlugin["PageProps"] = DefaultInterface["PageProps"],
  As extends ViteReactServerComponentsPlugin["As"] = DefaultInterface["As"],
  InlineCSS extends ViteReactServerComponentsPlugin["InlineCSS"] = DefaultInterface["InlineCSS"],
  R = DefaultInterface["ReactType"]
> = ((props: HtmlProps<T, InlineCSS, As, R>) => R);

// Interface-aware type aliases for better type safety
export type InterfaceAwareCssContent<Interface extends ViteReactServerComponentsPlugin> =
  CssContent<Interface["InlineCSS"]>;

export type InterfaceAwareRootOptions<Interface extends ViteReactServerComponentsPlugin> =
  RootOptions<Interface["InlineCSS"]>;

export type InterfaceAwareCssComponentType<
  Interface extends ViteReactServerComponentsPlugin,
  R = Interface["ReactType"]
> = CssComponentType<Interface["InlineCSS"], R>;

export type InterfaceAwareCssProps<Interface extends ViteReactServerComponentsPlugin> = CssProps<
  Interface["InlineCSS"]
>;

export type InterfaceAwareHandlerAssets<Interface extends ViteReactServerComponentsPlugin> =
  HandlerAssets<Interface["InlineCSS"]>;

export type InterfaceAwareCreateHandlerResult<Interface extends ViteReactServerComponentsPlugin> =
  CreateHandlerResult<Interface["InlineCSS"]>;
