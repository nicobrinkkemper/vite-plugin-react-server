import {
  Worker,
  type ResourceLimits,
  type TransferListItem
} from "node:worker_threads";
import { getMode, getNodePath } from "../config/getPaths.js";
import { getCondition } from "../config/getCondition.js";
import { join } from "node:path";
import { pluginRoot } from "../root.js";
import * as React from "react";

export type CreateWorkerOptions = {
  projectRoot?: string;
  currentCondition?: "react-server" | "react-client";
  nodePath?: string;
  nodeOptions?: string[];
  mode?: "production" | "development";
  reverseCondition?: string;
  maxListeners?: number;
  workerPath?: string;
  resourceLimits?: ResourceLimits;
  typescript?: boolean;
  htmlChunkSize?: number; // Size of HTML chunks in bytes
  workerData?: any;
  transferList?: TransferListItem[];
};

type CreateWorkerSuccess = {
  type: "success";
  workerPath: string;
  worker: Worker;
};

type CreateWorkerError = {
  type: "error";
  workerPath: string;
  error: Error;
};

type CreateWorkerSkip = {
  type: "skip";
  reason: string;
  workerPath: string;
};

export async function createWorker(
  options: CreateWorkerOptions
): Promise<CreateWorkerSuccess | CreateWorkerError | CreateWorkerSkip> {
  const {
    projectRoot = process.cwd(),
    nodePath = getNodePath(projectRoot),
    currentCondition = getCondition(),
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
    transferList = []
  } = options;
  let workerPathWithDefault =
    typeof workerPath === "string" ? workerPath : undefined;
  if (!workerPathWithDefault) {
    if (currentCondition === "react-server") {
      workerPathWithDefault = join(pluginRoot, `worker/rsc`);
    } else {
      workerPathWithDefault = join(pluginRoot, `worker/html`);
    }
  }
  if (!workerPathWithDefault.startsWith("/")) {
    workerPathWithDefault = join("./", workerPathWithDefault);
  }
  // Ensure worker uses the same React version
  const workerData = {
    ...options.workerData,
    importMeta: {
      env: {
        DEV: mode === 'development' ? 'true' : 'false',
        MODE: mode,
        PROD: mode === 'production' ? 'true' : 'false',
        SSR: true,
        BASE_URL: '/',
      },
    },
    reactVersion: React.version,
    // Pass the project root to the worker
    projectRoot: projectRoot,
  };


  try {

    // Ensure consistent NODE_ENV between main thread and worker
    const isTestEnv =
      process.env["VITEST"] || process.env["NODE_ENV"] === "test";
    const nodeEnv = isTestEnv ? "test" : mode;

    const env = {
      ...process.env,
      BASE_URL: '/',
      VITE_DEV: mode === 'development' ? '1' : '0',
      VITE_MODE: mode,
      VITE_PROD: mode === 'production' ? '1' : '0',
      VITE_SSR: 'true',
      VITE_BASE_URL: '/',
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

        worker.once("message", (msg) => {
          if (msg.type === "READY") {
            clearTimeout(timeout);
            if(msg.env !== nodeEnv) {
              reject({
                type: "error",
                error: new Error(`Worker environment mismatch: ${msg.env} !== ${nodeEnv}`),
                workerPath: workerPathWithDefault,
              } satisfies CreateWorkerError);
            }
            resolve({
              type: "success",
              worker,
              workerPath: workerPathWithDefault,
            } satisfies CreateWorkerSuccess);
          }
        });

        worker.once("exit", (code) => {
          clearTimeout(timeout);
          worker.removeAllListeners();
          if (code === 0) {
            resolve({
              type: "skip",
              reason: "Worker exited with code 0",
              workerPath: workerPathWithDefault,
            } satisfies CreateWorkerSkip);
          } else {
            reject({
              type: "error",
              error: new Error(`Worker exited with code ${code}`),
              workerPath: workerPathWithDefault,
            } satisfies CreateWorkerError);
          }
        });
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      return {
        type: "error",
        workerPath: workerPathWithDefault,
        error: error,
      } satisfies CreateWorkerError;
    }
    return error as CreateWorkerError;
  }
}

