import type { Logger as ViteLogger } from "vite";

/**
 * Log levels for the plugin, from least to most verbose:
 * - "silent": no output
 * - "error": only errors
 * - "info": lifecycle events (server start, build, routes, worker lifecycle)
 * - "debug": everything (module resolution, chunks, transforms — old "verbose")
 */
export type LogLevel = "silent" | "error" | "info" | "debug";

const LEVEL_ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  info: 2,
  debug: 3,
};

export interface PluginLogger {
  error(msg: string, ...args: any[]): void;
  info(msg: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
  isDebug: boolean;
  isInfo: boolean;
}

/**
 * Creates a plugin logger that respects the configured log level.
 * Uses Vite's logger for output when available, falls back to console.
 */
export function createPluginLogger(
  level: LogLevel | boolean | undefined,
  viteLogger?: ViteLogger | Console
): PluginLogger {
  // Backward compat: boolean verbose → "debug" | "error"
  const resolved: LogLevel =
    typeof level === "boolean"
      ? level
        ? "debug"
        : "error"
      : level ?? "error";

  const threshold = LEVEL_ORDER[resolved];
  const log = viteLogger ?? console;

  const noop = () => {};

  return {
    error:
      threshold >= LEVEL_ORDER.error
        ? (msg: string, ...args: any[]) => log.error(`[rsc] ${msg}`, ...args)
        : noop,
    info:
      threshold >= LEVEL_ORDER.info
        ? (msg: string, ...args: any[]) =>
            "info" in log
              ? (log as ViteLogger).info(`[rsc] ${msg}`)
              : console.info(`[rsc] ${msg}`, ...args)
        : noop,
    debug:
      threshold >= LEVEL_ORDER.debug
        ? (msg: string, ...args: any[]) =>
            "info" in log
              ? (log as ViteLogger).info(`[rsc:debug] ${msg}`)
              : console.log(`[rsc:debug] ${msg}`, ...args)
        : noop,
    isDebug: threshold >= LEVEL_ORDER.debug,
    isInfo: threshold >= LEVEL_ORDER.info,
  };
}
