import { isPanic } from "./shouldPanic.js";

export function assertPanic<T>(
  error: T
): asserts error is NonNullable<T> {
  if (isPanic(error)) {
    throw error;
  }
}
