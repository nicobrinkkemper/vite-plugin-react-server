import type { CssContent } from "../types.js";

// Base message types
export interface WorkerMessage {
  type: string;
  id: string;
}

// Common message types used across workers
export interface ErrorMessage extends WorkerMessage {
  type: "ERROR";
  errorInfo?: any;
  error: string | {
    message: string;
    stack?: string | undefined;
    name: string;
    cause?: any;
  };
  id: string;
}

export interface ReadyMessage {
  type: "READY";
  id: string;
  env?: string;
  pid?: number;
}

export interface ShutdownMessage extends WorkerMessage {
  type: "SHUTDOWN";
}

export interface ShutdownCompleteMessage {
  type: "SHUTDOWN_COMPLETE";
  id: string;
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

export interface CleanupCompleteMessage extends WorkerMessage {
  type: "CLEANUP_COMPLETE";
  id: string;
}

export interface ServerActionMessage extends WorkerMessage {
  type: "SERVER_ACTION";
  args: unknown[];
}

export interface ServerActionResponseMessage extends WorkerMessage {
  type: "SERVER_ACTION_RESPONSE";
  id: string;
  result?: unknown;
  error?: string;
}

export interface HmrAcceptMessage extends WorkerMessage {
  type: "HMR_ACCEPT";
  routes?: string[];
}

export interface RscChunkMessage extends WorkerMessage {
  type: "RSC_CHUNK";
  chunk: Uint8Array;
  sequence?: number;
}

export interface RscEndMessage extends WorkerMessage {
  type: "RSC_END";
}

export interface RouteReadyMessage extends WorkerMessage {
  type: "ROUTE_READY";
  moduleRootPath: string;
  moduleBaseURL: string;
  cssFiles: Map<string, CssContent>;
  pipeableStreamOptions: any;
  projectRoot: string;
}

export interface CleanupMessage extends WorkerMessage {
  type: "CLEANUP";
}

// Common handlers
export type StreamHandlers = {
  onError: (id: string, error: any, errorInfo?: any) => void;
  onData: (id: string, data: any) => void;
  onEnd: (id: string) => void;
  onMetrics: (id: string, metrics: any) => void;
  onHmrAccept: (id: string, routes?: string[]) => void;
  onHmrUpdate: (id: string, routes?: string[]) => void;
  onServerAction?: (id: string, args: unknown[]) => void;
  onServerActionResponse?: (id: string, result?: unknown, error?: string) => void;
  onServerModule?: (id: string, url: string, source: string) => void;
  onShutdown?: (id: string) => void;
  onCssFile?: (id: string, code: string) => void;
};

// Common options
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
