import {
  Worker,
  type ResourceLimits,
  type TransferListItem,
  type MessagePort,
} from "node:worker_threads";
import type { ConfigEnv } from "vite";
import { getMode, getNodePath } from "../config/getPaths.js";
import {
  getCondition,
  REACT_CONDITION,
  type ReactCondition,
} from "../config/getCondition.js";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { pluginRoot } from "../root.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { lockReactFamily } from "../vendor/lazyVendorModule.js";

function workerNodeEnv(): string {
  const locked = lockReactFamily();
  const parentEnv = process.env["NODE_ENV"];
  const parentCompatible =
    parentEnv != null &&
    (parentEnv === "production") === (locked === "production");
  return parentCompatible ? parentEnv : locked;
}
import { createLogger, type Logger } from "vite";
import type { HtmlWorkerOutputMessage } from "./html/types.js";
import type { RscWorkerOutputMessage } from "./rsc/types.js";
import type {
  SerializedResolvedConfig,
  SerializedUserOptions,
} from "../types.js";
import type { Manifest } from "vite";
import type { OutputBundle } from "rollup";
import { handleError } from "../error/handleError.js";
import { toError } from "../error/toError.js";

// Global worker registry for graceful shutdown
const activeWorkers = new Set<Worker>();

// Graceful shutdown function using the existing SHUTDOWN protocol
export async function shutdownAllWorkers(timeout: number = 1000): Promise<void> {
  if (activeWorkers.size === 0) return;

  const shutdownPromises = Array.from(activeWorkers).map(worker => {
    return new Promise<void>((resolve) => {
      let messageHandler: ((message: any) => void) | undefined;
      
      const timeoutId = setTimeout(() => {
        worker.removeListener("message", messageHandler!);
        worker.removeAllListeners();
        try {
          worker.terminate();
        } catch (error) {
          // Ignore termination errors
        }
        activeWorkers.delete(worker);
        resolve();
      }, timeout);

      messageHandler = (message: any) => {
        if (message.type === "SHUTDOWN_COMPLETE") {
          clearTimeout(timeoutId);
          worker.removeListener("message", messageHandler!);
          worker.removeAllListeners();
          activeWorkers.delete(worker);
          resolve();
        }
      };

      worker.on("message", messageHandler);
      
      // Send graceful shutdown message
      try {
        worker.postMessage({
          type: "SHUTDOWN",
          id: "*",
        });
      } catch (error) {
        // If we can't send the message, force terminate
        clearTimeout(timeoutId);
        worker.removeListener("message", messageHandler!);
        worker.removeAllListeners();
        try {
          worker.terminate();
        } catch (terminateError) {
          // Ignore termination errors
        }
        activeWorkers.delete(worker);
        resolve();
      }
    });
  });

  await Promise.all(shutdownPromises);
  activeWorkers.clear();
}


type CreateWorkerSuccess = {
  type: "success";
  workerPath: string;
  reason?: never;
  error?: never;
  worker: Worker;
};

type CreateWorkerError = {
  type: "error";
  workerPath: string;
  error: Error | null;
  worker?: never;
  reason?: never;
};

type CreateWorkerSkip = {
  type: "skip";
  reason: string;
  workerPath: string;
  worker?: never;
  error?: never;
};

export type CreateWorkerReturn =
  | CreateWorkerSuccess
  | CreateWorkerError
  | CreateWorkerSkip;

export type CreateWorkerOptions = {
  projectRoot?: string;
  currentCondition?: ReactCondition;
  nodePath?: string;
  nodeOptions?: string[];
  envPrefix?: string;
  mode?: "production" | "development" | "test";
  reverseCondition?: string;
  maxListeners?: number;
  workerPath?: string;
  resourceLimits?: ResourceLimits;
  typescript?: boolean;
  htmlChunkSize?: number; // Size of HTML chunks in bytes
  workerData: {
    userOptions?: SerializedUserOptions;
    resolvedConfig?: SerializedResolvedConfig;
    configEnv?: ConfigEnv;
    reactVersion?: string;
    id?: string;
    serverManifest?: Manifest;
    bundle?: OutputBundle;
    staticBundle?: OutputBundle;
    serverPipeableStreamOptions?: any;
    clientPipeableStreamOptions?: any;
    hmrPort?: MessagePort;
    runnerPort?: MessagePort;
  };
  transferList?: TransferListItem[];
  logger?: Logger;
  verbose?: boolean;
};

