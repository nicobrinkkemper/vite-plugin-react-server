import type { PassThrough, Readable } from "node:stream";
import type {
  BuildModuleLoader,
  CreateHandlerOptions,
  ResolvedUserConfig,
  ResolvedUserOptions,
  StreamMetrics,
} from "../types.js";
import type { Manifest, PreviewServer } from "vite";
import type { OutputBundle } from "rollup";


export type FileWriterOptions = Pick<
  CreateHandlerOptions,
  "onEvent" | "route" | "build" | "verbose" | "logger"
>;

export type FileWriterFn = (
  stream: Readable,
  fileType: "html" | "rsc",
  options: FileWriterOptions,
  signal?: AbortSignal
) => Promise<void>;

export type CreateBuildLoaderFn = (
  props: {
    userConfig: ResolvedUserConfig;
    userOptions: ResolvedUserOptions;
    serverManifest: Manifest;
    clientManifest: Manifest;
    staticManifest: Manifest;
  },
  bundle: OutputBundle
) => BuildModuleLoader;

export type CollectRscContentReturn = {
  stream: PassThrough;
  metrics: StreamMetrics;
  controller: { abort: () => void; destroy: () => void };
};

export type CollectRscContentFn = (
  rsc: {
    stream: PassThrough;
    controller: { abort: () => void; destroy: () => void };
  },
  handlerOptions: CreateHandlerOptions
) => Promise<CollectRscContentReturn>;

export type CollectHtmlWorkerContentReturn = {
  stream: PassThrough;
  metrics: StreamMetrics;
};

export type CollectHtmlWorkerContentFn = <
  Opt extends CreateHandlerOptions = CreateHandlerOptions
>(
  rsc: {
    stream: PassThrough;
    controller: { abort: (reason?: any) => void; destroy: () => void };
  },
  handlerOptions: Opt
) => Promise<CollectHtmlWorkerContentReturn>;

export type ConfigurePreviewServerProps<Opt extends ResolvedUserOptions> = {
  server: PreviewServer;
  userOptions: Opt;
};

export type ConfigurePreviewServerFn = <Opt extends ResolvedUserOptions>(
  props: ConfigurePreviewServerProps<Opt>
) => Promise<void>;
