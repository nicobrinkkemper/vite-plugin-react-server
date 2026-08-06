import type { Readable } from "node:stream";
import type {
  Worker,
  Serializable as WorkerSerializable,
} from "node:worker_threads";
import type React from "react";
// React types are imported from vendor system at runtime
// Vite 8 swaps Rollup→Rolldown; source bundle types from Vite's version-agnostic Rollup namespace.
type NormalizedOutputOptions = Rollup.NormalizedOutputOptions;
type OutputBundle = Rollup.OutputBundle;
type PreRenderedAsset = Rollup.PreRenderedAsset;
type PreRenderedChunk = Rollup.PreRenderedChunk;
import type { PassThrough, Transform } from "stream";
import type {
  AliasOptions,
  BuildOptions,
  Connect,
  Logger,
  Manifest,
  Plugin,
  ResolveOptions,
  Rollup,
  UserConfig,
  ViteDevServer,
} from "vite";
import type {
  serializeResolvedConfig,
  serializeResolvedUserConfig,
} from "./helpers/serializeUserOptions.js";
import type { AllowedDirectives, Program } from "react-server-loader/directives";
import type { RoutesOption } from "./router/fileRouter.js";
import type { RouteLayer } from "./router/scanRoutes.js";
import type { ResolvedLayoutLayer } from "./helpers/resolveLayoutChain.js";

/**
 * Structured-clone-safe stand-in for a `Request` sent to the RSC worker (a real
 * `Request` can't cross the worker boundary). Carries the absolute url, method
 * and headers — the worker rebuilds a `Request` for loader `ctx.request`.
 */
export type SerializedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
};
import type { LoaderConfig, TransformOptions } from "./loader/types.js";
import type {
  RenderMetrics,
  StreamMetrics,
  WorkerStartupMetrics,
  ModuleResolutionMetrics,
  EdgeBakeMetrics,
  InlineFlightMetrics,
  SsgRenderMetrics,
} from "./metrics/types.js";
import type { HtmlWorkerOutputMessage } from "./worker/html/types.js";
import type { RscChunkOutputMessage } from "./worker/rsc/types.js";
import type { WorkerMessage } from "./worker/types.js";
import type { Strategy } from "./orchestrator/createPluginOrchestrator.server.js";
import type { RenderToPipeableStreamOptions as ClientRenderToPipeableStreamOptions } from "react-dom/server";
import type { RenderToPipeableStreamOptions as ServerRenderToPipeableStreamOptions } from "react-server-dom-esm/server.node";

export type OnEvent<
  Interface extends ViteReactServerComponentsPlugin = ViteReactServerComponentsPlugin
> = (event: PluginEvent<Interface>) => void;

export type OnMetrics = (
  metrics:
    | RenderMetrics<"rsc-full" | "rsc-headless" | "html">
    | WorkerStartupMetrics
    | ModuleResolutionMetrics
    | EdgeBakeMetrics
    | InlineFlightMetrics
    | SsgRenderMetrics
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
      reason?: unknown;
      html: {
        abort: (reason?: unknown) => void;
        pipe: <Writable extends NodeJS.WritableStream>(
          destination: Writable
        ) => Writable;
      };
      rsc: {
        abort: (reason?: unknown) => void;
        pipe: <Writable extends NodeJS.WritableStream>(
          destination: Writable
        ) => Writable;
      };
      metrics: {
        rscFull: RenderMetrics & { type: "rsc-full" };
        rscHeadless: RenderMetrics & { type: "rsc-headless" };
        html: RenderMetrics & { type: "html" };
      };
    }
  | {
      type: "error";
      error: unknown;
      metrics: {
        rscFull: RenderMetrics & { type: "rsc-full" };
        rscHeadless: RenderMetrics & { type: "rsc-headless" };
        html: RenderMetrics & { type: "html" };
      };
    }
  | {
      type: "success";
      html: {
        abort: (reason?: unknown) => void;
        pipe: <Writable extends NodeJS.WritableStream>(
          destination: Writable
        ) => Writable;
      };
      rsc: {
        abort: (reason?: unknown) => void;
        pipe: <Writable extends NodeJS.WritableStream>(
          destination: Writable
        ) => Writable;
      };
      metrics: {
        rscFull: RenderMetrics & { type: "rsc-full" };
        rscHeadless: RenderMetrics & { type: "rsc-headless" };
        html: RenderMetrics & { type: "html" };
      };
    };

