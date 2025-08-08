import { PANIC_SYMBOL } from "./shouldPanic.js";

export function serializeError(error: unknown): {
  message?: string;
  stack?: string | undefined;
  name?: string;
  environment?: string;
  cause?: unknown;
  breadcrumbs?: string[];
  [PANIC_SYMBOL]?: boolean;
} {
  if (error instanceof Error) {
    const { message, stack, name, cause, ...rest } = error;
    return {
      message: message,
      stack: stack,
      name: name,
      cause: cause,
      breadcrumbs:
        (error as Error & { breadcrumbs: string[] })["breadcrumbs"] ?? [],
      [PANIC_SYMBOL]:
        (error as Error & { PANIC_SYMBOL: boolean })["PANIC_SYMBOL"] ?? false,
      ...rest,
    };
  }
  if (typeof error === "string") {
    return {
      message: error,
      stack: undefined,
      name: "Unknown React Stream Error",
      breadcrumbs: [],
      [PANIC_SYMBOL]: false,
    };
  }
  if (typeof error === "object" && error !== null) {
    const {
      message = "Unknown React Stream Error",
      stack,
      name,
      cause,
      ...rest
    } = error as Error;
    return {
      message: message,
      stack: stack,
      name: name,
      breadcrumbs: [],
      [PANIC_SYMBOL]: false,
      ...rest,
    };
  }
  return {
    message: "Unknown React Stream Error",
    stack: undefined,
    name: "Unknown React Stream Error",
    breadcrumbs: [],
    [PANIC_SYMBOL]: false,
  };
}
