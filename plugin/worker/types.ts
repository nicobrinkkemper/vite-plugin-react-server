import type { RenderToPipeableStreamOptions } from "react-dom/server";
import type {
  CreateHandlerOptions,
  CssContent,
  StreamMetrics,
} from "../types.js";

// Base message types
export interface WorkerMessage {
  type: string;
  id: string;
}

// React Server DOM ESM specific options
export interface ReactServerDomEsmOptions {
  identifierPrefix?: string;
  namespaceURI?: string;
  nonce?: string;
  bootstrapScriptContent?: string;
  bootstrapScripts?: string[];
  bootstrapModules?: string[];
  progressiveChunkSize?: number;
  temporaryReferences?: WeakMap<any, any>;
  moduleBaseURL?: string;
  importMap?: {
    imports?: Record<string, string>;
  };
  onError?: (error: Error, errorInfo?: any) => void;
  onPostpone?: (reason: string) => void;
}

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

// Common Messages
export interface ShutdownMessage extends WorkerMessage {
  type: "SHUTDOWN";
}

export interface ErrorMessage extends WorkerMessage {
  type: "ERROR";
  errorInfo?: any;
  error: string | {
    message: string;
    stack?: string |  undefined;
    name: string;
    cause?: any;
  };
  id: string;
}

export interface ChunkProcessedMessage extends WorkerMessage {
  type: "CHUNK_PROCESSED";
  success: boolean;
  sequence?: number;
}

export interface ChunkErrorMessage extends WorkerMessage {
  type: "CHUNK_ERROR";
  error: string;
  sequence?: number;
}

export type StreamHandlers =  {
  onError: (error: any, errorInfo?: any) => void;
  onData: (data: any) => void;
  onEnd: () => void;
  onMetrics: (metrics: any) => void;
  onHmrAccept: (routes: string[]) => void;
  onHmrUpdate: (routes: string[]) => void;
} 

// RSC Messages
export type RscRenderMessage = WorkerMessage & {
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
      CreateHandlerOptions["build"],
      "entryFileNames" | "chunkFileNames" | "assetFileNames" | "pages"
    > & {pages: string[]};
  };

export type RscChunkInputMessage = WorkerMessage &{
    type: "RSC_CHUNK";
    chunk: Buffer;
    sequence: number;
  };