export type AutoDiscoveredFiles = ResolvedBuildPages & {
  workerPaths: Record<string, string>;
  serverEntry: Record<string, string> | null;
  clientEntry: Record<string, string>;
  clientInputs: Record<string, string>;
  staticInputs: Record<string, string>;
  serverInputs: Record<string, string>;
  serverActions: Record<string, string>;
};

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
  | "htmlTimeout"
  | "htmlWorkerStartupTimeout"
  | "rscWorkerStartupTimeout"
  | "fileWriteTimeout"
  | "workerShutdownTimeout";

export type BooleanKeys = "verbose";

export type NestedConfigKeys =
  | "build"
  | "autoDiscover"
  | "loader"
  | "css"
  | "pipeableStreamOptions"
  | "serverPipeableStreamOptions"
  | "clientPipeableStreamOptions";

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
  clientEntry: string;
  serverEntry: string;
  cssEntry: string;
  jsonEntry: string;
  htmlEntry: string;
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

export type PanicThreshold = "none" | "critical_errors" | "all_errors";

export type ResolvedUserOptions = {
  // Core required properties
  projectRoot: string;
  /**
   * The deploy's RSC flight flavor. "esm" (default) — today's behavior.
   * "webpack" — every artifact renders once, in that flavor: the esm SSG
   * pass is skipped and the static snapshots render through the baked pair
   * after the edge bake, so every surface (CDN snapshots, per-request
   * handler, browser client) carries ONE flavor and routes may be served
   * from either without cross-flavor decode failures. The dev server renders
   * webpack flight too — dev and prod parity, no caveats.
   */
  transport: "esm" | "webpack";
  moduleBase: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  /**
   * Whether the user set moduleBaseURL explicitly (vs the "/" default).
   * Decides whether Vite's config.base may fill the base in — an explicit
   * option outranks it, the default must not.
   */
  moduleBaseURLExplicit: boolean;
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
  htmlTimeout: number;
  htmlWorkerStartupTimeout: number;
  rscWorkerStartupTimeout: number;
  fileWriteTimeout: number;
  workerShutdownTimeout: number;
  panicThreshold: PanicThreshold;
  availableEnvironments?: string[];
  strategy?: Strategy;

  // Optional properties
  onEvent?: OnEvent<ViteReactServerComponentsPlugin> | undefined;
  props?: StreamPluginOptions["props"];
  clientEntry?: string;
  serverEntry?: string;
  /**
   * Packages whose internal `"use client"` per-file directives should be
   * honored by the RSC pipeline (Chakra UI, MUI, Mantine, react-aria, …).
   * When set, the matching node_modules paths bypass the transformer's
   * node_modules early-return, get added to `optimizeDeps.exclude` so esbuild
   * doesn't strip directives, and get added to `resolve.noExternal` so they
   * land in the server bundle where the transform actually runs.
   */
  clientPackages?: readonly string[];

  /**
   * Route patterns (`["/profile/$id", …]`) used to compute a loader's `params`
   * automatically at request time. Supplied by `fileRouter(...)` (spread into
   * the plugin config); empty when no file-based router is configured.
   */
  routePatterns?: readonly string[];

  /**
   * Per-url `route.tsx` layout-chain resolver (from the user's `layouts` option /
   * `fileRouter(...)`). Named distinctly from the resolved `layouts: RouteLayer[]`
   * array on {@link CreateHandlerOptions} so a `...userOptions` spread never
   * collides. Absent when no file-based router is configured.
   */
  layoutsResolver?: StreamPluginOptions["layouts"];
  /** Export a `route.tsx` uses for its layout component (default "Layout"). */
  layoutExportName?: string;

  // Required complex properties
  Page: StreamPluginOptions["Page"];
  Html: StreamPluginOptions["Html"]; // Unresolved: can be string, function
  Root: StreamPluginOptions["Root"]; // Unresolved: can be string, function
  normalizer: InputNormalizer;
  moduleID:
    | ((
        id: string,
        sourceContent?: string,
        isClientByDirective?: boolean
      ) => string)
    | undefined;
  onMetrics: OnMetrics | undefined;
  // different for client/server so can't be typed
  pipeableStreamOptions: any;
  // Separate pipeable stream options for different environments
  serverPipeableStreamOptions?: any; // For dev server and RSC worker
  clientPipeableStreamOptions?: any; // For HTML worker
  autoDiscover: Required<AutoDiscoverConfig>;
  // Everything resolved to a default EXCEPT logger, which stays optional: the
  // default is `undefined` (so defaults.tsx doesn't eagerly import vite's
  // createLogger and drag vite — a devDep — into prod/edge bundles).
  loader?:
    | (Required<Omit<LoaderConfig, "logger">> & { logger?: Logger })
    | undefined;
  // inlineFlight resolves the boolean alias away: `true` normalizes to "blob".
  build: Omit<Required<BuildConfig>, "edge" | "inlineFlight"> & {
    edge: ResolvedEdgeConfig;
    inlineFlight: false | "blob";
  };
  dev: Required<DevConfig>;
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
    chunks: number;
    path: string;
    fileName: string;
    baseDir: string;
    routePath: string;
  };
};

