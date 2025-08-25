import type { Logger } from "vite";
import type {
  CreateHandlerOptions,
  CssContent,
  RenderMetrics,
  ResolvedUserOptions,
  SerializableRecord,
} from "../../types.js";
import type {
  WorkerMessage,
  ErrorMessage,
  ShellReadyMessage,
  AllReadyMessage,
  ShutdownCompleteMessage,
  HmrAcceptMessage,
  ReadyMessage,
  ServerActionMessage,
  ServerActionResponseMessage,
  CleanupCompleteMessage,
  ShutdownMessage,
  AbortMessage,
  StreamHandlers,
} from "../types.js";
import type { PassThrough } from "node:stream";

export type HandleRscRenderOptions = {
  id: string;
  route: string;
  url: string;
  verbose?: boolean;
  htmlPath?: string;
  HtmlComponent?: any;
  rscTimeout?: number;
  logger?: Logger;
  stream?: PassThrough;
  moduleBasePath: string;
  moduleBaseURL: string;
  moduleRootPath: string;
  [key: string]: any; // Allow other properties
};

export type HandleRscRenderFn = <Opt extends HandleRscRenderOptions = HandleRscRenderOptions>(
  options: Opt,
  handlers: StreamHandlers<"server">,
  overrideStream?: PassThrough
) => void;


// Combined options type that includes both React DOM and React Server DOM ESM options
export type SerializeableRenderToPipeableStreamOptions = SerializableRecord;

export type RscRenderState = {
  id: string;
  outDir: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  rscOutputPath: string;
  componentImport: string;
  propsImport: string;
  serverPipeableStreamOptions: SerializableRecord;
};

export type RscRenderStartMessage = {
  type: "RSC_RENDER_START";
  id: string;
};

// RSC-specific messages
export type RscChunkOutputMessage = WorkerMessage & {
  type: "RSC_CHUNK";
  id: string;
  chunk: Uint8Array;
  sequence?: number;
};

export type RscEndMessage = {
  type: "RSC_END";
  id: string;
} & WorkerMessage;

export type RscMetricsMessage = {
  type: "RSC_METRICS";
  id: string;
  metrics: RenderMetrics & { type: "rsc-full" | "rsc-headless" };
} & WorkerMessage;

export type CssFileMessage = {
  type: "CSS_FILE";
  id: string;
  content: string;
  moduleClasses?: Record<string, string>;
  originalClasses?: Record<string, string>;
  usedClasses?: string[];
};

export type ShellErrorMessage = {
  type: "SHELL_ERROR";
  id: string;
  error: unknown
} & WorkerMessage;

export type RscWorkerOutputMessage =
  | RscRenderStartMessage
  | RscChunkOutputMessage
  | RscEndMessage
  | ShellReadyMessage
  | AllReadyMessage
  | ErrorMessage
  | ShellErrorMessage
  | CssFileMessage
  | RscMetricsMessage
  | HmrAcceptMessage
  | ReadyMessage
  | ServerActionMessage
  | ServerActionResponseMessage
  | ShutdownCompleteMessage
  | CleanupCompleteMessage
  | ComponentsResolvedMessage
  | ServerModuleMessage
  | HmrUpdateMessage
  | HmrCleanupMessage;

export type RscRenderOpt = WorkerMessage & {
  type: "INIT";
  id: string;
  dataPort: MessagePort;
  controlPort: MessagePort;
  options: Omit<
    CreateHandlerOptions<ResolvedUserOptions>,
    // omitted because they are not needed for the worker
    | "onEvent"
    | "onMetrics"
    | "loader"
    | "build"
    | "autoDiscover"
    | "normalizer"
    | "moduleID"
    | "url"
    | "logger"
  > & {
    cssFiles?: Map<string, CssContent>;
    globalCss?: Map<string, CssContent>;
    url?: string;
    build: Omit<
      CreateHandlerOptions<ResolvedUserOptions>["build"],
      "entryFileNames" | "chunkFileNames" | "assetFileNames" | "pages"
    > & { pages: string[] };
    // Support for pre-resolved components (client environment)
    PageComponent?: any;
    pageProps?: any;
    RootComponent?: any;
    HtmlComponent?: any;
  };
};

export type RscRenderMessage<Opt extends RscRenderOpt = RscRenderOpt> = Opt;

export type ChunkProcessedMessage = {
  type: "CHUNK_PROCESSED";
  success: boolean;
  sequence?: number;
} & WorkerMessage;

export type ClientComponentMessage = {
  type: "CLIENT_COMPONENT";
  url: string;
  source: string;
} & WorkerMessage;

export type InitializedReactLoaderMessage = {
  type: "INITIALIZED_REACT_LOADER";
  id: string;
} & WorkerMessage;

export type InitializedCssLoaderMessage = {
  type: "INITIALIZED_CSS_LOADER";
  id: string;
} & WorkerMessage;

export type ModuleRequestMessage = {
  type: "MODULE_REQUEST";
  id: string;
  path: string;
} & WorkerMessage;

export type InitializedRscWorkerLoaderMessage = {
  type: "INITIALIZED_RSC_WORKER_LOADER";
  id: string;
} & WorkerMessage;

export type InitializedEnvLoaderMessage = {
  type: "INITIALIZED_ENV_LOADER";
  id: string;
  env: Record<string, string>;
} & WorkerMessage;

export type HmrUpdateMessage = {
  type: "HMR_UPDATE";
  routes?: string[];
  timestamp?: number;
} & WorkerMessage;

export type HmrCleanupMessage = {
  type: "HMR_CLEANUP";
  routes?: string[];
  timestamp?: number;
} & WorkerMessage;

export type ServerModuleMessage = {
  type: "SERVER_MODULE";
  url: string;
  source: string;
} & WorkerMessage;



export type ResolveComponentsMessage = {
  type: "RESOLVE_COMPONENTS";
  id: string;
  route: string;
  streamType: "rsc";
  rscVariant: "rsc-headless" | "rsc-full";
  pagePath?: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName?: string;
  propsExportName?: string;
  rootExportName?: string;
  htmlExportName?: string;
} & WorkerMessage;

export type ComponentsResolvedMessage = {
  type: "COMPONENTS_RESOLVED";
  id: string;
  route: string;
  PageComponent?: any;
  pageProps?: any;
  RootComponent?: any;
  HtmlComponent?: any;
  resolutionTime: number;
} & WorkerMessage;

export type RscWorkerInputMessage =
  | RscRenderMessage
  | CssFileMessage
  | ShutdownMessage
  | ChunkProcessedMessage
  | ClientComponentMessage
  | InitializedReactLoaderMessage
  | InitializedCssLoaderMessage
  | ModuleRequestMessage
  | InitializedRscWorkerLoaderMessage
  | InitializedEnvLoaderMessage
  | HmrUpdateMessage
  | HmrAcceptMessage
  | HmrCleanupMessage
  | CleanupCompleteMessage
  | ServerActionMessage
  | ServerActionResponseMessage
  | ServerModuleMessage
  | AbortMessage
  | ResolveComponentsMessage;
