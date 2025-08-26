import {
  Worker,
  type ResourceLimits,
  type TransferListItem,
} from "node:worker_threads";
import type { ConfigEnv } from "vite";
import { getMode, getNodePath } from "../config/getPaths.js";
import { getCondition } from "../config/getCondition.js";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { pluginRoot } from "../root.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
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
  currentCondition?: "react-server" | "react-client";
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
    reverseCondition = currentCondition === "react-server"
      ? "react-client"
      : "react-server",
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
  const id = reverseCondition === "react-server" ? "worker/rsc" : "worker/html";
  let workerPathWithDefault =
    typeof workerPath === "string" ? workerPath : undefined;
  if (!workerPathWithDefault) {
    // Use the default worker paths that include the full filename
    const isProduction = mode === "production";
    const workerFileName = reverseCondition === "react-server" 
      ? `rsc-worker.${isProduction ? "production" : "development"}.js`
      : `html-worker.${isProduction ? "production" : "development"}.js`;
    
    // Try source directory first
    const sourcePath = join(pluginRoot, id, workerFileName);
    
    // Always log the paths for debugging
    if(verbose) {
      logger.info(`[create:${id}] Checking paths - Source: ${sourcePath}, PluginRoot: ${pluginRoot}`);
    }
    
    // If source path doesn't exist, try built directory
    if (!existsSync(sourcePath)) {
      throw new Error(`[create:${id}] Worker file doesn't exist: ${sourcePath}`);
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
      if(verbose) {
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
    const isTestEnv =
      process.env["VITEST"] || process.env["NODE_ENV"] === "test";
    const nodeEnv = isTestEnv ? "test" : mode;

    if (verbose) {
      logger.info(`[create:${id}] Creating worker with path: ${workerPathWithDefault}`);
      logger.info(`[create:${id}] Node environment: ${nodeEnv}`);
      logger.info(`[create:${id}] Current condition: ${currentCondition}, Reverse condition: ${reverseCondition}`);
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
    const computedExecArgv = [
      ...stripConditionsFromArgv(process.execArgv || []),
      "--conditions",
      reverseCondition,
    ];
    
    // Always log the condition setup for debugging
    if(verbose) {
      logger.info(`[create:${id}] Setting up worker with reverse condition: ${reverseCondition}`);
      logger.info(`[create:${id}] Computed execArgv: ${JSON.stringify(computedExecArgv)}`);
      logger.info(`[create:${id}] Current NODE_OPTIONS: ${process.env["NODE_OPTIONS"]}`);
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
      NODE_ENV: process.env["NODE_ENV"] ?? 'production',
      NODE_PATH: nodePath,
      
      // Ensure NODE_OPTIONS has the correct condition
      NODE_OPTIONS: process.env["NODE_OPTIONS"]?.includes(reverseCondition)
        ? process.env["NODE_OPTIONS"]
        : currentCondition != null && process.env["NODE_OPTIONS"]?.includes(currentCondition)
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
      logger.info(`[create:${id}] Worker NODE_OPTIONS will be: ${env.NODE_OPTIONS}`);
      logger.info(`[create:${id}] Environment variables: ${Object.keys(env).join(', ')}`);
      logger.info(`[create:${id}] execArgv: ${computedExecArgv.join(' ')}`);
    }

    // Create worker with proper environment and loaders
    const worker = new Worker(workerPathWithDefault, {
      env,
      execArgv: computedExecArgv,
      resourceLimits,
      workerData,
      transferList,
    });

    worker.setMaxListeners(maxListeners);

    if (verbose) {
      logger.info(`[create:${id}] Worker created, waiting for READY message...`);
    }

    return await new Promise<CreateWorkerSuccess | CreateWorkerSkip>((resolve, reject) => {
      // Use appropriate timeout based on worker type
      const workerType = reverseCondition === "react-server" ? "rsc" : "html";
      const startupTimeout = workerType === "rsc" 
        ? options.workerData.userOptions?.rscWorkerStartupTimeout 
        : options.workerData.userOptions?.htmlWorkerStartupTimeout;
      
      const timeout = setTimeout(() => {
        reject({ type: "error", error: new Error("Worker ready timeout") });
      }, startupTimeout);
      const exitHandler = (code: number) => {
        clearTimeout(timeout);
        worker.removeListener("message", messageHandler);
        // Do not remove exit handler here, let it fire if needed
        if (code !== 0) {
          reject({
            type: "error",
            error: new Error(`[create:${id}] Worker exited with code ${code}`),
            workerPath: workerPathWithDefault,
          });
        }
      };
      const messageHandler = (
        msg: RscWorkerOutputMessage | HtmlWorkerOutputMessage
      ) => {
        if (verbose)
          logger.info(`[create:${id}] Initial worker message ${msg.type}`);
        if (msg.type === "READY") {
          if (verbose)
            logger.info(`[create:${id}] Worker running for ${msg.env}`);
          clearTimeout(timeout);
          worker.removeListener("message", messageHandler);
          worker.removeListener("exit", exitHandler);
          if (msg.env !== nodeEnv) {
            if (verbose)
              logger.info(`[create:${id}] Worker environment mismatch.`);
            reject({
              type: "error",
              error: new Error(
                `Worker environment mismatch: ${msg.env} !== ${nodeEnv}`
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
      worker.on('error', (err) => {
        if (verbose) {
          logger.error(`[create:${id}] Worker error: ${err.message}`, { error: err });
        }
        const panicError = handleError({
          error: err,
          logger: logger,
          panicThreshold: workerData.userOptions?.panicThreshold,
          critical: false,
          context: `Worker thread error for route ${id}`,
        });
        if(panicError != null) {
          if (verbose) {
            logger.error(`[create:${id}] Panic error detected: ${panicError.message}`, { error: panicError });
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
    });
  } catch (error) {
    if (verbose) {
      logger.error(`[create:${id}] Caught error during worker creation: ${toError(error).message}`, { error: error instanceof Error ? error : new Error(String(error)) });
    }
    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: workerData.userOptions?.panicThreshold,
      critical: false,
      context: `Worker thread error for route ${id}`,
    });
    if(panicError != null) {
      if (verbose) {
        logger.error(`[create:${id}] Panic error in catch block: ${panicError.message}`, { error: panicError });
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

