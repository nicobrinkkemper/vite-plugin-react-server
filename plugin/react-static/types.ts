import type { PassThrough, Readable, Transform } from "node:stream";
import type {
  AutoDiscoveredFiles,
  BuildModuleLoader,
  CreateHandlerOptions,
  CssContent,
  ReactStreamHandlerFn,
  RenderPageResult,
  RenderPagesResult,
  ResolvedUserOptions,
  StreamMetrics,
} from "../types.js";
import type { Logger, Manifest, PreviewServer } from "vite";
import type { OutputBundle } from "rollup";

export type FileWriterOptions = Pick<
  CreateHandlerOptions,
  "onEvent" | "route" | "build" | "verbose" | "logger" | "panicThreshold"
>;

export type FileWriterFn = (
  stream: Readable,
  fileType: "html" | "rsc",
  options: FileWriterOptions,
  signal?: AbortSignal
) => Promise<void>;

export type CreateBuildLoaderFn = (
  props: {
    userOptions: ResolvedUserOptions;
    serverManifest: Manifest;
    staticManifest: Manifest;
  },
  bundle: OutputBundle,
  logger?: Logger
) => BuildModuleLoader;

export type CollectRscContentReturn = {
  stream: PassThrough;
  metrics: StreamMetrics;
  controller: { abort: (reason: unknown) => void; destroy: () => void };
};

export type CollectRscContentFn = (
  rsc: {
    stream: PassThrough;
    controller: { abort: (reason: unknown) => void; destroy: () => void };
  },
  handlerOptions: CreateHandlerOptions
) => Promise<CollectRscContentReturn>;

export type CollectHtmlWorkerContentReturn =
  | { type: "success"; stream: PassThrough; metrics: StreamMetrics }
  | { type: "error"; error: Error | null; stream?: never; metrics?: never };

export type CollectHtmlWorkerContentGenerator = AsyncGenerator<
  | { type: "progress"; message: string; metrics?: Partial<StreamMetrics> }
  | { type: "chunk"; chunk: Buffer }
  | CollectHtmlWorkerContentReturn,
  CollectHtmlWorkerContentReturn,
  unknown
>;

export type CollectHtmlWorkerContentFn = <
  Opt extends CreateHandlerOptions = CreateHandlerOptions
>(
  rsc: {
    stream: PassThrough;
    controller: { abort: (reason: unknown) => void; destroy: () => void };
  },
  handlerOptions: Opt
) => CollectHtmlWorkerContentGenerator;

export type ConfigurePreviewServerProps<Opt extends ResolvedUserOptions> = {
  server: PreviewServer;
  userOptions: Opt;
};

export type ConfigurePreviewServerFn = <Opt extends ResolvedUserOptions>(
  props: ConfigurePreviewServerProps<Opt>
) => Promise<void>;

export type RenderPagesReturn = AsyncGenerator<
  RenderPagesResult,
  RenderPagesResult,
  unknown
>;

export type RenderPagesHandlerOptions = Omit<
  CreateHandlerOptions,
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
  | "url"
> & {
  autoDiscoveredFiles: AutoDiscoveredFiles;
  cssFilesByPage: Map<string, Map<string, CssContent>>;
};

export type RenderPagesFn = (
  routes: string[]
) => (handlerOptions: RenderPagesHandlerOptions) => RenderPagesReturn;

export type RenderPageReturn = AsyncGenerator<RenderPageResult, void, unknown>;

export type RenderPageFn = ReactStreamHandlerFn<
  | "RootComponent"
  | "HtmlComponent"
  | "PageComponent"
  | "pageProps"
  | "url"
  | "onEvent",
  RenderPageReturn
>;

// The return type for the function
export type RenderStreamsReturn = [
  (
    | {
        type: "success";
        stream: PassThrough;
        controller: { abort: (reason: unknown) => void; destroy: () => void };
        error?: never;
      }
    | { type: "error"; error: unknown; stream?: never; controller?: never }
  ),
  (
    | {
        type: "success";
        stream: PassThrough;
        controller: { abort: (reason: unknown) => void; destroy: () => void };
        error?: never;
      }
    | { type: "error"; error: unknown; stream?: never; controller?: never }
  )
];

// The function signature type
export type RenderStreamsFn = ReactStreamHandlerFn<never, RenderStreamsReturn>;

export type RscToHtmlOptions = Pick<
  CreateHandlerOptions,
  | "worker"
  | "route"
  | "url"
  | "moduleRootPath"
  | "moduleBaseURL"
  | "moduleBasePath"
  | "pipeableStreamOptions"
  | "build"
  | "cssFiles"
  | "projectRoot"
  | "panicThreshold"
  | "verbose"
  | "cssFiles"
  | "globalCss"
  | "signal"
>;

export type RscToHtmlStreamFn = (options: RscToHtmlOptions) => Transform;
