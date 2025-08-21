import type { CreateHandlerOptions, ResolvedUserOptions } from "../types.js";
import type { PassThrough } from "node:stream";

/**
 * HTML Stream Options - for client-rendered pipeable React
 * HTML = what gets sent to the browser (client-rendered pipeable React)
 */
export type CreateHtmlStreamOptions = Pick<
  CreateHandlerOptions<ResolvedUserOptions>,
  | "moduleRootPath"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "route"
  | "clientPipeableStreamOptions"
  | "projectRoot"
  | "verbose"
  | "logger"
  | "worker"
  | "htmlWorkerPath"
  | "rscWorkerPath"
  | "id"
> & {
  // RSC stream that will be converted to HTML
  rscStream: PassThrough;
  // Additional properties from working examples
  url?: string;
  cssFiles?: any;
  globalCss?: any;
  manifest?: any;
  panicThreshold?: any;
  pagePath?: string;
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
 * HTML Stream Function - creates client-rendered pipeable React
 * HTML = what gets sent to the browser
 */
export type CreateHtmlStreamFn = <
  Opt extends CreateHtmlStreamOptions = CreateHtmlStreamOptions
>(
  options: Opt
) => {
  abort: (reason?: unknown) => void;
  pipe: <Writable extends NodeJS.WritableStream>(destination: Writable) => Writable;
};
