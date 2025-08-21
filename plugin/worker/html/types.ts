import type { PassThrough, Transform } from "stream";
import type { RenderMetrics, StreamMetrics } from "../../types.js";
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
  RscEndMessage,
  CleanupMessage,
  AbortMessage,
  StreamHandlers
} from '../types.js';
import type { CssFileMessage, InitializedCssLoaderMessage, RscChunkOutputMessage, RscMetricsMessage } from "../rsc/types.js";
import type { createLogger, Logger } from "vite";

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
  currentRoute?: string;
}

// HTML-specific messages
export type HtmlChunkMessage = {
  type: "HTML_CHUNK";
  id: string;
  chunk: Uint8Array;
}

export type HtmlCompleteMessage = {
  type: "HTML_COMPLETE";
  id: string;
  success: boolean;
  html?: string;
  chunks?: string[];
  metrics?: StreamMetrics;
}

export type HtmlMetricsMessage = {
  type: "HTML_METRICS";
  id: string;
  metrics: RenderMetrics & { type: "html" };
}

export type LogErrorMessage = {
  type: "LOG_ERROR";
  id: string;
  message: string;
  error: {
    name: string;
    message: string;
    stack: string;
  };
}

export type HtmlRenderStartMessage = {
  type: "HTML_RENDER_START";
  id: string;
};

export type HtmlRenderMessage = {
  type: "HTML_RENDER";
  id: string;
  route: string;
  url?: string;
  pagePath?: string;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName?: string;
  propsExportName?: string;
  rootExportName?: string;
  htmlExportName?: string;
  projectRoot?: string;
  moduleRootPath?: string;
  moduleBaseURL?: string;
  moduleBasePath?: string;
  moduleBase?: string;
  clientPipeableStreamOptions?: any;
  cssFiles?: Map<string, any>;
  globalCss?: Map<string, any>;
  verbose?: boolean;
  build?: any;
  htmlTimeout?: number;
  panicThreshold?: "none" | "critical_errors" | "all_errors";
  publicOrigin?: string;
}

export type HtmlWorkerInputMessage =
  | HtmlRenderMessage
  | RscChunkOutputMessage
  | RscEndMessage
  | ShellReadyMessage
  | AllReadyMessage
  | ErrorMessage
  | ShellErrorMessage
  | CssFileMessage
  | RscMetricsMessage
  | ShutdownMessage
  | CleanupMessage
  | AbortMessage

export type HtmlWorkerOutputMessage =
  | HtmlCompleteMessage
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
  | LogErrorMessage
  | HtmlRenderStartMessage
  | HtmlMetricsMessage

  

export type CreateHtmlWorkerRenderStateFn = (
  msg: HtmlRenderMessage,
  sendMessage?: (msg: HtmlWorkerOutputMessage) => void,
  rscStream?: PassThrough,
  logger?: Logger
) => HtmlWorkerRenderState;



export type CallServerCallback = (id: string, args: unknown[]) => Promise<unknown>;


export type HandleHtmlRenderFn = (
  options: {
    id: string;
    route: string;
    rscStream: PassThrough;
    htmlStream: PassThrough;
    projectRoot?: string;
    moduleRootPath?: string;
    moduleBasePath?: string;
    moduleBaseURL?: string;
    verbose?: boolean;
    htmlTimeout?: number;
  },
  handlers: StreamHandlers<'client'>,
  logger?: ReturnType<typeof createLogger>
) => void;