// React types are imported from vendor system at runtime
type ErrorInfo = {
  componentStack?: string;
};

import type { Logger } from "vite";
import type { PanicThreshold } from "../types.js";

/**
 * Error handling options
 */
export interface HandleErrorOptions {
  error: unknown;
  errorInfo?: ErrorInfo | null;
  logger?: Logger | Console;
  mode?: "development" | "production" | "test";
  panicThreshold?: PanicThreshold;
  critical?: boolean;
  context: string; // Add context parameter for better DX
  log?: boolean; // if true, the error will be logged even if it comes from the worker thread
}

export type HandleErrorFn = (options: HandleErrorOptions) => Error | null;

export type GlobalErrorHandlerOptions = {
  panicThreshold: PanicThreshold;
  logger: Logger;
  verbose?: boolean;
};

export type SetupGlobalErrorHandlerFn = (options: GlobalErrorHandlerOptions) => void;
export type CleanupGlobalErrorHandlerFn = () => void;