import type { MessagePort } from "node:worker_threads";
import type { CreateHandlerOptions, RenderMetrics } from "../types.js";
import type { HtmlWorkerOutputMessage } from "./html/types.js";
import type { RscWorkerOutputMessage } from "./rsc/types.js";
import type { ModuleResolutionMetrics, WorkerStartupMetrics } from "../metrics/types.js";

// Base message types
export type WorkerMessage = {
  type: string;
  id: string;
};

// Common message types used across workers
export type ErrorMessage = {
  type: "ERROR";
  errorInfo?: null | {
    componentStack?: string | null;
    digest?: string | null;
  };
  error: unknown;
  id: string;
} & WorkerMessage;

export type ReadyMessage = {
  type: "READY";
  id: string;
  env?: string;
  pid?: number;
};

export type ShutdownMessage = {
  type: "SHUTDOWN";
} & WorkerMessage;

export type ShutdownCompleteMessage = {
  type: "SHUTDOWN_COMPLETE";
  id: string;
};

export type ShellReadyMessage = {
  type: "SHELL_READY";
} & WorkerMessage;

export type AllReadyMessage = {
  type: "ALL_READY";
  id: string;
} & WorkerMessage;

export type ShellErrorMessage = {
  type: "SHELL_ERROR";
  id: string;
  error: {
    message: string;
    stack?: string | undefined;
    name: string;
    cause?: unknown;
  };
} & WorkerMessage;

export type ChunkProcessedMessage = {
  type: "CHUNK_PROCESSED";
  success: boolean;
  sequence?: number;
} & WorkerMessage;

export type ChunkErrorMessage = {
  type: "CHUNK_ERROR";
  error: string;
  sequence?: number;
} & WorkerMessage;

export type CleanupCompleteMessage = {
  type: "CLEANUP_COMPLETE";
  id: string;
} & WorkerMessage;

export type ServerActionMessage = {
  type: "SERVER_ACTION";
  /** Legacy pre-decoded arguments (the `{id,args}` JSON envelope). */
  args?: unknown[];
  /**
   * The raw request body, preserved for the worker's transport `decodeReply`:
   * text as-is; multipart as bytes (FormData cannot cross the thread
   * boundary) with `contentType` carrying the boundary for reconstruction.
   */
  body?: string | Uint8Array;
  contentType?: string;
} & WorkerMessage;

export type ServerActionResponseMessage = {
  type: "SERVER_ACTION_RESPONSE";
  id: string;
  /**
   * The flight-rendered `{ returnValue }` payload, produced by the worker's
   * transport renderer. The main thread writes it to the response verbatim —
   * non-JSON flight values survive because no re-encoding happens outside the
   * react-server context.
   */
  flight?: string;
  /** Legacy raw result (pre-flight protocol); main thread JSON-rows it. */
  result?: unknown;
  error?: string;
} & WorkerMessage;

export type HmrAcceptMessage = {
  type: "HMR_ACCEPT";
  routes?: string[];
} & WorkerMessage;

export type RscChunkMessage = {
  type: "RSC_CHUNK";
  chunk: Uint8Array;
  sequence?: number;
} & WorkerMessage;

export type RscEndMessage = {
  type: "RSC_END";
} & WorkerMessage;

export type HtmlRenderMessage = {
  type: "INIT";
  abortSignal?: AbortSignal;
} & WorkerMessage &
  Pick<
    CreateHandlerOptions,
    | "projectRoot"
    | "moduleRootPath"
    | "moduleBasePath"
    | "moduleBaseURL"
    | "serverPipeableStreamOptions"
    | "clientPipeableStreamOptions"
    | "route"
    | "url"
    | "verbose"
    | "panicThreshold"
  >;

export type AbortMessage = {
  type: "ABORT";
  id: string;
  reason?: string;
} & WorkerMessage;

export type CleanupMessage = {
  type: "CLEANUP";
  reason?: unknown;
} & WorkerMessage;

export type ClientOnlyStreamHandlers = {
  onHtmlRender: (id: string, message: HtmlRenderMessage) => void;
  onClientModule?: (id: string, url: string, source: string) => void;
  onError: (
    id: string,
    error: unknown,
    errorInfo?: {
      componentStack?: string | null;
      digest?: string | null;
    }
  ) => void;
};

export type ServerOnlyStreamHandlers = {
  onServerModule?: (id: string, url: string, source: string) => void;
  onServerAction?: (id: string, args: unknown[]) => void;
  onServerActionResponse?: (
    id: string,
    result?: unknown,
    error?: string,
    flight?: string
  ) => void;
  onError: (id: string, error: unknown, errorInfo?: { route?: string; context?: string }) => void;
  onPostpone?: (id: string, reason: string) => void;
};

// Common handlers
export type StreamHandlers<
  Env extends "client" | "server" = "client" | "server"
> = (Env extends "client"
  ? ClientOnlyStreamHandlers
  : ServerOnlyStreamHandlers) & {
  // these are available in both environments
  onShellError: (id: string, error: unknown) => void;
  onData: (id: string, data: Uint8Array) => void;
  onEnd: (id: string) => void;
  onMetrics: (id: string, metrics: RenderMetrics<'rsc-full' | 'rsc-headless' | 'html'> | WorkerStartupMetrics | ModuleResolutionMetrics) => void;
  onHmrAccept: (id: string, routes?: string[]) => void;
  // Optional method for two-port communication
  getWritable?: () => NodeJS.WritableStream;
  onHmrUpdate: (id: string, routes?: string[]) => void;
  onShutdown?: (id: string) => void;
  /**
   * Post an error THROUGH the data port (ordered ahead of onEnd's null),
   * so the receiver is guaranteed to see it before end-of-stream. Used for
   * loader control-flow signals, which the control port's ERROR message can
   * lose to the cross-port ordering race.
   */
  onDataError?: (id: string, error: unknown) => void;
  onCssFile?: (id: string, code: string) => void;
  onCleanup?: (id: string) => void;
  onShellReady?: (id: string) => void;
  onRscRender?: (id: string, message?: any) => void;
  onAllReady?: (id: string) => void;
};

export type ClientStreamHandlers = StreamHandlers<"client">;
export type ServerStreamHandlers = StreamHandlers<"server">;

export type SendMessageFn = (
  msg: HtmlWorkerOutputMessage | RscWorkerOutputMessage,
  port?: Pick<MessagePort, "postMessage"> | null
) => void;
