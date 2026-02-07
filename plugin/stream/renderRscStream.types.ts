import type { PassThrough } from "node:stream";
import type { CreateHandlerOptions, StreamMetrics } from "../types.js";

export type RscRenderResult = {
  type: "server";
  pipe: <Writable extends NodeJS.WritableStream>(
    destination: Writable
  ) => Writable;
  abort: (reason?: unknown) => void;
  rscStream: PassThrough;
  metrics: StreamMetrics;
};

// Minimal interface for handlers that renderRscStream actually uses
export type RscStreamHandlers = {
  onError: (id: string, error: unknown, errorInfo?: { route?: string; context?: string }) => void;
  onData: (id: string, data: Uint8Array) => void;
  onEnd: (id: string) => void;
  onPostpone?: (id: string, reason: string) => void;
  onRscRender: (id: string, message: any) => void;
};

export type RscRenderFn = (
  options: CreateHandlerOptions,
  handlers: RscStreamHandlers
) => RscRenderResult;

export type RscRenderContext = {
  id: string;
  route: string;
  verbose: boolean;
  logger?: any;
  reuseHeadlessStreamId?: string;
  headlessStreamElements?: Map<string, any>;
  headlessStreamErrors?: Map<string, any>;
  panicError?: Error;
};

export type StreamErrorHandler = {
  handleError: (error: unknown, errorContext: string) => void;
  abort: (reason?: unknown) => void;
  isAbortable: () => boolean;
};
