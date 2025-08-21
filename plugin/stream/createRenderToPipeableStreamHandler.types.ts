import type React from "react";
import type { ReactStreamHandlerFn, StreamMetrics } from "../types.js";
import type { PassThrough } from "node:stream";

export type CreateRenderToPipeableStreamHandlerReturn<
  Env extends "client" | "server" = "client" | "server"
> = {
  type: Env;
  pipe: <Writable extends NodeJS.WritableStream>(
    destination: Writable
  ) => Writable;
  abort: (reason?: unknown) => void;
  // in .client this is the node-stream (createNodeStream) and in .server this just the react elements
  elements?: React.ReactElement | React.ReactNode | React.Usable<React.ReactElement | React.ReactNode>;
  metrics: StreamMetrics;
} & (Env extends "server"
  ? {
      rscStream: PassThrough;
      htmlStream?: never;
    }
  : {
      rscStream?: never;
      htmlStream: PassThrough;
    });

export type CreateRenderToPipeableStreamHandlerFn<
  Env extends "client" | "server" = "client" | "server"
> = ReactStreamHandlerFn<
  Env,
  // make those optional which we can handle later or ignore
  | "moduleID"
  | "css"
  | "normalizer"
  | "onMetrics"
  | "htmlTimeout"
  | "fileWriteTimeout"
  | "workerShutdownTimeout"
  | "rscWorkerPath"
  | "htmlWorkerPath"
  | "panicThreshold"
  | "logger"
  | "serverPipeableStreamOptions"
  | "clientPipeableStreamOptions"
  | "verbose"
  | "onEvent"
  | "autoDiscover"
  | "rscTimeout"
  | "loader"
  | "manifest"
  | "cssFiles"
  | "globalCss"
  | "build"
  | "PageComponent"
  | "RootComponent"
  | "HtmlComponent",
  CreateRenderToPipeableStreamHandlerReturn<Env>
>;
