import type { Manifest } from "vite";
import type { CreateHandlerOptions, CssContent, PanicThreshold, ResolvedUserOptions } from "../types.js";
import type { PassThrough, Readable } from "node:stream";

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
  | "htmlWorker"
  | "htmlWorkerPath"
  | "rscWorkerPath"
  | "id"
  | "children"
> & {
  worker?: any;
  // RSC stream that will be converted to HTML
  rscStream?: PassThrough | Readable;
  // Additional properties from working examples
  url?: string;
  cssFiles?: Map<string, CssContent>;
  globalCss?: Map<string, CssContent>;
  manifest?: Manifest;
  panicThreshold?: PanicThreshold;
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
  rscTimeout?: number;
  htmlTimeout?: number;
  fileWriteTimeout?: number;
  workerShutdownTimeout?: number;
  css?: CreateHandlerOptions["css"];
  build?: CreateHandlerOptions["build"];
  children?: React.ReactNode;
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
