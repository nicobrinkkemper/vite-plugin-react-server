import type { CreateHandlerOptions, ResolvedUserOptions } from "../types.js";

/**
 * RSC Stream Options - for server-side React Server Components
 * RSC = what gets serialized (server-side React Server Components)
 * Based on the working collectRscContent pattern
 */
export type CreateRscStreamOptions = Pick<
  CreateHandlerOptions<ResolvedUserOptions>,
  | "route" | "pagePath" | "projectRoot" | "moduleRootPath" | "moduleBasePath"
  | "moduleBaseURL" | "verbose" | "logger" | "worker" | "rscWorkerPath"
  | "clientPipeableStreamOptions" | "serverPipeableStreamOptions"
> & {
  // Additional properties from working examples
  url?: string;
  cssFiles?: any;
  globalCss?: any;
  manifest?: any;
  panicThreshold?: any;
  propsPath?: string;
  rootPath?: string;
  htmlPath?: string;
  pageExportName?: string;
  propsExportName?: string;
  rootExportName?: string;
  htmlExportName?: string;
  moduleBase?: string;
  publicOrigin?: string;
  rscTimeout?: any;
  htmlTimeout?: any;
  fileWriteTimeout?: any;
  workerShutdownTimeout?: any;
  css?: any;
  build?: any;
};

/**
 * RSC Stream Function - creates server-side React Server Components
 * RSC = what gets serialized
 */
export type CreateRscStreamFn = <
  Opt extends CreateRscStreamOptions = CreateRscStreamOptions
>(
  options: Opt
) => {
  type: "client" | "server";
  stream: any; // Flexible stream type for both client and server
  elements: React.ReactElement;
  pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => Writable;
  abort: (reason?: unknown) => void;
  metrics: any;
}; 