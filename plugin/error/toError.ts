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