export type RscChunkOutputMessage = WorkerMessage & {
  type: "RSC_CHUNK";
  id: string;
  chunk: Buffer;
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

export interface ShellReadyMessage extends WorkerMessage {
  type: "SHELL_READY";
}

export interface AllReadyMessage extends WorkerMessage {
  type: "ALL_READY";
  id: string;
}

export interface ShellErrorMessage extends WorkerMessage {
  type: "SHELL_ERROR";
  id: string;
  error: {
    message: string;
    stack?: string | undefined;
    name: string;
    cause?: any;
  };
}

export interface CssFileMessage {
  type: "CSS_FILE";
  id: string;
  content: string;
  moduleClasses?: Record<string, string>;
  originalClasses?: Record<string, string>;
  usedClasses?: string[];
}

// Extend the imported CssContent type
export type ExtendedCssContent = CssContent & {
  usedClasses?: string[];
};

// HTML Worker Messages
export type HtmlWorkerInputMessage =
  | RscChunkInputMessage
  | RscEndMessage
  | ShutdownMessage
  | {
      type: "CLEANUP";
      id: string;
    }
  | {
      type: "FORCE_CLEANUP";
      id: string;
    }
  | {
      type: "INITIALIZED_REACT_LOADER";
      id: string;
    }
  | {
      type: "INITIALIZED_CSS_LOADER";
      id: string;
    }
  | {
      type: "ACKNOWLEDGE";
      id: string;
      error?: string;
    }
  | {
      type: "HTML_COMPLETE";
      id: string;
      success: boolean;
      html?: string;
      metrics?: StreamMetrics;
    }
  | {
      type: "ROUTE_READY";
      id: string;
      moduleRootPath: string;
      moduleBaseURL: string;
      projectRoot: string;
      cssFiles:  Map<string, CssContent>;
      pipeableStreamOptions: Omit<ReactServerDomEsmOptions, "onError" | "onPostpone">;
    }

export type HtmlWorkerOutputMessage =
  | {
      type: "HTML_COMPLETE";
      id: string;
      success: boolean;
      html?: string;
      chunks?: string[];
      metrics?: StreamMetrics;
    }
  | ErrorMessage
  | ShellReadyMessage
  | ChunkProcessedMessage
  | ChunkErrorMessage
  | AllReadyMessage
  | ShellErrorMessage
  | { type: "HTML_CHUNK"; id: string; chunk: string; encoding: string }
  | { type: "CLEANUP_COMPLETE"; id: string }
  | { type: "SHUTDOWN_COMPLETE"; id: string }
  | HmrAcceptMessage
  | ReadyMessage;

export type InitializedReactLoaderMessage = {
  type: "INITIALIZED_REACT_LOADER";
  id: string;
  port: MessagePort;
}
export type InitializedCssLoaderMessage = {
  type: "INITIALIZED_CSS_LOADER";
  id: string;
  port: MessagePort;
}

export type InitializedRscWorkerLoaderMessage = {
  type: "INITIALIZED_RSC_WORKER_LOADER";
  id: string;
}

export type InitializedEnvLoaderMessage = {
  type: "INITIALIZED_ENV_LOADER";
  id: string;
  env: Record<string, string>;
}

// HMR Messages
export type HmrMessage = {
  id: string;
}

export type HmrUpdateMessage = HmrMessage & {
  type: "HMR_UPDATE";
  routes?: string[];
  timestamp?: number;
}

export type HmrCleanupMessage = HmrMessage & {
  type: "HMR_CLEANUP";
  routes?: string[];
  timestamp?: number;
}

export type HmrAcceptMessage = HmrMessage & {
  type: "HMR_ACCEPT";
  routes?: string[];
}

// RSC Worker Messages
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
  | { type: "HMR_CLEANUP"; id: string; routes?: string[] };

export interface CssFileRequestMessage extends WorkerMessage {
  type: "CSS_FILE_REQUEST";
  id: string;
  path: string;
}

export interface ClientComponentMessage extends WorkerMessage {
  type: "CLIENT_COMPONENT";
  url: string;
  source: string;
}

export interface ModuleRequestMessage extends WorkerMessage {
  type: "MODULE_REQUEST";
  id: string;
  path: string;
}

export interface ModuleResponseMessage extends WorkerMessage {
  type: "MODULE_RESPONSE";
  id: string;
  module: any;
}

export interface CssProcessedMessage extends WorkerMessage {
  type: "CSS_PROCESSED";
  id: string;
}

export type ReadyMessage = {
  type: "READY";
  env: string | undefined;
  pid: number;
}

export type RscWorkerOutputMessage =
  | RscChunkOutputMessage
  | RscEndMessage
  | ShellReadyMessage
  | AllReadyMessage
  | ErrorMessage
  | CssFileMessage
  | CssFileRequestMessage
  | ClientComponentMessage
  | ModuleRequestMessage
  | ModuleResponseMessage
  | CssProcessedMessage
  | RscMetricsMessage
  | HmrAcceptMessage
  | HmrUpdateMessage
  | ReadyMessage
  | { type: "SHUTDOWN_COMPLETE"; id: string };

export interface ClientReferenceMessage extends WorkerMessage {
  type: "CLIENT_REFERENCE";
  location: string;
  key: string;
  ref: unknown;
}

export interface ServerReferenceMessage extends WorkerMessage {
  type: "SERVER_REFERENCE";
  location: string;
  key: string;
  ref: unknown;
}

// HTML Messages
export interface WorkerRscChunkMessage extends WorkerMessage {
  type: "RSC_CHUNK";
  chunk: ArrayBufferLike;
  moduleRootPath: string;
  moduleBaseURL: string;
  pipeableStreamOptions: Omit<ReactServerDomEsmOptions, "onError" | "onPostpone">;
}

export type BuildWorkerMessage =
  | {
      type: "RUN_BUILD";
      id: string;
      options: {
        root: string;
        outDir: string;
        condition: "react-client" | "react-server";
      };
    }
  | {
      type: "BUILD_RESULT";
      id: string;
      result:
        | {
            type: "success";
            manifest: string | undefined;
          }
        | {
            type: "error";
            error: Error;
          };
    };

export interface TransformResult {
  code: string;
  map?: any;
  modules?: {
    [key: string]: {
      locals: Record<string, string>;
      exports: Record<string, string>;
    };
  };
}

export type LoaderMessage = {
  type: "LOADER_PORTS" | "REGISTER_LOADER";
  ports?: Record<string, MessagePort>;
  key?: string;
  port?: MessagePort;
  importMap?: string;
};