export type CreateWorkerFn = (
  options: CreateWorkerOptions
) => Promise<CreateWorkerReturn>;

export const createWorker: CreateWorkerFn = async function _createWorker(
  options
) {
  const {
    projectRoot = process.cwd(),
    nodePath = getNodePath(projectRoot),
    currentCondition = getCondition(),
    envPrefix = DEFAULT_CONFIG.ENV_PREFIX,
    reverseCondition = currentCondition === REACT_CONDITION.server
      ? REACT_CONDITION.client
      : REACT_CONDITION.server,
    maxListeners = 100,
    mode = getMode(),
    workerPath,
    resourceLimits = {
      maxOldGenerationSizeMb: 128,
      maxYoungGenerationSizeMb: 64,
    },
    htmlChunkSize = 8 * 1024,
    transferList = [],
    logger = createLogger(),
    verbose = false,
  } = options;
  const id = reverseCondition === REACT_CONDITION.server ? "worker/rsc" : "worker/html";
  let workerPathWithDefault =
    typeof workerPath === "string" ? workerPath : undefined;
  if (!workerPathWithDefault) {
    // Use the default worker paths that include the full filename
    const isProduction = mode === "production";
    const workerFileName =
      reverseCondition === REACT_CONDITION.server
        ? `rsc-worker.${isProduction ? "production" : "development"}.js`
        : `html-worker.${isProduction ? "production" : "development"}.js`;

    // Try source directory first
    const sourcePath = join(pluginRoot, id, workerFileName);

    // Always log the paths for debugging
    if (verbose) {
      logger.info(
        `[create:${id}] Checking paths - Source: ${sourcePath}, PluginRoot: ${pluginRoot}`
      );
    }

    // If source path doesn't exist, try built directory
    if (!existsSync(sourcePath)) {
      throw new Error(
        `[create:${id}] Worker file doesn't exist: ${sourcePath}`
      );
      // const builtPath = join(pluginRoot.replace("/plugin/", "/dist/plugin/"), id, workerFileName);
      // logger.info(`[create:${id}] Source path doesn't exist, checking built path: ${builtPath}`);

      // if (existsSync(builtPath)) {
      //   workerPathWithDefault = builtPath;
      //   logger.info(`[create:${id}] Using built worker path: ${builtPath}`);
      // } else {
      //   workerPathWithDefault = sourcePath; // Fallback to source path for error message
      //   logger.info(`[create:${id}] Neither source nor built path exists. Source: ${sourcePath}, Built: ${builtPath}`);
      // }
    } else {
      workerPathWithDefault = sourcePath;
      if (verbose) {
        logger.info(`[create:${id}] Using source worker path: ${sourcePath}`);
      }
    }
  }
  if (!workerPathWithDefault.startsWith("/")) {
    workerPathWithDefault = join("./", workerPathWithDefault);
  }
  // Ensure worker uses the same React version
  const workerData = {
    ...options.workerData,
    id: options.workerData.id ?? id,
  };

  try {
    // Ensure consistent NODE_ENV between main thread and worker

    if (verbose) {
      logger.info(
        `[create:${id}] workerData.userOptions.build:
${JSON.stringify(workerData.userOptions?.build)}

Call stack: ${new Error().stack?.split("\n").slice(1, 4).join("\n")}
Creating worker with path: ${workerPathWithDefault}
Node environment: ${mode}
Current condition: ${currentCondition}, Reverse condition: ${reverseCondition}`
      );
    }

    // Compute execArgv for the worker with exactly one --conditions flag
    const stripConditionsFromArgv = (argv: string[]) => {
      const out: string[] = [];
      for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--conditions" || arg === "-C") {
          i++; // skip value
          continue;
        }
        if (arg.startsWith("--conditions=")) {
          continue;
        }
        out.push(arg);
      }
      return out;
    };
    // Register vendor resolution hook so the worker can find react-server-dom-esm
    const vendorRegisterPath = new URL("../vendor/register-vendor.js", import.meta.url).href;
    const computedExecArgv = [
      ...stripConditionsFromArgv(process.execArgv || []),
      "--conditions",
      reverseCondition,
      "--import",
      vendorRegisterPath,
    ];

    // Always log the condition setup for debugging
    if (verbose) {
      logger.info(
        `[create:${id}] Setting up worker with reverse condition: ${reverseCondition}`
      );
      logger.info(
        `[create:${id}] Computed execArgv: ${JSON.stringify(computedExecArgv)}`
      );
      logger.info(
        `[create:${id}] Current NODE_OPTIONS: ${process.env["NODE_OPTIONS"]}`
      );
    }

    const env = {
      // Inherit all existing environment variables
      ...process.env,

      // Override with our specific variables
      [envPrefix + "DEV"]: mode === "development" ? "1" : "0",
      [envPrefix + "MODE"]: mode,
      [envPrefix + "PROD"]: mode === "production" ? "1" : "0",
      [envPrefix + "SSR"]: "true",
      [envPrefix + "BASE_URL"]: workerData.userOptions?.moduleBaseURL ?? "",
      [envPrefix + "PUBLIC_ORIGIN"]: workerData.userOptions?.publicOrigin ?? "",
      // Workers must run the SAME React dev/prod variant the parent locked
      // into its CJS cache — a parent rendering with dev React feeding an
      // html worker that resolved prod React can't consume the stream
      // (NODE_ENV may have flipped between plugin import and worker spawn).
      // The parent's NODE_ENV passes through VERBATIM when it already maps
      // to the locked variant (preserving values like "test" that user code
      // branches on); the locked mode only overrides on a genuine variant
      // conflict or when NODE_ENV is unset.
      NODE_ENV: workerNodeEnv(),
      NODE_PATH: nodePath,

      // Ensure NODE_OPTIONS has the correct condition
      NODE_OPTIONS: process.env["NODE_OPTIONS"]?.includes(reverseCondition)
        ? process.env["NODE_OPTIONS"]
        : currentCondition != null &&
          process.env["NODE_OPTIONS"]?.includes(currentCondition)
        ? process.env["NODE_OPTIONS"]?.replaceAll(
            currentCondition,
            reverseCondition
          )
        : `${
            process.env["NODE_OPTIONS"] ?? ""
          } --conditions ${reverseCondition}`,
      HTML_CHUNK_SIZE: htmlChunkSize.toString(),
    };

    if (verbose) {
      // Always log the NODE_OPTIONS for debugging
      logger.info(
        `[create:${id}] Worker NODE_OPTIONS will be: ${env.NODE_OPTIONS}`
      );
      logger.info(
        `[create:${id}] Environment variables: ${Object.keys(env).join(", ")}`
      );
      logger.info(`[create:${id}] execArgv: ${computedExecArgv.join(" ")}`);
    }

    // Create worker with proper environment and loaders
    const worker = new Worker(workerPathWithDefault, {
      env,
      execArgv: computedExecArgv,
      resourceLimits,
      workerData,
      transferList,
    });

    // Register worker for graceful shutdown
    activeWorkers.add(worker);

    worker.setMaxListeners(maxListeners);

    if (verbose) {
      logger.info(
        `[create:${id}] Worker created, waiting for READY message...`
      );
    }

    return await new Promise<CreateWorkerSuccess | CreateWorkerSkip>(
      (resolve, reject) => {
        // Use appropriate timeout based on worker type. Fall back to the
        // DEFAULT_CONFIG value when the caller didn't pre-resolve it — createWorker
        // is a public entry (exported as `vite-plugin-react-server/worker`), and
        // an undefined timeout makes `setTimeout(reject, undefined)` fire on the
        // next tick, so the worker "times out" before it can even start.
        const workerType = reverseCondition === REACT_CONDITION.server ? "rsc" : "html";
        const startupTimeout =
          (workerType === "rsc"
            ? options.workerData.userOptions?.rscWorkerStartupTimeout
            : options.workerData.userOptions?.htmlWorkerStartupTimeout) ??
          (workerType === "rsc"
            ? DEFAULT_CONFIG.RSC_WORKER_STARTUP_TIMEOUT
            : DEFAULT_CONFIG.HTML_WORKER_STARTUP_TIMEOUT);

        const timeout = setTimeout(() => {
          reject({
            type: "error",
            error: new Error(
              `Worker ready timeout after ${startupTimeout}ms (worker/${workerType})`
            ),
          });
        }, startupTimeout);
        const exitHandler = (code: number) => {
          clearTimeout(timeout);
          worker.removeListener("message", messageHandler);
          // Remove worker from registry when it exits
          activeWorkers.delete(worker);
          // Do not remove exit handler here, let it fire if needed
          if (code !== 0) {
            reject({
              type: "error",
              error: new Error(
                `[create:${id}] Worker exited with code ${code}`
              ),
              workerPath: workerPathWithDefault,
            });
          }
        };
        const messageHandler = (
          msg: RscWorkerOutputMessage | HtmlWorkerOutputMessage
        ) => {
          if (verbose)
            logger.info(`[create:${id}] Initial worker message ${msg.type}`);
          if (msg.type === "READY" && msg.id === id) {
            if (verbose)
              logger.info(`[create:${id}] Worker running for ${msg.env}`);
            clearTimeout(timeout);
            worker.removeListener("message", messageHandler);
            worker.removeListener("exit", exitHandler);
            // Compare against the NODE_ENV we spawned the worker with (the
            // locked React-family variant), not the vite mode — the two
            // legitimately differ when NODE_ENV flipped after plugin import
            // and the process is locked to the React it already loaded.
            if (msg.env !== env.NODE_ENV) {
              if (verbose)
                logger.info(`[create:${id}] Worker environment mismatch.`);
              reject({
                type: "error",
                error: new Error(
                  `Worker environment mismatch: ${msg.env} !== ${env.NODE_ENV}`
                ),
                workerPath: workerPathWithDefault,
              } satisfies CreateWorkerError);
            }
            resolve({
              type: "success",
              worker,
              workerPath: workerPathWithDefault,
            } satisfies CreateWorkerSuccess);
          }
        };
        worker.once("message", messageHandler);
        worker.once("exit", exitHandler);
        worker.on("error", (err) => {
          // Remove worker from registry on error
          activeWorkers.delete(worker);
          
          if (verbose && err != null) {
            logger.error(
              `[create:${id}] Worker error: ${err.message}.\n${err.stack}`,
              { error: err }
            );
          }
          const panicError = handleError({
            error: err,
            logger: logger,
            panicThreshold: workerData.userOptions?.panicThreshold,
            critical: false,
            context: `Worker thread error for route ${id}`,
          });
          if (panicError != null) {
            if (verbose) {
              logger.error(
                `[create:${id}] Panic error detected: ${panicError.message}`,
                { error: panicError }
              );
            }
            reject({
              type: "error",
              error: err,
              workerPath: workerPathWithDefault,
            });
          }
          reject({
            type: "error",
            error: new Error("Worker thread error", { cause: err }),
            workerPath: workerPathWithDefault,
          });
        });
      }
    );
  } catch (rawError) {
    // The startup Promise rejects with a { type: "error", error: Error } shape
    // (timeout / non-zero exit / worker 'error'). Unwrap it to the real Error so
    // the cause survives instead of being stringified to "[object Object]".
    const error =
      rawError &&
      typeof rawError === "object" &&
      "error" in rawError &&
      (rawError as { error?: unknown }).error instanceof Error
        ? (rawError as { error: Error }).error
        : rawError;
    if (verbose) {
      logger.error(
        `[create:${id}] Caught error during worker creation: ${
          toError(error).message
        }`,
        { error: error instanceof Error ? error : new Error(String(error)) }
      );
    }
    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: workerData.userOptions?.panicThreshold,
      critical: false,
      context: `Worker thread error for route ${id}`,
    });
    if (panicError != null) {
      if (verbose) {
        logger.error(
          `[create:${id}] Panic error in catch block: ${panicError.message}`,
          { error: panicError }
        );
      }
      return {
        type: "error",
        error: panicError,
        workerPath: workerPathWithDefault,
      };
    }
    return {
      type: "error",
      error: error instanceof Error ? error : new Error(String(error)),
      workerPath: workerPathWithDefault,
    };
  }
};
