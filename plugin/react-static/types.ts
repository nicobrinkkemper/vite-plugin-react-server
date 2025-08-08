import type { Readable, Transform } from "node:stream";
import type {
  AutoDiscoveredFiles,
  BuildModuleLoader,
  CreateHandlerOptions,
  CssContent,
  RenderPageResult,
  RenderPagesResult,
  ResolvedUserOptions,
  StreamMetrics,
} from "../types.js";
import type { Logger, Manifest, PreviewServer } from "vite";
import type { OutputBundle } from "rollup";

export type FileWriterOptions = Pick<
  CreateHandlerOptions,
  | "verbose"
  | "panicThreshold"
  | "route"
  | "build"
  | "signal"
  | "worker"
  | "onEvent"
  | "logger"
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
  temporaryReferences: WeakMap<any, any>,
  logger?: Logger
) => BuildModuleLoader;

export type CollectRscContentReturn = {
  pipe: <Writable extends NodeJS.WritableStream>(
    destination: Writable
  ) => Writable;
  abort: (reason?: unknown) => void;
  metrics: StreamMetrics;
  bufferedContent?: Buffer[];
};

export type CollectRscContentFn = (
  rsc: {
    abort: (reason?: unknown) => void;
    pipe: <Writable extends NodeJS.WritableStream>(
      destination: Writable
    ) => Writable;
  },
  handlerOptions: CreateHandlerOptions
) => Promise<CollectRscContentReturn>;

export type CollectHtmlWorkerContentReturn =
  | {
      type: "success";
      stream: {
        abort: (reason?: unknown) => void;
        pipe: <Writable extends NodeJS.WritableStream>(
          destination: Writable
        ) => Writable;
      };
      metrics: StreamMetrics;
    }
  | { type: "error"; error: Error | null; stream?: never; metrics?: never };

export type CollectHtmlWorkerContentGenerator = AsyncGenerator<
  | { type: "progress"; message: string; metrics?: Partial<StreamMetrics> }
  | { type: "chunk"; chunk: Buffer }
  | CollectHtmlWorkerContentReturn,
  CollectHtmlWorkerContentReturn,
  unknown
>;

export type CollectHtmlContentFn = <
  Opt extends CreateHandlerOptions = CreateHandlerOptions
>(
  rsc: {
    abort: (reason?: unknown) => void;
    pipe: <Writable extends NodeJS.WritableStream>(
      destination: Writable
    ) => Writable;
  },
  handlerOptions: Opt
) => Promise<{
  pipe: <Writable extends NodeJS.WritableStream>(
    destination: Writable
  ) => Writable;
  abort: (reason?: unknown) => void;
  metrics: StreamMetrics;
}>;

export type ConfigurePreviewServerProps<Opt extends ResolvedUserOptions> = {
  server: PreviewServer;
  userOptions: Opt;
};

export type ConfigurePreviewServerFn = <Opt extends ResolvedUserOptions>(
  props: ConfigurePreviewServerProps<Opt>
) => void;

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
  serverPipeableStreamOptions: any;
};

export type RenderPagesFn = (
  routes: string[],
  renderPage: RenderPageFn
) => (handlerOptions: RenderPagesHandlerOptions) => RenderPagesReturn;

export type RenderPageReturn = AsyncGenerator<RenderPageResult, void, unknown>;

export type RenderPageFn = (
  options: CreateHandlerOptions
) => RenderPageReturn;

// The return type for the function
export type RenderStreamsReturn = [
  {
    abort: (reason?: unknown) => void;
    pipe: <Writable extends NodeJS.WritableStream>(
      destination: Writable
    ) => Writable;
  },
  {
    abort: (reason?: unknown) => void;
    pipe: <Writable extends NodeJS.WritableStream>(
      destination: Writable
    ) => Writable;
  }
];

// The function signature type
export type RenderStreamsFn = <
  Opt extends CreateHandlerOptions = CreateHandlerOptions
>(
  handler: Opt
) => RenderStreamsReturn;

export type RscToHtmlOptions = Pick<
  CreateHandlerOptions,
  | "id"
  | "worker"
  | "route"
  | "url"
  | "moduleRootPath"
  | "moduleBaseURL"
  | "moduleBasePath"
  | "serverPipeableStreamOptions"
  | "clientPipeableStreamOptions"
  | "build"
  | "cssFiles"
  | "projectRoot"
  | "panicThreshold"
  | "verbose"
  | "cssFiles"
  | "globalCss"
  | "signal"
  | "logger"
  | "htmlTimeout"
>;

export type RscToHtmlStreamFn = (options: RscToHtmlOptions) => Transform;
