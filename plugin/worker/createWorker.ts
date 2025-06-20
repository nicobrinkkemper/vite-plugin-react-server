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
import { toError } from "../error/toError.js";
import type {
  SerializedResolvedConfig,
  SerializedUserOptions,
} from "../types.js";

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
  error: Error;
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
  };

  try {
    // Ensure consistent NODE_ENV between main thread and worker
    const isTestEnv =
      process.env["VITEST"] || process.env["NODE_ENV"] === "test";
    const nodeEnv = isTestEnv ? "test" : mode;

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

    // Create worker with proper environment and loaders
    const worker = new Worker(workerPathWithDefault, {
      env,
      resourceLimits,
      workerData,
      transferList,
    });

    worker.setMaxListeners(maxListeners);

    // Wait for worker to be ready
    return await new Promise<CreateWorkerSuccess | CreateWorkerSkip>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject({ type: "error", error: new Error("Worker ready timeout") });
        }, 5000);
        const exitHandler = (code: number) => {
          clearTimeout(timeout);
          worker.removeListener("message", messageHandler);
          worker.removeListener("exit", exitHandler);
          if (code === 0) {
            resolve({
              type: "skip",
              reason: "Worker exited with code 0",
              workerPath: workerPathWithDefault,
            } satisfies CreateWorkerSkip);
          } else {
            const error = `[create:${id}] exited with code ${code}`;
            resolve({
              type: "skip",
              reason: error,
              workerPath: workerPathWithDefault,
            } satisfies CreateWorkerSkip);
          }
        };
        const messageHandler = (
          msg: HtmlWorkerOutputMessage | RscWorkerOutputMessage
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
      }
    );
  } catch (error) {
    return {
      type: "error",
      error: toError(error),
      workerPath: workerPathWithDefault,
    };
  }
};
