export function serializeError(error: unknown): {
  message: string;
  stack?: string | undefined;
  name: string;
  cause?: unknown;
} {
  if (error instanceof Error) {
  return {
    message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
    };
  }
  if (typeof error === "string") {
    return {
      message: error,
      stack: undefined,
      name: "Unknown React Stream Error",
    };
  }
  if (typeof error === "object" && error !== null) {
    return {
      message: "Unknown React Stream Error",
      stack: undefined,
      name: "Unknown React Stream Error",
    };
  }
  return {
    message: "Unknown React Stream Error",
    stack: undefined,
    name: "Unknown React Stream Error",
  };
}