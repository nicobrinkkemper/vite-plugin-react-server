import type { CreateHandlerOptions, ResolvedUserOptions, StreamMetrics } from "../types.js";
import type { PassThrough } from "node:stream";

export type CreateRscStreamOptions = Pick<
  CreateHandlerOptions<ResolvedUserOptions>,
  | "url"
  | "HtmlComponent"
  | "PageComponent"
  | "RootComponent"
  | "pageProps"
  | "moduleBase"
  | "moduleRootPath"
  | "moduleBasePath"
  | "moduleBaseURL"
  | "cssFiles"
  | "route"
  | "pipeableStreamOptions"
  | "globalCss"
  | "manifest"
  | "projectRoot"
  | "verbose"
  | "as"
  | "logger"
  | "panicThreshold"
  | "onEvent"
>;

export type CreateRscStreamReturn =
  | {
      type: "success";
      controller: { abort: (reason: unknown) => void; destroy: () => void };
      metrics: StreamMetrics;
    }
  | { type: "error"; error: unknown | null; metrics: StreamMetrics };

export type CreateRscStreamFn = <
  Opt extends CreateRscStreamOptions = CreateRscStreamOptions,
  Stream extends NodeJS.WritableStream | PassThrough = PassThrough
>(
  options: Opt,
  passThrough: Stream
) => CreateRscStreamReturn & { stream: Stream };