export type RouteErrorEvent = {
  type: "route.error";
  data: {
    route: string;
    error?: unknown | null;
    errorInfo?: {
      componentStack?: string | null;
      digest?: string | null;
    };
    reason?: unknown;
    isPanic?: boolean;
    panicThreshold?: PanicThreshold;
  };
};

export type RouteShellErrorEvent = {
  type: "route.shellError";
  data: {
    route: string;
    error: unknown;
  };
};

export type RoutePostponeEvent = {
  type: "route.postpone";
  data: {
    route: string;
    reason?: unknown;
  };
};

export type RouteShellReadyEvent = {
  type: "route.shellReady";
  data: {
    route: string;
  };
};

export type RouteAllReadyEvent = {
  type: "route.allReady";
  data: {
    route: string;
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

export type BuildWriteBundleEventStatic = {
  type: "build.writeBundle.static";
  data: {
    pages: string[];
    options: NormalizedOutputOptions;
    bundle: OutputBundle;
  };
};

export type BuildEventStaticSiteGenerationStart = {
  type: "build.ssg.start"; // SSG process starts (from client environment)
  data: {
    pages: string[];
    options: NormalizedOutputOptions;
    bundle: OutputBundle;
  };
};
export type BuildEventStaticSiteGenerationEnd = {
  type: "build.ssg.end"; // SSG process ends (from server environment)
  data: {
    pages: string[];
    options: NormalizedOutputOptions;
    bundle: OutputBundle;
  };
};

export type BuildWriteBundleEvent =
  | BuildWriteBundleEventServer
  | BuildWriteBundleEventClient
  | BuildEventStaticSiteGenerationStart
  | BuildEventStaticSiteGenerationEnd
  | BuildWriteBundleEventStatic;

export type PluginEvent<
  Interface extends ViteReactServerComponentsPlugin = ViteReactServerComponentsPlugin
> =
  | FileWriteEvent
  | FileWriteDoneEvent
  | RouteErrorEvent
  | RouteShellErrorEvent
  | RoutePostponeEvent
  | PropsLoadEvent
  | CssProcessEvent<Interface>
  | BuildStartEvent
  | BuildWriteBundleEvent
  | RouteShellReadyEvent
  | RouteAllReadyEvent;

export type PluginEventType = PluginEvent["type"];

export interface StreamPluginOptions<
  Interface extends ViteReactServerComponentsPlugin = DefaultInterface
> {
  projectRoot?: string; // defaults to process.cwd()
  /**
   * The deploy's RSC flight flavor. Default "esm". With "webpack" every
   * artifact renders once in the webpack flavor: the prerendered snapshots
   * render through the baked pair (requires build.edge with transport
   * "webpack", which this option defaults for you) and the dev server
   * serves webpack flight — one flavor across dev + CDN + per-request +
   * browser.
   */
  transport?: "esm" | "webpack";
  moduleBase: string; // defaults to 'src'
  moduleBasePath?: string; // defaults to ''
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
    isClientComponentByCode?: (code: string) => boolean;
    isClientComponentByName?: (moduleId: string) => boolean;
    moduleID?: (moduleId: string) => string;
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
        clientEntry: string;
        serverEntry: string;
        cssEntry: string;
        jsonEntry: string;
        htmlEntry: string;
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
  /**
   * File-based routing in one field. `routes: {}` scans `moduleBase` itself;
   * `{ dir: "app" }` scans a subfolder (`src/app` when `moduleBase: "src"`).
   * vprs derives `Page`, `props`, `routePatterns` and the prerender worklist
   * from the tree — no need to restate them. Also accepts a `fileRouter()`
   * result or a hand-rolled router table. Explicit `Page` / `props` /
   * `routePatterns` / `build.pages` still win over what the router derives.
   */
  routes?: RoutesOption;
  // Manual configuration (a lower-level alternative to `routes`)
  Page?: UrlOpt;
  props?: PropsOpt;
  /**
   * Route patterns (`["/", "/profile/$id"]`) for dynamic file-based routing —
   * spread from `fileRouter().routePatterns`. vprs derives a loader's `params`
   * from these at request time and bakes unenumerated dynamic routes into the
   * edge bundle. Omit for a fully static / hand-rolled `Page` router.
   */
  routePatterns?: readonly string[];
  /**
   * Per-url resolver for a route's root→leaf `route.tsx` layout chain — spread
   * from `fileRouter().layouts`. vprs folds the chain around the leaf page so the
   * nested tree streams as one flight. Omit for a flat / hand-rolled router.
   */
  layouts?: (url: string) => RouteLayer[];
  /** Export a `route.tsx` uses for its layout component (default "Layout"). */
  layoutExportName?: string;
  /**
   * Extra `node_modules` packages to treat as client (`"use client"`) packages
   * beyond what vprs auto-detects. Rarely needed.
   */
  clientPackages?: readonly string[];
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
    Page?: PageComponentType<Interface["PageProps"], Interface["ReactType"]>;
  };
  build?: BuildConfig;
  dev?: DevConfig;
  css?: RootOptions<Interface["InlineCSS"]>;
  // moduleBaseExceptions?: string[];
  pipeableStreamOptions?: any; // Legacy - kept for backward compatibility
  serverPipeableStreamOptions?: any; // For dev server and RSC worker
  clientPipeableStreamOptions?: any; // For HTML worker
  onMetrics?: OnMetrics;
  onEvent?: OnEvent<Interface>;
  normalizer?: InputNormalizer;
  moduleID?: (
    id: string,
    sourceContent?: string,
    isClientByDirective?: boolean
  ) => string;
  verbose?: boolean;
  rscTimeout?: number; // Timeout in milliseconds for RSC operations
  htmlTimeout?: number; // Timeout in milliseconds for HTML generation operations
  htmlWorkerStartupTimeout?: number; // Timeout in milliseconds for HTML worker startup
  rscWorkerStartupTimeout?: number; // Timeout in milliseconds for RSC worker startup
  fileWriteTimeout?: number; // Timeout in milliseconds for file write operations
  workerShutdownTimeout?: number; // Timeout in milliseconds for worker shutdown operations
  panicThreshold?: PanicThreshold;
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
  Opt extends Record<string, unknown> = ResolvedUserOptions,
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
  | "panicThreshold"
  | "projectRoot"
  | "rscTimeout"
  | "htmlTimeout"
  | "fileWriteTimeout"
  | "workerShutdownTimeout"
  | "rscWorkerPath"
  | "htmlWorkerPath"
  | "routePatterns"
  | "layoutExportName"
> & {
  id?: string;
  /**
   * The deploy's RSC flight flavor (see {@link ResolvedUserOptions.transport}).
   * The server flight-render sites read it to pick the renderer pair: esm
   * renders against `moduleBasePath`, webpack against a client manifest.
   * Optional so hand-built handler options stay valid; absent means "esm".
   */
  transport?: "esm" | "webpack";
  /**
   * Params parsed from the request url against the matched route pattern
   * (`/profile/123` → `{ id: "123" }`). Passed to a loader as
   * `props(url, { params, request })`. When absent, vprs derives it from
   * `routePatterns` + `url`; `{}` when nothing matches.
   */
  params?: Record<string, string>;
  /**
   * The in-flight request, when rendering happens on the request thread
   * (dev middleware). Undefined at static build and on the edge-flight path —
   * a loader must treat it as optional. In the RSC worker it is reconstructed
   * from {@link serializedRequest} (a full `Request` can't be structured-cloned
   * across the worker boundary).
   */
  request?: Request;
  /**
   * Cloneable stand-in for {@link request} sent to the RSC worker: the absolute
   * url + method + headers (enough for a loader to read cookies/headers to gate
   * an authenticated route). The worker rebuilds a `Request` from it. Absent at
   * static build / edge (no live request).
   */
  serializedRequest?: SerializedRequest;
  /** ID of headless stream to reuse for efficiency */
  reuseHeadlessStreamId?: string;
  /** Storage for headless stream reuse Map<id, { PageComponent: any, errored: boolean }> */
  headlessStreamElements?: Map<string, { PageComponent: any; errored: boolean }>;
  signal?: AbortSignal;
  logger: Logger;
  loader: BuildModuleLoader | GenericModuleLoader;
  pagePath: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  /**
   * Resolved root→leaf `route.tsx` layer paths for the matched route (from
   * `getRouteFiles`). The renderer loads + folds these around the leaf page.
   */
  layouts?: RouteLayer[];
  /**
   * Loaded + prop-resolved layout chain (from `resolvePageAndProps`), consumed by
   * `createElementWithReact` to fold the nested tree. Set on the render path only.
   */
  layoutChain?: ResolvedLayoutLayer[];
  pageProps?: Interface["PageProps"];
  PageComponent?:
    | PageComponentType<Interface["PageProps"], R>
    | typeof React.Fragment;
  RootComponent?:
    | RootComponentType<
        Interface["PageProps"],
        Interface["As"],
        Interface["InlineCSS"],
        R
      >
    | typeof React.Fragment;
  HtmlComponent?:
    | HtmlComponentType<
        Interface["PageProps"],
        Interface["As"],
        Interface["InlineCSS"],
        R
      >
    | typeof React.Fragment;
  route: string;
  url?: string;
  as?: Interface["As"];
  manifest: Manifest;
  staticManifest?: Manifest;
  serverManifest?: Manifest;
  clientManifest?: Manifest;
  worker?: Worker; // if available, is preferred worker for inverse streaming
  rscWorker?: Worker; // if rscWorker available, its used for createRscStream
  htmlWorker?: Worker; // if htmlWorker available, its used for createHtmlStream
  server?: ViteDevServer;
  importedCss?: Set<string>;
  cssFiles: Map<string, InterfaceAwareCssContent<Interface>>;
  globalCss: Map<string, InterfaceAwareCssContent<Interface>>;
  serverPipeableStreamOptions?: ServerRenderToPipeableStreamOptions;
  clientPipeableStreamOptions?: ClientRenderToPipeableStreamOptions;
  rscStream?: import("node:stream").Readable; // Optional RSC PassThrough stream to use instead of creating a new one
  htmlStream?: import("node:stream").Readable; // Optional HTML PassThrough stream to use instead of creating a new one
  metrics?: import("./metrics/types.js").StreamMetrics; // Optional metrics to use instead of creating new ones
  build: Pick<
    ResolvedUserOptions["build"],
    | "outDir"
    | "pages"
    | "server"
    | "static"
    | "client"
    | "rscOutputPath"
    | "htmlOutputPath"
    | "assetsDir"
    | "preserveModulesRoot"
  >;
  dev: Pick<ResolvedUserOptions["dev"], "useHtmlWorker" | "useRscWorker">;
  children?: React.ReactNode;
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
  useRscWorker?: boolean;
  useHtmlWorker?: boolean;
  /**
   * The prerender worklist. An array or a thunk, or a transform that receives
   * the derived page list so you can filter / extend / replace it without
   * restating routes (`pages: (routerPages) => [...routerPages, "/extra"]`).
   *
   * With a `routes` router the transform receives the router-derived list; with
   * no router it receives `["/"]`, since a routerless app's one route is the
   * index its `Page` serves. The transform means the same thing either way.
   *
   * The pre-existing nullary function form still works (it ignores the argument
   * = replace). Leaving `pages` unset prerenders nothing, router or not.
   */
  pages?:
    | string[]
    | ((routerPages: string[]) => Promise<string[]> | string[])
    | (() => Promise<string[]> | string[])
    | Promise<string[]>;
  assetsDir?: string;
  client?: string; // Output directory for client files
  server?: string; // Output directory for server files
  static?: string; // Output directory for static environment - works in both
  api?: string; // Output directory for API files
  outDir?: string;
  hash?:
    | string
    | {
        format?: "vite" | "hex" | "custom";
        length?: number;
        characters?: string;
        prefix?: string;
        suffix?: string;
      };
  preserveModulesRoot?: boolean;
  rscOutputPath?: string; // defaults: `index.rsc`
  htmlOutputPath?: string; // defaults: `index.html`
  entryFile?: (
    n: PreRenderedChunk,
    ssr: boolean,
    sourceContent?: string
  ) => string;
  chunkFile?: (
    n: PreRenderedChunk,
    ssr: boolean,
    sourceContent?: string
  ) => string;
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
  /**
   * Controls how pages are rendered during static generation.
   *
   * - `"parallel"` (default): Renders pages in concurrent batches for faster builds.
   *   Use `batchSize` to control concurrency (default: 8).
   * - `"sequential"`: Renders pages one at a time. Slower but uses less memory
   *   and produces deterministic output order.
   */
  renderMode?: "parallel" | "sequential";
  /**
   * Number of pages to render concurrently when `renderMode` is `"parallel"`.
   * Higher values use more memory but build faster.
   * @default 8
   */
  batchSize?: number;
  /**
   * How each prerendered route's flight payload is delivered with its HTML:
   * - `false`: not inlined — the client fetches `index.rsc` separately.
   * - `"blob"`: inline the whole payload into the route's `index.html` as one
   *   non-executable `<script id="vprs-flight">`, so the browser has the
   *   initial RSC payload at load and hydrates in place with no `index.rsc`
   *   round-trip or flash. Best for static/CDN targets: the file is buffered
   *   by construction, and the client reads a single script.
   * - `true`: boolean alias for `"blob"`.
   *
   * The plugin runs the inlining itself at the post-SSG point in BOTH build
   * modes (client-first and server-first), so the outcome is identical
   * regardless of `--conditions react-server`. Idempotent.
   * @default false
   */
  inlineFlight?: boolean | "blob";
  /**
   * Single-isolate edge build. Emits an additional baked rsc bundle to
   * `build.edge.outDir` (default `server-edge`): the server graph with React
   * INLINED, so it runs in one isolate with no worker_threads and no runtime
   * `--conditions` (drive it with `createEdgeHandler` / `renderRouteToDocument`).
   * The default worker-based build (`dist/server`) is untouched — purely
   * additive. Dev is unaffected.
   *
   * On by DEFAULT. Pass `false` to skip the artifact, or an {@link EdgeBuildConfig}
   * object to tune it (presence still means enabled):
   *   - `edge: false`            — disable
   *   - `edge: true` / omitted   — enable with defaults
   *   - `edge: { minify: false }` — enable, override a default
   *
   * @default true
   */
  edge?: boolean | EdgeBuildConfig;
};

export type EdgeBuildConfig = {
  /** Output dir for the baked edge bundle, under `build.outDir`. @default "server-edge" */
  outDir?: string;
  /**
   * Minify the baked edge bundle. The artifact bakes React in, so it is large;
   * edge runtimes (Cloudflare Workers, Deno Deploy, Vercel Edge) enforce bundle
   * size limits, so minification is on by default. Set `false` to emit readable
   * output for inspection/debugging. @default true
   */
  minify?: boolean;
  /**
   * Which RSC transport the baked bundle renders through.
   *
   * - `"esm"` (default): the vendored esm transport — client references
   *   resolve by `import(moduleBaseURL + id)` at request time. Runs on
   *   Node-compatible hosts.
   * - `"webpack"`: the vendored webpack transport — client references resolve
   *   through the baked client manifest (closed module map, `{id, chunks,
   *   name}` records). The flight payload encodes manifest ids, the
   *   in-process HTML decode reads the manifest, and the browser consumes the
   *   payload through the webpack flight client. This is the model a fully
   *   self-contained deployment builds on.
   *
   * The baked bundle exports which transport it was built with
   * (`flightTransport`), so the serving handlers self-configure — a bundle and
   * its handler cannot disagree.
   *
   * Do NOT mix transports across one deploy's routes: prerendered snapshots
   * are esm-encoded by default, so serving them next to webpack-encoded
   * dynamic routes breaks client-side navigation BETWEEN the two flavors (a
   * fetched .rsc of the other flavor cannot be decoded). Either serve every
   * route through the edge bundle and drop the snapshots from serving (the
   * prepare-vercel pattern), or set the TOP-LEVEL `transport: "webpack"` —
   * which defaults this field and renders the snapshots through the baked
   * pair, so both surfaces agree and any route may be served from either.
   * @default "esm" (or the top-level `transport` when set)
   */
  transport?: "esm" | "webpack";
};

/** Resolved edge config (after normalizing the `boolean | EdgeBuildConfig` form). */
export type ResolvedEdgeConfig = {
  enabled: boolean;
  outDir: string;
  minify: boolean;
  transport: "esm" | "webpack";
};

export type DevConfig = {
  useHtmlWorker?: boolean | undefined;
  useRscWorker?: boolean | undefined;
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
    {
      props?: string;
      page: string;
      root?: string;
      html?: string;
      /** Resolved `route.tsx` layer module paths (root→leaf), for nested layouts. */
      layouts?: RouteLayer[];
    }
  >;
  errors: unknown[];
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

/**
 * Like {@link UrlOpt}, but a props resolver may return `undefined` for a url
 * with no props source (e.g. `fileRouter`'s `props`, for a route that has no
 * sibling `props.ts`). vprs then falls back to a `props` export in the page
 * module, or the default `{ url }`. Widening only the props option keeps
 * `Page`/`Html`/`Root` required to resolve to a string.
 */
export type PropsOpt =
  | UrlOpt
  | ((url: string) => string | undefined)
  | ((url: string) => Promise<string | undefined>);
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
  Root: RootComponentType<PageProps, As, InlineCSS, R> | typeof React.Fragment;
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
  pipeableStreamOptions: any;
  streamState: StreamMetrics;
};

// Metadata type for tracking render progress

// Simplified result type for the entire render process
export type RenderPagesResult = {
  type: "error" | "success" | "skip";
  error?: unknown;
  route?: string;
  completedRoutes: Set<string>;
  failedRoutes: Map<string, unknown>;
  results: Map<string, RenderPageResult>;
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
    | { type: "error"; error: unknown }
    | { type: "skip" };

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
  options: Opt,
  strategy?: Strategy
) => Plugin<Opt>[];

export type VitePluginMainAsyncFn = <
  Opt extends StreamPluginOptions<any> = StreamPluginOptions<any>
>(
  options: Opt
) => Promise<Plugin<Opt>[]>;

export type VitePluginFn = <
  Opt extends StreamPluginOptions = StreamPluginOptions
>(
  options: Opt
) => Plugin;

// New types for component resolution strategies
export type ComponentResolutionStrategy =
  | "serializable-path" // Use a path that can be resolved by the worker
  | "direct-import" // Direct import in the worker context
  | "worker-internal" // Component is available internally in the worker
  | "external-reference"; // Reference to external component system

export type SerializableComponentPath = string & {
  readonly __brand: "SerializableComponentPath";
};

export type ComponentResolutionConfig = {
  strategy: ComponentResolutionStrategy;
  path?: SerializableComponentPath;
  moduleId?: string;
  exportName?: string;
};

// Enhanced environment-specific options
export type ClientEnvironmentOptions = {
  // Client environment cannot accept React components directly
  PageComponent?: never;
  RootComponent?: never;
  HtmlComponent?: never;

  // Client environment can accept component resolution configs
  pageComponentConfig?: ComponentResolutionConfig;
  rootComponentConfig?: ComponentResolutionConfig;
  htmlComponentConfig?: ComponentResolutionConfig;

  // Client environment can accept serializable paths
  pagePath?: string;
  rootPath?: string;
  htmlPath?: string;
};

export type ServerEnvironmentOptions = {
  // Server environment can accept React components directly
  PageComponent?: CreateHandlerOptions["PageComponent"];
  RootComponent?: CreateHandlerOptions["RootComponent"];
  HtmlComponent?: CreateHandlerOptions["HtmlComponent"];

  // Server environment can also accept component resolution configs
  pageComponentConfig?: ComponentResolutionConfig;
  rootComponentConfig?: ComponentResolutionConfig;
  htmlComponentConfig?: ComponentResolutionConfig;

  // Server environment can accept serializable paths
  pagePath?: string;
  rootPath?: string;
  htmlPath?: string;
};

// Enhanced ReactStreamCommonOptions with proper environment separation
export type ReactStreamCommonOptions<
  Env extends "client" | "server" = "client" | "server",
  Handles extends keyof CreateHandlerOptions = never
> = Omit<
  CreateHandlerOptions,
  | Handles
  | "PageComponent"
  | "RootComponent"
  | "HtmlComponent"
  | "pagePath"
  | "rootPath"
  | "htmlPath"
> &
  Partial<Pick<CreateHandlerOptions, Handles>> &
  (Env extends "client" ? ClientEnvironmentOptions : ServerEnvironmentOptions);

// Enhanced handler function types with proper environment constraints
export type ReactStreamHandlerFn<
  Env extends "client" | "server",
  Handles extends keyof CreateHandlerOptions,
  ReturnType
> = (options: ReactStreamCommonOptions<Env, Handles>) => ReturnType;

// Type for RSC worker message that enforces serializable constraints
export type RscWorkerMessage = {
  // Only serializable data can be passed to workers
  pageComponentConfig?: ComponentResolutionConfig;
  rootComponentConfig?: ComponentResolutionConfig;
  htmlComponentConfig?: ComponentResolutionConfig;

  // Serializable paths
  pagePath?: string;
  rootPath?: string;
  htmlPath?: string;

  // Other serializable options
  route: string;
  url: string;
  pageProps?: Record<string, unknown>;
  cssFiles: Array<[string, unknown]>; // Serialized Map
  manifest: Record<string, unknown>;

  // Never allow direct component references
  PageComponent?: never;
  RootComponent?: never;
  HtmlComponent?: never;
};

// Enhanced RscRenderOpt with proper serialization constraints
export type RscRenderOpt = WorkerMessage & {
  type: "INIT";
} & {
  dataPort: MessagePort;
  controlPort: MessagePort;
  options: Omit<
    CreateHandlerOptions<ResolvedUserOptions>,
    // Omit non-serializable fields
    | "onEvent"
    | "onMetrics"
    | "loader"
    | "build"
    | "autoDiscover"
    | "normalizer"
    | "moduleID"
    | "PageComponent"
    | "RootComponent"
    | "HtmlComponent"
    | "url"
    | "logger"
    | "cssFiles" // Replace with serializable version
  > & {
    url?: string;
    // Component resolution configs instead of direct components
    pageComponentConfig?: ComponentResolutionConfig;
    rootComponentConfig?: ComponentResolutionConfig;
    htmlComponentConfig?: ComponentResolutionConfig;

    // Serializable CSS files
    cssFiles: Array<[string, unknown]>;

    build: Omit<
      CreateHandlerOptions<ResolvedUserOptions>["build"],
      "entryFileNames" | "chunkFileNames" | "assetFileNames" | "pages"
    > & { pages: string[] };
  };
};

// Type for plugin component references
export type PluginComponentReference = {
  type: "plugin-component";
  componentName: "Html" | "Root" | "Css";
  modulePath: string;
  exportName: string;
};

// Enhanced component resolution types
export type ResolvedComponent<T = unknown> =
  | {
      type: "success";
      component: T;
      source: "direct" | "resolved" | "plugin" | "worker-internal";
    }
  | {
      type: "error";
      error: Error;
      source: "direct" | "resolved" | "plugin" | "worker-internal";
    };

// Type for worker component loader
export type WorkerComponentLoader = {
  loadComponent: (
    config: ComponentResolutionConfig
  ) => Promise<ResolvedComponent>;
  loadPluginComponent: (
    reference: PluginComponentReference
  ) => Promise<ResolvedComponent>;
  hasInternalComponent: (componentName: string) => boolean;
};

// re-exorts
export type {
  RenderMetrics,
  StreamMetrics,
  WorkerStartupMetrics,
  ModuleResolutionMetrics,
};

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
  As extends
    | React.JSXElementConstructor<any>
    | keyof React.JSX.IntrinsicElements =
    | React.JSXElementConstructor<any>
    | keyof React.JSX.IntrinsicElements
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
> = (props: HtmlProps<T, InlineCSS, As, R>) => R;

// Interface-aware type aliases for better type safety
export type InterfaceAwareCssContent<
  Interface extends ViteReactServerComponentsPlugin
> = CssContent<Interface["InlineCSS"]>;

export type InterfaceAwareRootOptions<
  Interface extends ViteReactServerComponentsPlugin
> = RootOptions<Interface["InlineCSS"]>;

export type InterfaceAwareCssComponentType<
  Interface extends ViteReactServerComponentsPlugin,
  R = Interface["ReactType"]
> = CssComponentType<Interface["InlineCSS"], R>;

export type InterfaceAwareCssProps<
  Interface extends ViteReactServerComponentsPlugin
> = CssProps<Interface["InlineCSS"]>;

export type InterfaceAwareHandlerAssets<
  Interface extends ViteReactServerComponentsPlugin
> = HandlerAssets<Interface["InlineCSS"]>;

export type InterfaceAwareCreateHandlerResult<
  Interface extends ViteReactServerComponentsPlugin
> = CreateHandlerResult<Interface["InlineCSS"]>;

export type VitePluginReactClientFn = <
  Opt extends StreamPluginOptions = StreamPluginOptions
>(
  options: Opt
) => Plugin[];

export type VitePluginReactServerFn = <
  Opt extends StreamPluginOptions = StreamPluginOptions
>(
  options: Opt
) => Plugin[];
