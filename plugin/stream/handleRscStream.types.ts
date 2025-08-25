import type { ViteDevServer } from "vite";
import type { StreamHandlers } from "../worker/types.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { CreateHandlerOptions,   ResolvedUserOptions } from "../types.js";
import type { Worker } from "node:worker_threads";

export type HandleWorkerServerActionFn = (
  req: IncomingMessage,
  res: ServerResponse,
  worker: Worker,
  logger: ViteDevServer["config"]["logger"]
) => Promise<void>;

export type HandleRscStreamFn<
  Env extends "client" | "server" = "client" | "server"
> = Env extends "client"
  ? (
      props: {
        options: Omit<CreateHandlerOptions<ResolvedUserOptions>, 'onMetrics' | 'autoDiscover' | 'normalizer' | 'moduleID'> & {
          id?: string;
          type?: "INIT";
          onMetrics?: never;
          autoDiscover?: never;
          normalizer?: never;
          moduleID?: never;
        };
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
      }
    ) => ReadableStream<Uint8Array>
  : (
      props: {
        options: Omit<CreateHandlerOptions<ResolvedUserOptions>, 'onMetrics' | 'autoDiscover' | 'normalizer' | 'moduleID'> & {
          id?: string;
          type?: "INIT",
          onMetrics?: never;
          autoDiscover?: never;
          normalizer?: never;
          moduleID?: never;
        }
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
      }
    ) => ReadableStream<Uint8Array>;
