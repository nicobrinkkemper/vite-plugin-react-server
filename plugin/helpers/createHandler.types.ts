import type { ReactStreamHandlerFn, StreamMetrics } from "../types.js";

export type CreateHandlerReturn<
  Env extends "client" | "server" = "client" | "server"
> = {
  type: Env;
  pipe: <Writable extends NodeJS.WritableStream>(
    destination: Writable
  ) => Writable;
  abort: (reason?: unknown) => void;
  elements: React.ReactElement;
  metrics: StreamMetrics;
  stream?: NodeJS.ReadableStream; // Optional for backward compatibility
};

export type CreateHandlerFn<
  Env extends "client" | "server" = "client" | "server"
> = ReactStreamHandlerFn<
  // make those optional which we can handle later or ignore
  | "url"
  | "pageExportName"
  | "propsExportName"
  | "rootExportName"
  | "htmlExportName"
  | "moduleBaseURL"
  | "moduleRootPath"
  | "moduleBasePath"
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
  | "moduleBase"
  | "publicOrigin"
  | "projectRoot"
  | "rscTimeout"
  | "loader"
  | "PageComponent"
  | "RootComponent"
  | "HtmlComponent"
  | "manifest"
  | "cssFiles"
  | "globalCss"
  | "build",
  CreateHandlerReturn<Env>
>;
