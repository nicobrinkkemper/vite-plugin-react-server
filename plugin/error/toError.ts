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
        name: "name" in error ? String(error.name) : "Unknown React Stream Error",
        message:
          "message" in error
            ? typeof error.message === "string"
              ? error.message
              : JSON.stringify(error.message)
            : "Unknown React StreamError",
        stack: "stack" in error ? String(error.stack) : undefined,
        cause: "cause" in error ? error.cause : error,
      }
    : {
        name: "Unknown React Stream Error",
        message: typeof error === "string" ? error : "Unknown Read Stream Error",
        stack: undefined,
        cause: error,
      };
}
