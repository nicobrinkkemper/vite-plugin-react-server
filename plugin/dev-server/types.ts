import type { Manifest, ViteDevServer, Logger, ResolvedConfig } from "vite";
import type {
  AutoDiscoveredFiles,
  CreateHandlerOptions,
  ResolvedUserOptions,
} from "../types.js";
import type { IncomingMessage, ServerResponse } from "http";
import type { MessageChannel, Worker } from "node:worker_threads";
import type { StreamHandlers } from "../worker/types.js";
import type { PassThrough } from "node:stream";
import type { RscRenderMessage, RscChunkOutputMessage } from "../worker/rsc/types.js";
import type { MessageHandler } from "../types.js";



/**
 * React Worker Server - configures worker-based rendering infrastructure
 * Similar to configureReactServer but for worker-based rendering
 */
export type CreateReactWorkerServerFn = (props: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
  hmrChannel?: MessageChannel;
  serverManifest: Manifest;
  resolvedConfig: ResolvedConfig;
  onWorkerCreated?: (worker: any) => void;
}) => void;

export type HandleServerActionFn = (
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
  handlerOptions: Pick<
    CreateHandlerOptions,
    "verbose" | "moduleBasePath" | "projectRoot" | "loader"
  >
) => Promise<void>;

export type ConfigureReactServerFn = (options: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
  serverManifest: Manifest;
  resolvedConfig: ResolvedConfig;
  hmrChannel?: MessageChannel;
  onWorkerCreated?: (worker: Worker) => void;
}) => void;

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
  handlers: Pick<StreamHandlers, "onMetrics" | "onHmrAccept" | "onHmrUpdate" | "onShellError"> &
    Partial<
      Pick<
        StreamHandlers<'server'>,
        | "onError"
        | "onData"
        | "onEnd"
        | "onServerAction"
        | "onServerActionResponse"
        | "onCssFile"
      >
    >;
  
} & Pick<CreateHandlerOptions, "verbose" | "rscTimeout" | "panicThreshold">) => ReadableStream<Uint8Array>;

export type CleanupWorkerServerActionFn = (
  passThrough: PassThrough,
  worker: Worker,
  messageHandler: MessageHandler<RscChunkOutputMessage>,
  res: ServerResponse,
  error?: unknown,
  logger?: Logger
) => void;
