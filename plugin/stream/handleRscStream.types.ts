import type { Logger, ViteDevServer } from "vite";
import type { RscRenderMessage } from "../worker/rsc/types.js";
import type { StreamHandlers } from "../worker/types.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CreateHandlerOptions } from "../types.js";
import type { CreateRscStreamOptions } from "./createRscStream.types.js";
import type { Worker } from "node:worker_threads";

export type HandleWorkerServerActionFn = (
  req: IncomingMessage,
  res: ServerResponse,
  worker: Worker,
  logger: ViteDevServer["config"]["logger"]
) => Promise<void>;

export type HandleRscStreamFn<Env extends "client" | "server" = "client" | "server"> =
  Env extends "client"
    ? (
        props: {
          worker: Worker;
          options: Omit<RscRenderMessage, "type" | "id"> &
            Partial<Pick<RscRenderMessage, "id">> & {
              type?: "RSC_RENDER";
            };
          logger: Logger;
          handlers: Pick<
            StreamHandlers<"server">,
            "onMetrics" | "onHmrAccept" | "onHmrUpdate" | "onShellError"
          > &
            Partial<
              Pick<
                StreamHandlers<"server">,
                | "onError"
                | "onData"
                | "onEnd"
                | "onServerAction"
                | "onServerActionResponse"
                | "onCssFile"
              >
            >;
        } & Pick<
          CreateHandlerOptions,
          "verbose" | "rscTimeout" | "panicThreshold"
        >
      ) => ReadableStream<Uint8Array>
    : (
        props: {
          options: CreateRscStreamOptions;
          logger: Logger;
          handlers: Pick<
            StreamHandlers<"server">,
            "onMetrics" | "onHmrAccept" | "onHmrUpdate" | "onShellError"
          > &
            Partial<
              Pick<
                StreamHandlers<"server">,
                | "onError"
                | "onData"
                | "onEnd"
                | "onServerAction"
                | "onServerActionResponse"
                | "onCssFile"
              >
            >;
        } & Pick<
          CreateHandlerOptions,
          "verbose" | "rscTimeout" | "panicThreshold"
        >
      ) => ReadableStream<Uint8Array>;
