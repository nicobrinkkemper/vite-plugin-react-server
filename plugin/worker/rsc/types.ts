import type { RenderToPipeableStreamOptions } from "react-dom/server";
import type {
  CreateHandlerOptions,
  PagePropOpt,
  StreamMetrics,
} from "../../types.js";
import type { 
  WorkerMessage, 
  ReactServerDomEsmOptions,
  ErrorMessage,
  ShellReadyMessage,
  AllReadyMessage,
  ShutdownCompleteMessage,
  HmrAcceptMessage,
  ReadyMessage,
  ServerActionMessage,
  ServerActionResponseMessage,
  CleanupCompleteMessage,
  ShutdownMessage
} from '../types.js';

// Combined options type that includes both React DOM and React Server DOM ESM options
export type SerializeableRenderToPipeableStreamOptions = Omit<RenderToPipeableStreamOptions, "onShellReady" | "onShellError" | "onAllReady" | "onError" | "onPostpone">;

export interface RscRenderState {
  id: string;
  outDir: string;
  moduleRootPath: string;
  moduleBaseURL: string;
  rscOutputPath: string;
  componentImport: string;
  propsImport: string;
  pipeableStreamOptions: ReactServerDomEsmOptions;
}

// RSC-specific messages
export type RscChunkOutputMessage = WorkerMessage & {
  type: "RSC_CHUNK";
  id: string;
  chunk: Uint8Array;
  sequence?: number;
};

export interface RscEndMessage extends WorkerMessage {
  type: "RSC_END";
  id: string;
}

export interface RscMetricsMessage extends WorkerMessage {
  type: "RSC_METRICS";
  id: string;
  metrics: StreamMetrics;
}

export interface CssFileMessage {
  type: "CSS_FILE";
  id: string;
  content: string;
  moduleClasses?: Record<string, string>;
  originalClasses?: Record<string, string>;
  usedClasses?: string[];
}

export type RscWorkerOutputMessage =
  | RscChunkOutputMessage
  | RscEndMessage
  | ShellReadyMessage
  | AllReadyMessage
  | ErrorMessage
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
  | HmrCleanupMessage

export type RscRenderMessage<T extends PagePropOpt = PagePropOpt> = WorkerMessage & {
  type: "RSC_RENDER";
} & Omit<
    CreateHandlerOptions,
    | "onEvent"
    | "onMetrics"
    | "loader"
    | "Html"
    | "CssCollector"
    | "logger"
    | "build"
    | "autoDiscover"
  > & {
    build: Omit<
      CreateHandlerOptions<T>['build'],
      "entryFileNames" | "chunkFileNames" | "assetFileNames" | "pages"
    > & {pages: string[]};
  };

export interface ChunkProcessedMessage extends WorkerMessage {
  type: "CHUNK_PROCESSED";
  success: boolean;
  sequence?: number;
}

export interface ClientComponentMessage extends WorkerMessage {
  type: "CLIENT_COMPONENT";
  url: string;
  source: string;
}

export interface InitializedReactLoaderMessage extends WorkerMessage {
  type: "INITIALIZED_REACT_LOADER";
  id: string;
}

export interface InitializedCssLoaderMessage extends WorkerMessage {
  type: "INITIALIZED_CSS_LOADER";
  id: string;
}

export interface ModuleRequestMessage extends WorkerMessage {
  type: "MODULE_REQUEST";
  id: string;
  path: string;
}

export interface InitializedRscWorkerLoaderMessage extends WorkerMessage {
  type: "INITIALIZED_RSC_WORKER_LOADER";
  id: string;
}

export interface InitializedEnvLoaderMessage extends WorkerMessage {
  type: "INITIALIZED_ENV_LOADER";
  id: string;
  env: Record<string, string>;
}

export interface HmrUpdateMessage extends WorkerMessage {
  type: "HMR_UPDATE";
  routes?: string[];
  timestamp?: number;
}

export interface HmrCleanupMessage extends WorkerMessage {
  type: "HMR_CLEANUP";
  routes?: string[];
  timestamp?: number;
}

export interface ServerModuleMessage extends WorkerMessage {
  type: "SERVER_MODULE";
  url: string;
  source: string;
}

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
  | ServerModuleMessage;
