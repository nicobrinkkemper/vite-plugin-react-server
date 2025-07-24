import type { PassThrough, Transform } from "stream";
import type { StreamMetrics } from "../../types.js";
import type { 
  ErrorMessage,
  ShellReadyMessage,
  ChunkProcessedMessage,
  ChunkErrorMessage,
  AllReadyMessage,
  ShellErrorMessage,
  ShutdownCompleteMessage,
  HmrAcceptMessage,
  ReadyMessage,
  ServerActionMessage,
  ServerActionResponseMessage,
  CleanupCompleteMessage,
  ShutdownMessage,
  RouteReadyMessage,
  RscEndMessage,
  CleanupMessage
} from '../types.js';
import type { CssFileMessage, InitializedCssLoaderMessage, RscChunkOutputMessage, RscMetricsMessage } from "../rsc/types.js";
import type { Logger } from "vite";

// HTML-specific metrics
export type HtmlWorkerStreamMetrics = {
  totalChunksReceived: number;
  totalBytesReceived: number;
  totalChunksProcessed: number;
  totalBytesProcessed: number;
};

// HTML worker state
export type HtmlWorkerRenderState = {
  rscStream: PassThrough;
  metrics: StreamMetrics;
  isReady: boolean;
  htmlTransform: Transform;
  stream: ReactDOMServer.PipeableStream;
  abort?: () => void;
  shellReady?: boolean;
  hasError?: boolean;
  setError?: () => void;
  currentRoute?: string;
}

// HTML-specific messages
export type HtmlChunkMessage = {
  type: "HTML_CHUNK";
  id: string;
  chunk: string;
  encoding: string;
}

export type HtmlCompleteMessage = {
  type: "HTML_COMPLETE";
  id: string;
  success: boolean;
  html?: string;
  chunks?: string[];
  metrics?: StreamMetrics;
}

export type RouteFailedMessage = {
  type: "ROUTE_FAILED";
  id: string;
  reason: string;
}



export type HtmlWorkerInputMessage =
  | RouteReadyMessage
  | RscChunkOutputMessage
  | RscEndMessage
  | ShellReadyMessage
  | AllReadyMessage
  | ErrorMessage
  | CssFileMessage
  | RscMetricsMessage
  | ShutdownMessage
  | CleanupMessage

export type HtmlWorkerOutputMessage =
  | HtmlCompleteMessage
  | RouteFailedMessage
  | ErrorMessage
  | ShellReadyMessage
  | ChunkProcessedMessage
  | ChunkErrorMessage
  | AllReadyMessage
  | ShellErrorMessage
  | HtmlChunkMessage
  | ShutdownCompleteMessage
  | HmrAcceptMessage
  | ReadyMessage
  | ServerActionMessage
  | ServerActionResponseMessage
  | CleanupCompleteMessage
  | InitializedCssLoaderMessage

  

export type CreateHtmlWorkerRenderStateFn = (
  msg: RouteReadyMessage,
  sendMessage?: (msg: HtmlWorkerOutputMessage) => void,
  rscStream?: PassThrough,
  logger?: Logger
) => HtmlWorkerRenderState;



export type CallServerCallback = (id: string, args: unknown[]) => Promise<unknown>;