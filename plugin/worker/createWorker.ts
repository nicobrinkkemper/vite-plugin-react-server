import {
  Worker,
  type ResourceLimits,
  type TransferListItem,
} from "node:worker_threads";
import { getMode, getNodePath } from "../config/getPaths.js";
import { getCondition } from "../config/getCondition.js";
import { join } from "node:path";
import { pluginRoot } from "../root.js";
import * as React from "react";
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
  mode?: "production" | "development";
  reverseCondition?: string;
  maxListeners?: number;
  workerPath?: string;
  resourceLimits?: ResourceLimits;
  typescript?: boolean;
  htmlChunkSize?: number; // Size of HTML chunks in bytes
  workerData: {
    userOptions: SerializedUserOptions;
    resolvedConfig: SerializedResolvedConfig;
    reactVersion?: string;
    id?: string;
    serverManifest?: Manifest;
    bundle?: OutputBundle;
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
    workerPathWithDefault = join(pluginRoot, id);
  }
  if (!workerPathWithDefault.startsWith("/")) {
    workerPathWithDefault = join("./", workerPathWithDefault);
  }
  // Ensure worker uses the same React version
  const workerData = {
    userOptions: options.workerData.userOptions,
    resolvedConfig: options.workerData.resolvedConfig,
    reactVersion: options.workerData.reactVersion ?? React.version,
    id: options.workerData.id ?? id,
    serverManifest: options.workerData.serverManifest,
    bundle: options.workerData.bundle,
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

    const env = {
      [envPrefix + "DEV"]: mode === "development" ? "1" : "0",
      [envPrefix + "MODE"]: mode,
      [envPrefix + "PROD"]: mode === "production" ? "1" : "0",
      [envPrefix + "SSR"]: "true",
      [envPrefix + "BASE_URL"]: workerData.userOptions.moduleBaseURL ?? "",
      [envPrefix + "PUBLIC_ORIGIN"]: workerData.userOptions.publicOrigin ?? "",
      NODE_ENV: nodeEnv,
      NODE_PATH: nodePath,
      NODE_OPTIONS: process.env["NODE_OPTIONS"]?.includes(reverseCondition)
        ? process.env["NODE_OPTIONS"]
        : process.env["NODE_OPTIONS"]?.includes(currentCondition)
        ? process.env["NODE_OPTIONS"]?.replace(
            currentCondition,
            reverseCondition
          )
        : `${
            process.env["NODE_OPTIONS"] ?? ""
          } --conditions ${reverseCondition}`,
      HTML_CHUNK_SIZE: htmlChunkSize.toString(),
    };

    if (verbose) {
      logger.info(`[create:${id}] Environment variables: ${Object.keys(env).join(', ')}`);
      logger.info(`[create:${id}] NODE_OPTIONS: ${env.NODE_OPTIONS}`);
    }

    // Create worker with proper environment and loaders
    const worker = new Worker(workerPathWithDefault, {
      env,
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
        ? options.workerData.userOptions.rscWorkerStartupTimeout 
        : options.workerData.userOptions.htmlWorkerStartupTimeout;
      
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
          panicThreshold: workerData.userOptions.panicThreshold,
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
      });
    });
  } catch (error) {
    if (verbose) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[create:${id}] Caught error during worker creation: ${errorMessage}`, { error: error instanceof Error ? error : new Error(String(error)) });
    }
    const panicError = handleError({
      error: error,
      logger: logger,
      panicThreshold: workerData.userOptions.panicThreshold,
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
