export const PANIC_SYMBOL = Symbol.for('vite-plugin-react-server.panic');

export function shouldPanic(
  error: unknown,
  panicThreshold: "none" | "critical_errors" | "all_errors",
  critical: boolean = false
): boolean {
  return panicThreshold === "all_errors" || (panicThreshold === "critical_errors" && critical) || isPanic(error)
}

export function isPanic<T>(error: T): error is T & { [PANIC_SYMBOL]: true } {
  return typeof error === 'object' && error != null && Boolean((error as any)[PANIC_SYMBOL]);
}

