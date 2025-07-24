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
  context?: string; // Add context parameter for better DX
}

export type HandleErrorFn = (options: HandleErrorOptions) => Error | null;
