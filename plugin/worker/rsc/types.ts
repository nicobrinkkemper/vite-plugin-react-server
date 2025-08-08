import type { Logger } from "vite";
import type {
  CreateHandlerOptions,
  ResolvedUserOptions,
  SerializableRecord,
  StreamMetrics,
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

export type HandleRscRenderOptions = RscRenderOpt & {logger?: Logger; stream?: PassThrough};

export type HandleRscRenderFn = <Opt extends HandleRscRenderOptions = HandleRscRenderOptions>(
  options: Opt,
  handlers: StreamHandlers,
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
  metrics: StreamMetrics;
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
  | ServerModuleMessage
  | HmrUpdateMessage
  | HmrCleanupMessage;

export type RscRenderOpt = WorkerMessage & {
  type: "RSC_RENDER";
} & Omit<
    CreateHandlerOptions<ResolvedUserOptions>,
    // omitted because they are not needed for the worker
    | "onEvent"
    | "onMetrics"
    | "loader"
    | "build"
    | "autoDiscover"
    | "normalizer"
    | "moduleID"
    | "PageComponent"
    | "url"
    | "logger"
  > & {
    url?: string;
    build: Omit<
      CreateHandlerOptions<ResolvedUserOptions>["build"],
      "entryFileNames" | "chunkFileNames" | "assetFileNames" | "pages"
    > & { pages: string[] };
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
  | AbortMessage;
