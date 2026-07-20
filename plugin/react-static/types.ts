import type { PassThrough, Readable } from "node:stream";
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
import type { Logger, Manifest, PreviewServer, Rollup } from "vite";
// Vite 8 swaps Rollup→Rolldown; source bundle types from Vite's version-agnostic Rollup namespace.
type OutputBundle = Rollup.OutputBundle;

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
  | "projectRoot"
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
  staticManifest?: Manifest; // Static manifest for consistent module IDs
  batchSize?: number; // Concurrency for parallel rendering
};

export type RenderPagesFn = (
  routes: string[],
  handlerOptions: RenderPagesHandlerOptions,
  renderPage: RenderPageFn
) => RenderPagesReturn;

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
    rscStream: PassThrough; 
  },
  {
    abort: (reason?: unknown) => void;
    pipe: <Writable extends NodeJS.WritableStream>(
      destination: Writable
    ) => Writable;
    rscStream: PassThrough;
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
  | "htmlWorker"
  | "route"
  | "url"
  | "moduleRootPath"
  | "moduleBaseURL"
  | "moduleBasePath"
  | "clientPipeableStreamOptions"
  | "build"
  | "projectRoot"
  | "panicThreshold"
  | "verbose"
  | "signal"
  | "logger"
  | "htmlTimeout"
  | "onMetrics"
  | "rscStream"
> & {
  onError?: (error: Error, isPanic: boolean) => void;
};

export type RscToHtmlStreamFn = (options: RscToHtmlOptions) => {
  abort: (reason?: unknown) => void;
  pipe: <Writable extends NodeJS.WritableStream>(
    destination: Writable
  ) => Writable;
};
