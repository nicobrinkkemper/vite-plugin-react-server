import type { ErrorInfo } from "react";
import type { Logger } from "vite";

/**
 * Error handling options
 */
export interface HandleErrorOptions {
  error: unknown;
  errorInfo?: ErrorInfo;
  logger?: Logger | Console;
  mode?: "development" | "production" | "test";
  panicThreshold?: "none" | "critical_errors" | "all_errors";
  critical?: boolean;
  context: string; // Add context parameter for better DX
  log?: boolean; // if true, the error will be logged even if it comes from the worker thread
}

export type HandleErrorFn = (options: HandleErrorOptions) => Error | null;

export type GlobalErrorHandlerOptions = {
  panicThreshold: "none" | "critical_errors" | "all_errors";
  logger: Logger;
  verbose?: boolean;
};

export type SetupGlobalErrorHandlerFn = (options: GlobalErrorHandlerOptions) => void;
export type CleanupGlobalErrorHandlerFn = () => void;