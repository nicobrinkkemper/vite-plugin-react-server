import type {
  CreateHandlerOptions,
  RenderMetrics,
  StreamMetrics,
} from "../../types.js";
import type { PanicThreshold } from "../../types.js";

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
  CleanupMessage,
  AbortMessage,
  StreamHandlers,
} from "../types.js";
import type {
  CssFileMessage,
  InitializedCssLoaderMessage,
  RscMetricsMessage,
} from "../rsc/types.js";
import type { createLogger } from "vite";

// HTML-specific messages
export type HtmlChunkMessage = {
  type: "HTML_CHUNK";
  id: string;
  chunk: Uint8Array;
};

export type HtmlCompleteMessage = {
  type: "HTML_COMPLETE";
  id: string;
  success: boolean;
  html?: string;
  chunks?: string[];
  metrics?: StreamMetrics;
};

export type HtmlMetricsMessage = {
  type: "HTML_METRICS";
  id: string;
  metrics: RenderMetrics & { type: "html" };
};

export type HtmlRenderStartMessage = {
  type: "HTML_RENDER_START";
  id: string;
};

export type HtmlRenderMessage = {
  type: "INIT";
  id: string;
  dataPort: MessagePort;
  controlPort: MessagePort;
  options: {
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
    panicThreshold?: PanicThreshold;
    publicOrigin?: string;
  };
};

export type HtmlWorkerInputMessage =
  | HtmlRenderMessage
  | ShellReadyMessage
  | AllReadyMessage
  | ErrorMessage
  | ShellErrorMessage
  | CssFileMessage
  | RscMetricsMessage
  | ShutdownMessage
  | CleanupMessage
  | AbortMessage;

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
  | HtmlRenderStartMessage
  | HtmlMetricsMessage;

export type CallServerCallback = (
  id: string,
  args: unknown[]
) => Promise<unknown>;
// {
//   id: string;
//   route: string;
//   rscStream: PassThrough;
//   htmlStream: PassThrough;
//   projectRoot?: string;
//   moduleRootPath?: string;
//   moduleBasePath?: string;
//   moduleBaseURL?: string;
//   verbose?: boolean;
//   htmlTimeout?: number;
//   clientPipeableStreamOptions?: any;
// }
export type HandleHtmlRenderFn = (
  options: Pick<
    CreateHandlerOptions,
    | "id"
    | "clientPipeableStreamOptions"
    | "route"
    | "htmlStream"
    | "rscStream"
    | "projectRoot"
    | "moduleRootPath"
    | "moduleBasePath"
    | "moduleBaseURL"
    | "verbose"
    | "htmlTimeout"
    | "logger"
  >,
  handlers: StreamHandlers<"client">,
  logger?: ReturnType<typeof createLogger>
) => void;
