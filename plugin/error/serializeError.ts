import { PANIC_SYMBOL, isPanic } from "./shouldPanic.js";

export function serializeError(error: unknown): {
  message?: string;
  stack?: string | undefined;
  name?: string;
  environment?: string;
  cause?: unknown;
  breadcrumbs?: string[];
  /**
   * The panic flag as a PLAIN field: the real flag lives on a Symbol key,
   * which (a) the old string-key read here never found and (b) postMessage's
   * structured clone drops anyway. This field is what actually crosses the
   * worker boundary; toError re-applies the Symbol on rehydration.
   */
  isPanic?: boolean;
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
      isPanic: isPanic(error),
      [PANIC_SYMBOL]: isPanic(error),
      ...rest,
    };
  }
  if (typeof error === "string") {
    return {
      message: error,
      stack: undefined,
      name: "Unknown React Stream Error",
      breadcrumbs: [],
      isPanic: false,
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
      isPanic: isPanic(error),
      [PANIC_SYMBOL]: isPanic(error),
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
