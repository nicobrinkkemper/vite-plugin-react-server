import type { Logger } from "vite";

export function toError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  return error instanceof Error
    ? error
    : typeof error === "object" && error !== null
    ? {
        name: "name" in error ? String(error.name) : "Unknown Error",
        message: "message" in error ? String(error.message) : "Unknown Error",
        stack: "stack" in error ? String(error.stack) : undefined,
      }
    : {
        name: "Unknown Error",
        message: typeof error === "string" ? error : "Unknown Error",
        stack: undefined,
      };
}

export function logError(error: unknown, logger: Logger | Console = console) {
  const err = toError(error);
  if (process.env["NODE_ENV"] !== "production") {
    if (err.stack && err.stack.includes(err.message)) {
      logger.error(err.stack);
    } else if (err.stack) {
      logger.error(err.message + "\n" + err.stack, {
        error: err,
      });
    } else {
      logger.error(err.message, {
        error: err,
      });
    }
  } else {
    logger.error(err.message);
  }
}
