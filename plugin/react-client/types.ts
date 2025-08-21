import type { Logger, Manifest, ResolvedConfig, ViteDevServer } from "vite";
import type {
  AutoDiscoveredFiles,
  MessageHandler,
  ResolvedUserOptions,
  SerializedUserOptions,
} from "../../types.js";
import type { MessageChannel } from "node:worker_threads";
import type { Worker } from "node:worker_threads";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  RscChunkOutputMessage,
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

export type CreateWorkerStreamFn = (props: {
  route: string;
  url: string;
  projectRoot: string;
  moduleBasePath: string;
  moduleBaseURL: string;
  moduleRootPath: string;
  cssFiles: Map<string, any>;
  globalCss: Map<string, any>;
  manifest: any;
  serverPipeableStreamOptions?: any;
  clientPipeableStreamOptions?: any;
  verbose?: boolean;
  panicThreshold?: "none" | "critical_errors" | "all_errors";
  logger?: any;
  rscWorkerPath?: string;
  onEvent?: (event: any) => void;
  moduleBase: string;
  HtmlComponent: any;
  PageComponent: any;
  RootComponent: any;
  pageProps: any;
  as: any;
}) => {
  abort: (reason?: unknown) => void;
  pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => Writable;
};


// Removed GenerateWorkerStreamFn - using CreateWorkerStreamFn from helpers instead

export type CreateMessageHandlerFn = (props: {
  handlers: StreamHandlers;
  logger: Logger;
  verbose?: boolean;
}) => (message: RscWorkerOutputMessage | undefined) => void;

export type ConfigureWorkerRequestHandlerFn = (props: {
  server: ViteDevServer;
  autoDiscoveredFiles: AutoDiscoveredFiles;
  userOptions: ResolvedUserOptions;
  serverManifest: Manifest;
  resolvedConfig: ResolvedConfig;
  hmrChannel: MessageChannel;
  onWorkerCreated?: (worker: Worker) => void;
}) => void;

export type ConfigureRequestHandlerFn = (
  req: IncomingMessage,
  res: ServerResponse,
  worker: Worker,
  logger: ViteDevServer["config"]["logger"]
) => Promise<void>;

export type CleanupWorkerServerActionFn = (
  passThrough: PassThrough,
  worker: Worker,
  messageHandler: MessageHandler<RscChunkOutputMessage>,
  res: ServerResponse,
  error?: unknown,
  logger?: Logger
) => void;
