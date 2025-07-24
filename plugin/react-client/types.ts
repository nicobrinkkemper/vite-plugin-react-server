import type { Logger, ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  CreateHandlerOptions,
  MessageHandler,
  ResolvedUserOptions,
  SerializedUserOptions,
} from "../../types.js";
import type { MessageChannel } from "node:worker_threads";
import type { Worker } from "node:worker_threads";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  RscChunkOutputMessage,
  RscRenderMessage,
  RscWorkerOutputMessage,
} from "../worker/rsc/types.js";
import type { StreamHandlers } from "../worker/types.js";
import type { PassThrough } from "node:stream";

export type RestartWorkerFn = (props: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: SerializedUserOptions;
  hmrChannel: MessageChannel;
}) => Promise<Worker | null>;

export type HandleWorkerServerActionFn = (
  req: IncomingMessage,
  res: ServerResponse,
  worker: Worker,
  logger: ViteDevServer["config"]["logger"]
) => Promise<void>;

export type HandleWorkerRscStreamFn = (props: {
  worker: Worker;
  message: Omit<RscRenderMessage, "type" | "id"> &
    Partial<Pick<RscRenderMessage, "id">> & {
      type?: "RSC_RENDER";
    };
  logger: Logger;
  handlers: Pick<StreamHandlers, "onMetrics" | "onHmrAccept" | "onHmrUpdate"> &
    Partial<
      Pick<
        StreamHandlers,
        | "onError"
        | "onData"
        | "onEnd"
        | "onServerAction"
        | "onServerActionResponse"
        | "onCssFile"
      >
    >;
  
} & Pick<CreateHandlerOptions, "verbose" | "rscTimeout" | "panicThreshold">) => ReadableStream<Uint8Array>;

export type CreateWorkerStreamFn = (props: {
  worker: Worker;
  message: Omit<RscRenderMessage, "type" | "id"> &
    Partial<Pick<RscRenderMessage, "id">> & {
      type?: "RSC_RENDER";
    };
  logger: Logger;
  handlers: Pick<StreamHandlers, "onHmrAccept" | "onHmrUpdate" | "onMetrics"> &
    Partial<
      Pick<
        StreamHandlers,
        "onError" | "onServerAction" | "onServerActionResponse" | "onCssFile"
      >
    >;
  panicThreshold?: "none" | "critical_errors" | "all_errors";
  verbose?: boolean;
  rscTimeout?: number;
}) => AsyncGenerator<Uint8Array>;

export type CreateMessageHandlerFn = (props: {
  handlers: StreamHandlers;
  logger: Logger;
  verbose?: boolean;
}) => (message: RscWorkerOutputMessage | undefined) => void;

export type ConfigureWorkerRequestHandlerFn = (props: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
  hmrChannel: MessageChannel;
}) => void;

export type CleanupWorkerServerActionFn = (
  passThrough: PassThrough,
  worker: Worker,
  messageHandler: MessageHandler<RscChunkOutputMessage>,
  res: ServerResponse,
  error?: unknown,
  logger?: Logger
) => void;
