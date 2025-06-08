import type { CssContent, StreamMetrics } from "../types.js";

// Base message types
export type WorkerMessage = {
  type: string;
  id: string;
}

// Common message types used across workers
export type ErrorMessage = {
  type: "ERROR";
  errorInfo?: {
    componentStack?: string | null;
    digest?: string | null;
  };
  error:
    | string
    | {
        message: string;
        stack?: string | undefined;
        name: string;
        cause?: unknown;
      };
  id: string;
} & WorkerMessage

export type ReadyMessage = {
  type: "READY";
  id: string;
  env?: string;
  pid?: number;
}

export type ShutdownMessage = {
  type: "SHUTDOWN";
} & WorkerMessage

export type ShutdownCompleteMessage = {
  type: "SHUTDOWN_COMPLETE";
  id: string;
}

export type ShellReadyMessage = {
  type: "SHELL_READY";
} & WorkerMessage

export type AllReadyMessage = {
  type: "ALL_READY";
  id: string;
} & WorkerMessage

export type ShellErrorMessage = {
  type: "SHELL_ERROR";
  id: string;
  error: {
    message: string;
    stack?: string | undefined;
    name: string;
    cause?: unknown;
  };
} & WorkerMessage

export type ChunkProcessedMessage = {
  type: "CHUNK_PROCESSED";
  success: boolean;
  sequence?: number;
} & WorkerMessage

export type ChunkErrorMessage = {
  type: "CHUNK_ERROR";
  error: string;
  sequence?: number;
} & WorkerMessage

export type CleanupCompleteMessage = {
  type: "CLEANUP_COMPLETE";
  id: string;
} & WorkerMessage

export type ServerActionMessage = {
  type: "SERVER_ACTION";
  args: unknown[];
} & WorkerMessage

export type ServerActionResponseMessage = {
  type: "SERVER_ACTION_RESPONSE";
  id: string;
  result?: unknown;
  error?: string;
} & WorkerMessage

export type HmrAcceptMessage = {
  type: "HMR_ACCEPT";
  routes?: string[];
} & WorkerMessage

export type RscChunkMessage = {
  type: "RSC_CHUNK";
  chunk: Uint8Array;
  sequence?: number;
} & WorkerMessage

export type RscEndMessage = {
  type: "RSC_END";
} & WorkerMessage

export type RouteReadyMessage = {
  type: "ROUTE_READY";
  moduleRootPath: string;
  moduleBaseURL: string;
  cssFiles: Map<string, CssContent>;
  pipeableStreamOptions: {
    identifierPrefix?: string;
    namespaceURI?: string;
    nonce?: string;
    bootstrapScriptContent?: string;
    bootstrapScripts?: Array<
      | string
      | {
          src: string;
          integrity?: string | undefined;
          crossOrigin?: string | undefined;
        }
    >;
    bootstrapModules?: Array<
      | string
      | {
          src: string;
          integrity?: string | undefined;
          crossOrigin?: string | undefined;
        }
    >;
    progressiveChunkSize?: number;
  };
  projectRoot: string;
} & WorkerMessage

export type CleanupMessage = {
  type: "CLEANUP";
} & WorkerMessage

// Common handlers
export type StreamHandlers = {
  onError: (id: string, error: unknown, errorInfo?: {
    componentStack?: string | null;
    digest?: string | null;
  } | Record<string, unknown>) => void;
  onData: (id: string, data: Uint8Array) => void;
  onEnd: (id: string) => void;
  onMetrics: (id: string, metrics: StreamMetrics) => void;
  onHmrAccept: (id: string, routes?: string[]) => void;
  onHmrUpdate: (id: string, routes?: string[]) => void;
  onServerAction?: (id: string, args: unknown[]) => void;
  onServerActionResponse?: (
    id: string,
    result?: unknown,
    error?: string
  ) => void;
  onServerModule?: (id: string, url: string, source: string) => void;
  onShutdown?: (id: string) => void;
  onCssFile?: (id: string, code: string) => void;
};

// Common options
export type ReactServerDomEsmOptions = {
  identifierPrefix?: string;
  namespaceURI?: string;
  nonce?: string;
  bootstrapScriptContent?: string;
  bootstrapScripts?: string[];
  bootstrapModules?: string[];
  progressiveChunkSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  temporaryReferences?: WeakMap<any, any>;
  moduleBaseURL?: string;
  importMap?: {
    imports?: Record<string, string>;
  };
  onError?: (error: Error, errorInfo?: {
    componentStack?: string | null;
    digest?: string | null;
  }) => void;
  onPostpone?: (reason: string) => void;
}
