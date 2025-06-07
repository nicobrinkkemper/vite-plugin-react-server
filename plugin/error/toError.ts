export function toError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
} {
  if (typeof error === "string") {
    return {
      name: "Error",
      message: error,
      stack: undefined,
      cause: undefined,
    };
  }
  return error instanceof Error
    ? error
    : typeof error === "object" && error !== null
    ? {
        name: "name" in error ? String(error.name) : "Unknown Error",
        message:
          "message" in error
            ? typeof error.message === "string"
              ? error.message
              : JSON.stringify(error.message)
            : "Unknown Error",
        stack: "stack" in error ? String(error.stack) : undefined,
        cause: "cause" in error ? toError(error.cause) : error,
      }
    : {
        name: "Unknown Error",
        message: typeof error === "string" ? error : "Unknown Error",
        stack: undefined,
        cause: error,
      };
}
